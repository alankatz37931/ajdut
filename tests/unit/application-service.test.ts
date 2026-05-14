import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  application: { findUnique: vi.fn(), update: vi.fn() },
  passwordSetupToken: { create: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    ...tx,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: (cb: any) => cb(tx),
  },
}));

import {
  approveApplication,
  rejectApplication,
} from "@/lib/services/application";
import {
  ForbiddenError,
  IllegalTransition,
  NotFoundError,
  ValidationError,
} from "@/lib/services/errors";

beforeEach(() => {
  for (const model of Object.values(tx)) {
    for (const fn of Object.values(model)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
});

describe("approveApplication — autorización", () => {
  it("rechaza si el actor no es ADMIN", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "PROJECT_OWNER", isActive: true });
    await expect(
      approveApplication({ applicationId: "a1", adminId: "u1", role: "PARTNER" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rechaza si el admin está inactivo", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "ADMIN", isActive: false });
    await expect(
      approveApplication({ applicationId: "a1", adminId: "u1", role: "PARTNER" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("approveApplication — estado de la aplicación", () => {
  beforeEach(() => {
    tx.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true });
  });

  it("rechaza si la aplicación no existe", async () => {
    tx.application.findUnique.mockResolvedValueOnce(null);
    await expect(
      approveApplication({ applicationId: "x", adminId: "a1", role: "PARTNER" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rechaza si ya está APROBADA (no se puede re-aprobar)", async () => {
    tx.application.findUnique.mockResolvedValueOnce({
      id: "a1",
      status: "APPROVED",
      email: "ana@x.com",
      fullName: "Ana",
    });
    await expect(
      approveApplication({ applicationId: "a1", adminId: "a1", role: "PARTNER" })
    ).rejects.toBeInstanceOf(IllegalTransition);
  });

  it("rechaza si fue RECHAZADA", async () => {
    tx.application.findUnique.mockResolvedValueOnce({
      id: "a1",
      status: "REJECTED",
      email: "ana@x.com",
      fullName: "Ana",
    });
    await expect(
      approveApplication({ applicationId: "a1", adminId: "a1", role: "PARTNER" })
    ).rejects.toBeInstanceOf(IllegalTransition);
  });

  it("acepta PENDING y UNDER_REVIEW", async () => {
    for (const s of ["PENDING", "UNDER_REVIEW"]) {
      tx.user.findUnique
        .mockResolvedValueOnce({ role: "ADMIN", isActive: true }) // assertAdmin
        .mockResolvedValueOnce(null); // no existing user
      tx.application.findUnique.mockResolvedValueOnce({
        id: "a1",
        status: s,
        email: "ana@x.com",
        fullName: "Ana",
      });
      tx.user.create.mockResolvedValueOnce({ id: "u-new", email: "ana@x.com" });
      tx.passwordSetupToken.create.mockResolvedValueOnce({ id: "t-new" });

      await expect(
        approveApplication({ applicationId: "a1", adminId: "a1", role: "PARTNER" })
      ).resolves.toBeDefined();
    }
  });
});

describe("approveApplication — anti-doble-registro", () => {
  beforeEach(() => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "ADMIN", isActive: true });
    tx.application.findUnique.mockResolvedValueOnce({
      id: "a1",
      status: "PENDING",
      email: "ana@x.com",
      fullName: "Ana",
    });
  });

  it("rechaza si ya existe un User con ese email", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ id: "u-existing" });
    await expect(
      approveApplication({ applicationId: "a1", adminId: "a1", role: "PARTNER" })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("approveApplication — efectos del happy path", () => {
  beforeEach(() => {
    tx.user.findUnique
      .mockResolvedValueOnce({ role: "ADMIN", isActive: true })
      .mockResolvedValueOnce(null); // no existing user
    tx.application.findUnique.mockResolvedValueOnce({
      id: "a1",
      status: "PENDING",
      email: "ana@x.com",
      fullName: "Ana Inversor",
    });
    tx.user.create.mockResolvedValue({ id: "u-new", email: "ana@x.com" });
    tx.passwordSetupToken.create.mockResolvedValue({ id: "t-new" });
  });

  it("crea User SIN passwordHash (passwordHash: null)", async () => {
    await approveApplication({ applicationId: "a1", adminId: "a1", role: "PARTNER" });

    const userCreateCall = tx.user.create.mock.calls[0]?.[0];
    expect(userCreateCall.data.email).toBe("ana@x.com");
    expect(userCreateCall.data.passwordHash).toBeNull();
    expect(userCreateCall.data.role).toBe("PARTNER");
  });

  it("crea PasswordSetupToken con kind=INITIAL_SETUP (TTL 72h)", async () => {
    await approveApplication({ applicationId: "a1", adminId: "a1", role: "PARTNER" });

    const tokenCall = tx.passwordSetupToken.create.mock.calls[0]?.[0];
    expect(tokenCall.data.kind).toBe("INITIAL_SETUP");

    const expiresAt = tokenCall.data.expiresAt as Date;
    const ttlMs = expiresAt.getTime() - Date.now();
    // Margen amplio: entre 71h y 73h
    expect(ttlMs).toBeGreaterThan(71 * 3600 * 1000);
    expect(ttlMs).toBeLessThan(73 * 3600 * 1000);
  });

  it("marca Application APPROVED con reviewedBy y reviewedAt", async () => {
    await approveApplication({ applicationId: "a1", adminId: "a1", role: "PARTNER" });

    expect(tx.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({
          status: "APPROVED",
          reviewedById: "a1",
        }),
      })
    );
  });

  it("auditoría: APPLICATION.APPROVED + USER.CREATED", async () => {
    await approveApplication({ applicationId: "a1", adminId: "a1", role: "PARTNER" });
    const actions = tx.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(actions).toContain("APPLICATION.APPROVED");
    expect(actions).toContain("USER.CREATED");
  });

  it("devuelve el token plano y expiresAt para el email", async () => {
    const r = await approveApplication({ applicationId: "a1", adminId: "a1", role: "PARTNER" });
    expect(r.userId).toBe("u-new");
    expect(typeof r.setupToken).toBe("string");
    expect(r.setupToken.length).toBeGreaterThan(20); // base64url de 32 bytes
    expect(r.expiresAt).toBeInstanceOf(Date);
  });
});

describe("rejectApplication", () => {
  it("rechaza si nota < 10 chars", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "ADMIN", isActive: true });
    tx.application.findUnique.mockResolvedValueOnce({ id: "a1", status: "PENDING" });
    await expect(
      rejectApplication({ applicationId: "a1", adminId: "a1", rejectionNote: "corto" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza si la application ya fue procesada", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "ADMIN", isActive: true });
    tx.application.findUnique.mockResolvedValueOnce({ id: "a1", status: "APPROVED" });
    await expect(
      rejectApplication({
        applicationId: "a1",
        adminId: "a1",
        rejectionNote: "razón válida de rechazo",
      })
    ).rejects.toBeInstanceOf(IllegalTransition);
  });

  it("happy path: marca REJECTED con nota + audit", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ role: "ADMIN", isActive: true });
    tx.application.findUnique.mockResolvedValueOnce({ id: "a1", status: "PENDING" });

    await rejectApplication({
      applicationId: "a1",
      adminId: "a1",
      rejectionNote: "razón válida de rechazo",
    });

    expect(tx.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({
          status: "REJECTED",
          rejectionNote: "razón válida de rechazo",
        }),
      })
    );
    const actions = tx.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(actions).toContain("APPLICATION.REJECTED");
  });
});
