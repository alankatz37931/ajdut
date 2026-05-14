import { describe, it, expect, vi, beforeEach } from "vitest";

const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  project: { findUnique: vi.fn(), update: vi.fn() },
  participation: { create: vi.fn() },
  ownershipHistory: { create: vi.fn() },
  chatChannel: { findUnique: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
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
      platformEquityPercent: new Prisma.Decimal(10),
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

  it("rechaza si no existe usuario PLATFORM (bootstrap incompleto)", async () => {
    tx.user.findUnique.mockResolvedValueOnce(makeAdmin());
    tx.project.findUnique.mockResolvedValueOnce(makeProject());
    tx.user.findUnique.mockResolvedValueOnce(null); // no platform user
    await expect(
      approveProject({ projectId: "p1", adminId: "admin-1" })
    ).rejects.toBeInstanceOf(InvariantViolation);
  });
});

describe("approveProject — materialización del cap table", () => {
  function setupHappyPath(totalShares: number) {
    tx.user.findUnique.mockResolvedValueOnce(makeAdmin()); // assertAdmin
    tx.project.findUnique.mockResolvedValueOnce(makeProject({ totalShares }));
    tx.user.findUnique.mockResolvedValueOnce({ id: "platform-1" }); // platform user lookup
    tx.participation.create.mockResolvedValueOnce({ id: "part-platform" });
    tx.chatChannel.findUnique.mockResolvedValueOnce(null);
  }

  it("emite EXACTAMENTE 10% para AJDUT (Pushka: 125,000 de 1,250,000)", async () => {
    setupHappyPath(1_250_000);
    await approveProject({ projectId: "p1", adminId: "admin-1" });

    // Primer participation.create es el institucional
    const platformCall = tx.participation.create.mock.calls[0]?.[0];
    expect(platformCall.data.shareCount).toBe(125_000);
    expect(platformCall.data.isPlatformStake).toBe(true);
    expect(platformCall.data.status).toBe("ASSIGNED");
    expect(platformCall.data.currentOwnerId).toBe("platform-1");
  });

  it("el pool AVAILABLE recibe el resto (totalShares - platform)", async () => {
    setupHappyPath(1_250_000);
    await approveProject({ projectId: "p1", adminId: "admin-1" });

    // Segundo participation.create es el pool
    const poolCall = tx.participation.create.mock.calls[1]?.[0];
    expect(poolCall.data.shareCount).toBe(1_125_000); // 1.25M - 125k
    expect(poolCall.data.status).toBe("AVAILABLE");
    expect(poolCall.data.isPlatformStake).toBe(false);
  });

  it("registra OwnershipHistory inmutable para el stake institucional", async () => {
    setupHappyPath(1_250_000);
    await approveProject({ projectId: "p1", adminId: "admin-1" });

    expect(tx.ownershipHistory.create).toHaveBeenCalledTimes(1);
    const hist = tx.ownershipHistory.create.mock.calls[0]?.[0];
    expect(hist.data.fromUserId).toBeNull();
    expect(hist.data.toUserId).toBe("platform-1");
    expect(hist.data.blockHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hist.data.prevHash).toBeNull();
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
    tx.user.findUnique.mockResolvedValueOnce({ id: "platform-1" });
    tx.participation.create.mockResolvedValueOnce({ id: "part-platform" });
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

  it("registra auditoría PARTICIPATION.CREATED + PROJECT.APPROVED", async () => {
    setupHappyPath(1_250_000);
    await approveProject({ projectId: "p1", adminId: "admin-1" });
    const actions = tx.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(actions).toContain("PARTICIPATION.CREATED");
    expect(actions).toContain("PROJECT.APPROVED");
  });
});

describe("approveProject — invariante 10% exacto", () => {
  it.each([
    [180_000, 18_000],
    [620_000, 62_000],
    [440_000, 44_000],
    [1_250_000, 125_000],
  ])("totalShares=%i → platformShares=%i (10% exacto)", async (total, expectedPlatform) => {
    tx.user.findUnique.mockResolvedValueOnce(makeAdmin());
    tx.project.findUnique.mockResolvedValueOnce(makeProject({ totalShares: total }));
    tx.user.findUnique.mockResolvedValueOnce({ id: "platform-1" });
    tx.participation.create.mockResolvedValueOnce({ id: "part" });
    tx.chatChannel.findUnique.mockResolvedValueOnce(null);

    await approveProject({ projectId: "p1", adminId: "admin-1" });
    expect(tx.participation.create.mock.calls[0]?.[0].data.shareCount).toBe(expectedPlatform);
  });
});
