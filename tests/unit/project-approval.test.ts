import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  project: { findUnique: vi.fn(), update: vi.fn() },
  participation: { create: vi.fn() },
  ownershipHistory: { create: vi.fn() },
  chatChannel: { findUnique: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  // `ensureProjectClasses` asegura las 4 clases canónicas al aprobar.
  shareholderClass: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    ...tx,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: (cb: any) => cb(tx),
  },
}));

import { approveProject } from "@/lib/services/project-approval";
import { ForbiddenError, InvariantViolation, NotFoundError } from "@/lib/services/errors";
import { Prisma } from "@prisma/client";

function makeAdmin(extra: Partial<{ isActive: boolean; role: string }> = {}) {
  return { role: "ADMIN", isActive: true, ...extra };
}

function makeProject(overrides: Partial<{ totalShares: number; status: string; kind: string }> = {}) {
  return {
    id: "project-1",
    slug: "pushka",
    status: overrides.status ?? "PENDING_APPROVAL",
    kind: overrides.kind ?? "STARTUP",
    totalShares: overrides.totalShares ?? 1_250_000,
    startupProfile: {
      id: "sp-1",
      // platformEquityPercent ya no se usa en el flujo de aprobación, pero
      // dejamos el campo para reflejar el shape real de la query.
      platformEquityPercent: new Prisma.Decimal(0),
    },
  };
}

beforeEach(() => {
  for (const model of Object.values(tx)) {
    for (const fn of Object.values(model)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
  // `ensureProjectClasses`: por defecto el proyecto no tiene clases → las crea.
  tx.shareholderClass.findMany.mockResolvedValue([]);
  tx.shareholderClass.create.mockResolvedValue({ id: "class-x" });
});

describe("approveProject — autorización", () => {
  it("rechaza si actor no es ADMIN", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "PROJECT_OWNER", isActive: true });
    await expect(
      approveProject({ projectId: "p1", adminId: "user-1" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rechaza si admin está inactivo", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "ADMIN", isActive: false });
    await expect(
      approveProject({ projectId: "p1", adminId: "admin-1" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("approveProject — validaciones de estado", () => {
  it("rechaza si el proyecto no existe", async () => {
    tx.user.findUnique.mockResolvedValueOnce(makeAdmin());
    tx.project.findUnique.mockResolvedValueOnce(null);
    await expect(
      approveProject({ projectId: "x", adminId: "admin-1" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rechaza si proyecto NO está PENDING_APPROVAL (ej. ya ACTIVE)", async () => {
    tx.user.findUnique.mockResolvedValueOnce(makeAdmin());
    tx.project.findUnique.mockResolvedValueOnce(makeProject({ status: "ACTIVE" }));
    await expect(
      approveProject({ projectId: "p1", adminId: "admin-1" })
    ).rejects.toBeInstanceOf(InvariantViolation);
  });
});

describe("approveProject — materialización del pool inicial", () => {
  function setupHappyPath(totalShares: number) {
    tx.user.findUnique.mockResolvedValueOnce(makeAdmin()); // assertAdmin
    tx.project.findUnique.mockResolvedValueOnce(makeProject({ totalShares }));
    tx.participation.create.mockResolvedValueOnce({ id: "part-pool" });
    tx.chatChannel.findUnique.mockResolvedValueOnce(null);
  }

  it("NO emite Participation institucional para AJDUT (sin stake automático)", async () => {
    setupHappyPath(1_250_000);
    await approveProject({ projectId: "p1", adminId: "admin-1" });

    const calls = tx.participation.create.mock.calls;
    // Solo se crea una participación: el pool AVAILABLE.
    expect(calls.length).toBe(1);
    const first = calls[0]?.[0];
    expect(first.data.isPlatformStake).toBe(false);
    expect(first.data.status).toBe("AVAILABLE");
  });

  it("el pool AVAILABLE recibe el 100% del total de acciones", async () => {
    setupHappyPath(1_250_000);
    await approveProject({ projectId: "p1", adminId: "admin-1" });

    const poolCall = tx.participation.create.mock.calls[0]?.[0];
    expect(poolCall.data.shareCount).toBe(1_250_000);
    expect(poolCall.data.status).toBe("AVAILABLE");
    expect(poolCall.data.isPlatformStake).toBe(false);
  });

  it("NO registra OwnershipHistory (no hay stake institucional auto-emitido)", async () => {
    setupHappyPath(1_250_000);
    await approveProject({ projectId: "p1", adminId: "admin-1" });
    expect(tx.ownershipHistory.create).not.toHaveBeenCalled();
  });

  it("crea el ChatChannel si no existe", async () => {
    setupHappyPath(1_250_000);
    await approveProject({ projectId: "p1", adminId: "admin-1" });
    expect(tx.chatChannel.create).toHaveBeenCalledWith({
      data: { projectId: "project-1" },
    });
  });

  it("NO duplica el ChatChannel si ya existe", async () => {
    tx.user.findUnique.mockResolvedValueOnce(makeAdmin());
    tx.project.findUnique.mockResolvedValueOnce(makeProject());
    tx.participation.create.mockResolvedValueOnce({ id: "part-pool" });
    tx.chatChannel.findUnique.mockResolvedValueOnce({ id: "channel-existing" });

    await approveProject({ projectId: "p1", adminId: "admin-1" });
    expect(tx.chatChannel.create).not.toHaveBeenCalled();
  });

  it("transición final: project.status = ACTIVE con approvedAt y approvedById", async () => {
    setupHappyPath(1_250_000);
    await approveProject({ projectId: "p1", adminId: "admin-1" });

    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "project-1" },
        data: expect.objectContaining({
          status: "ACTIVE",
          approvedById: "admin-1",
        }),
      })
    );
    const updateCall = tx.project.update.mock.calls[0]?.[0];
    expect(updateCall.data.approvedAt).toBeInstanceOf(Date);
  });

  it("registra auditoría PARTICIPATION.CREATED (pool inicial) + PROJECT.APPROVED", async () => {
    setupHappyPath(1_250_000);
    await approveProject({ projectId: "p1", adminId: "admin-1" });
    const actions = tx.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(actions).toContain("PARTICIPATION.CREATED");
    expect(actions).toContain("PROJECT.APPROVED");
  });
});
