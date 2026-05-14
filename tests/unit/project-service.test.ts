import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  project: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  startupProfile: { create: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    ...tx,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: (cb: any) => cb(tx),
  },
}));

import { createProject, rejectProject } from "@/lib/services/project";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/services/errors";

const baseCreateInput = {
  ownerId: "founder-1",
  name: "Pushka SAS",
  oneLiner: "Cobros instantáneos por QR",
  description: "Una descripción más larga",
  sector: "Fintech",
  stage: "SEED" as const,
  problemStatement: "El problema",
  solutionStatement: "La solución",
  businessModel: "El modelo",
  preMoneyValuation: 12_500_000,
  valuationCurrency: "USD" as const,
  legalName: "Pushka SAS",
  jurisdiction: "MX",
};

beforeEach(() => {
  for (const model of Object.values(tx)) {
    for (const fn of Object.values(model)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
});

describe("createProject — validaciones", () => {
  it("rechaza valoración 0 o negativa", async () => {
    await expect(
      createProject({ ...baseCreateInput, preMoneyValuation: 0 })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createProject({ ...baseCreateInput, preMoneyValuation: -100 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza oneLiner > 160 caracteres", async () => {
    await expect(
      createProject({ ...baseCreateInput, oneLiner: "x".repeat(161) })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("createProject — autorización", () => {
  it("rechaza si owner no existe", async () => {
    tx.user.findUnique.mockResolvedValueOnce(null);
    await expect(createProject(baseCreateInput)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rechaza si owner está inactivo", async () => {
    tx.user.findUnique.mockResolvedValueOnce({
      role: "PROJECT_OWNER",
      isActive: false,
      deletedAt: null,
    });
    await expect(createProject(baseCreateInput)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rechaza si owner tiene rol PARTNER (no es founder)", async () => {
    tx.user.findUnique.mockResolvedValueOnce({
      role: "PARTNER",
      isActive: true,
      deletedAt: null,
    });
    await expect(createProject(baseCreateInput)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ADMIN también puede crear proyectos (útil para bootstrap/demo)", async () => {
    tx.user.findUnique.mockResolvedValueOnce({
      role: "ADMIN",
      isActive: true,
      deletedAt: null,
    });
    tx.project.findUnique.mockResolvedValueOnce(null); // slug libre
    tx.project.create.mockResolvedValueOnce({ id: "p-new", slug: "pushka-sas" });
    tx.startupProfile.create.mockResolvedValueOnce({ id: "sp-new" });

    const r = await createProject(baseCreateInput);
    expect(r.totalShares).toBe(1_250_000);
    expect(r.pricePerShare).toBe(10);
  });
});

describe("createProject — slug único con sufijo", () => {
  it("primer slug libre se usa tal cual", async () => {
    tx.user.findUnique.mockResolvedValueOnce({
      role: "PROJECT_OWNER",
      isActive: true,
      deletedAt: null,
    });
    tx.project.findUnique.mockResolvedValueOnce(null); // pushka-sas libre
    tx.project.create.mockResolvedValueOnce({ id: "p1", slug: "pushka-sas" });
    tx.startupProfile.create.mockResolvedValueOnce({ id: "sp1" });

    await createProject(baseCreateInput);
    expect(tx.project.create.mock.calls[0]?.[0].data.slug).toBe("pushka-sas");
  });

  it("si pushka-sas existe, prueba pushka-sas-2, pushka-sas-3...", async () => {
    tx.user.findUnique.mockResolvedValueOnce({
      role: "PROJECT_OWNER",
      isActive: true,
      deletedAt: null,
    });
    tx.project.findUnique
      .mockResolvedValueOnce({ id: "existing-1" }) // pushka-sas tomado
      .mockResolvedValueOnce({ id: "existing-2" }) // pushka-sas-2 tomado
      .mockResolvedValueOnce(null); // pushka-sas-3 libre
    tx.project.create.mockResolvedValueOnce({ id: "p-new", slug: "pushka-sas-3" });
    tx.startupProfile.create.mockResolvedValueOnce({ id: "sp1" });

    await createProject(baseCreateInput);
    expect(tx.project.create.mock.calls[0]?.[0].data.slug).toBe("pushka-sas-3");
  });
});

describe("createProject — efectos", () => {
  beforeEach(() => {
    tx.user.findUnique.mockResolvedValue({
      role: "PROJECT_OWNER",
      isActive: true,
      deletedAt: null,
    });
    tx.project.findUnique.mockResolvedValue(null); // slug libre
    tx.project.create.mockResolvedValue({ id: "p-new", slug: "pushka-sas" });
    tx.startupProfile.create.mockResolvedValue({ id: "sp-new" });
  });

  it("crea proyecto en PENDING_APPROVAL con totalShares derivadas", async () => {
    await createProject(baseCreateInput);

    const projectCall = tx.project.create.mock.calls[0]?.[0];
    expect(projectCall.data.status).toBe("PENDING_APPROVAL");
    expect(projectCall.data.kind).toBe("STARTUP");
    expect(projectCall.data.totalShares).toBe(1_250_000);
  });

  it("crea StartupProfile con los datos del founder", async () => {
    await createProject(baseCreateInput);

    const spCall = tx.startupProfile.create.mock.calls[0]?.[0];
    expect(spCall.data.legalName).toBe("Pushka SAS");
    expect(spCall.data.jurisdiction).toBe("MX");
    expect(spCall.data.totalEquityShares).toBe(1_250_000);
    expect(Number(spCall.data.platformEquityPercent)).toBe(10);
  });

  it("auditoría: PROJECT.CREATED + PROJECT.SUBMITTED_FOR_APPROVAL", async () => {
    await createProject(baseCreateInput);
    const actions = tx.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(actions).toContain("PROJECT.CREATED");
    expect(actions).toContain("PROJECT.SUBMITTED_FOR_APPROVAL");
  });
});

describe("rejectProject", () => {
  it("rechaza si actor no es ADMIN", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "PROJECT_OWNER", isActive: true });
    await expect(
      rejectProject({ projectId: "p1", adminId: "user-1", reason: "razón válida" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rechaza si proyecto no existe", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "ADMIN", isActive: true });
    tx.project.findUnique.mockResolvedValueOnce(null);
    await expect(
      rejectProject({ projectId: "p1", adminId: "admin-1", reason: "razón válida" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rechaza si proyecto NO está PENDING_APPROVAL", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "ADMIN", isActive: true });
    tx.project.findUnique.mockResolvedValueOnce({ status: "ACTIVE" });
    await expect(
      rejectProject({ projectId: "p1", adminId: "admin-1", reason: "razón" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza si reason < 10 caracteres", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "ADMIN", isActive: true });
    tx.project.findUnique.mockResolvedValueOnce({ status: "PENDING_APPROVAL" });
    await expect(
      rejectProject({ projectId: "p1", adminId: "admin-1", reason: "corto" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("happy path: marca CLOSED con suspensionReason + audit", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "ADMIN", isActive: true });
    tx.project.findUnique.mockResolvedValueOnce({ status: "PENDING_APPROVAL" });

    await rejectProject({
      projectId: "p1",
      adminId: "admin-1",
      reason: "razón válida de rechazo",
    });

    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({
          status: "CLOSED",
          suspensionReason: "razón válida de rechazo",
        }),
      })
    );
    const actions = tx.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(actions).toContain("PROJECT.CLOSED");
  });
});
