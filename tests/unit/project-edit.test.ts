import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  project: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  startupProfile: {
    update: vi.fn(),
  },
  participation: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
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
  updateProjectInfo,
  updateAvailableShares,
} from "@/lib/services/project";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/services/errors";

const ACTOR = "founder-1";
const PROJECT_ID = "project-1";

beforeEach(() => {
  for (const model of Object.values(tx)) {
    for (const fn of Object.values(model)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
});

// ─── assertCanEditProject (vía las funciones que lo usan) ────────────

describe("assertCanEditProject — invariante 'solo OWNER edita'", () => {
  it("rechaza si user no existe", async () => {
    tx.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      updateProjectInfo({ projectId: PROJECT_ID, actorId: ACTOR, name: "x" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rechaza si user está inactivo", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: false });
    await expect(
      updateProjectInfo({ projectId: PROJECT_ID, actorId: ACTOR, name: "x" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rechaza si actor NO es el ownerId del proyecto", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique.mockResolvedValueOnce({ ownerId: "OTRO-FOUNDER" });
    await expect(
      updateProjectInfo({ projectId: PROJECT_ID, actorId: ACTOR, name: "x" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rechaza si el proyecto no existe", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique.mockResolvedValueOnce(null);
    await expect(
      updateProjectInfo({ projectId: PROJECT_ID, actorId: ACTOR, name: "x" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── updateProjectInfo: validaciones de longitud ─────────────────────

describe("updateProjectInfo — validaciones de longitud", () => {
  beforeEach(() => {
    tx.user.findUnique.mockResolvedValue({ isActive: true });
    tx.project.findUnique
      .mockResolvedValueOnce({ ownerId: ACTOR }) // assertCanEditProject
      .mockResolvedValue({
        id: PROJECT_ID,
        ownerId: ACTOR,
        startupProfile: { id: "sp-1" },
      });
  });

  it("oneLiner > 160 caracteres → ValidationError", async () => {
    await expect(
      updateProjectInfo({
        projectId: PROJECT_ID,
        actorId: ACTOR,
        oneLiner: "x".repeat(161),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("oneLiner = 160 caracteres exactos → OK", async () => {
    await expect(
      updateProjectInfo({
        projectId: PROJECT_ID,
        actorId: ACTOR,
        oneLiner: "x".repeat(160),
      })
    ).resolves.toBeDefined();
  });

  it("shortPitch > 280 caracteres → ValidationError", async () => {
    // Reset y re-setup porque el primer assertCanEdit consumió mocks
    tx.user.findUnique.mockReset();
    tx.project.findUnique.mockReset();
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique
      .mockResolvedValueOnce({ ownerId: ACTOR })
      .mockResolvedValue({
        id: PROJECT_ID,
        ownerId: ACTOR,
        startupProfile: { id: "sp-1" },
      });

    await expect(
      updateProjectInfo({
        projectId: PROJECT_ID,
        actorId: ACTOR,
        shortPitch: "x".repeat(281),
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── updateProjectInfo: efectos selectivos ──────────────────────────

describe("updateProjectInfo — solo actualiza los campos provistos", () => {
  beforeEach(() => {
    tx.user.findUnique.mockResolvedValue({ isActive: true });
    tx.project.findUnique
      .mockResolvedValueOnce({ ownerId: ACTOR }) // assertCanEditProject
      .mockResolvedValue({
        id: PROJECT_ID,
        ownerId: ACTOR,
        startupProfile: {
          id: "sp-1",
          sector: "Fintech",
          stage: "SEED",
          preMoneyValuation: null,
          valuationCurrency: "USD",
        },
      });
  });

  it("solo project.update si hay campos del proyecto a actualizar", async () => {
    await updateProjectInfo({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      name: "Pushka v2",
    });

    expect(tx.project.update).toHaveBeenCalledTimes(1);
    const call = tx.project.update.mock.calls[0]?.[0];
    expect(call.data.name).toBe("Pushka v2");
    // NO debería tocar startupProfile.update (no se pasó nada del startup)
    expect(tx.startupProfile.update).not.toHaveBeenCalled();
  });

  it("solo startupProfile.update si hay campos del startup", async () => {
    await updateProjectInfo({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      sector: "Health",
    });

    expect(tx.startupProfile.update).toHaveBeenCalledTimes(1);
    const call = tx.startupProfile.update.mock.calls[0]?.[0];
    expect(call.data.sector).toBe("Health");
    expect(tx.project.update).not.toHaveBeenCalled();
  });

  it("trim() de strings antes de guardar (no espacios espurios)", async () => {
    await updateProjectInfo({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      name: "  Pushka  ",
    });
    const call = tx.project.update.mock.calls[0]?.[0];
    expect(call.data.name).toBe("Pushka");
  });

  it("preMoneyValuation: empty string → null en DB (no Decimal('NaN'))", async () => {
    await updateProjectInfo({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      preMoneyValuation: "",
    });
    const call = tx.startupProfile.update.mock.calls[0]?.[0];
    expect(call.data.preMoneyValuation).toBeNull();
  });

  it("preMoneyValuation: string numérico → Decimal", async () => {
    await updateProjectInfo({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      preMoneyValuation: "12500000",
    });
    const call = tx.startupProfile.update.mock.calls[0]?.[0];
    expect(call.data.preMoneyValuation).toBeInstanceOf(Prisma.Decimal);
    expect(Number(call.data.preMoneyValuation)).toBe(12_500_000);
  });

  it("URLs vacías se guardan como null (no string vacío)", async () => {
    await updateProjectInfo({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      websiteUrl: "",
      pitchDeckUrl: "",
      dataRoomUrl: "",
    });
    const call = tx.startupProfile.update.mock.calls[0]?.[0];
    expect(call.data.websiteUrl).toBeNull();
    expect(call.data.pitchDeckStorageKey).toBeNull();
    expect(call.data.dataRoomStorageKey).toBeNull();
  });

  it("URLs válidas se guardan tal cual", async () => {
    await updateProjectInfo({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      websiteUrl: "https://pushka.io",
      pitchDeckUrl: "https://drive.google.com/x",
    });
    const call = tx.startupProfile.update.mock.calls[0]?.[0];
    expect(call.data.websiteUrl).toBe("https://pushka.io");
    expect(call.data.pitchDeckStorageKey).toBe("https://drive.google.com/x");
  });

  it("registra audit con event=PROJECT_INFO_UPDATED", async () => {
    await updateProjectInfo({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      name: "Pushka v2",
    });
    const auditCall = tx.auditLog.create.mock.calls[0]?.[0];
    expect((auditCall.data.payload as { event: string }).event).toBe("PROJECT_INFO_UPDATED");
  });
});

// ─── updateAvailableShares ────────────────────────────────────────────

describe("updateAvailableShares — autorización y validaciones", () => {
  it("rechaza si actor no es el founder (delegado a assertCanEditProject)", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique.mockResolvedValueOnce({ ownerId: "OTRO" });

    await expect(
      updateAvailableShares({
        projectId: PROJECT_ID,
        actorId: ACTOR,
        shareCount: 100,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rechaza shareCount negativo", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique.mockResolvedValueOnce({ ownerId: ACTOR });

    await expect(
      updateAvailableShares({
        projectId: PROJECT_ID,
        actorId: ACTOR,
        shareCount: -1,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza shareCount > maxAvailable (totalShares - assigned)", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique
      .mockResolvedValueOnce({ ownerId: ACTOR }) // assert
      .mockResolvedValueOnce({
        // findUnique en updateAvailableShares
        id: PROJECT_ID,
        totalShares: 1_000_000,
        participations: [
          { id: "p-platform", status: "ASSIGNED", shareCount: 100_000 },
          { id: "p-investor-1", status: "ASSIGNED", shareCount: 200_000 },
        ],
      });

    // max disponible = 1M - 300k = 700k. Si pedís 800k → falla
    await expect(
      updateAvailableShares({
        projectId: PROJECT_ID,
        actorId: ACTOR,
        shareCount: 800_000,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("updateAvailableShares — efectos sobre el pool", () => {
  it("shareCount=0: BORRA el pool existente", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique
      .mockResolvedValueOnce({ ownerId: ACTOR })
      .mockResolvedValueOnce({
        id: PROJECT_ID,
        totalShares: 1_000_000,
        participations: [
          { id: "p-pool", status: "AVAILABLE", shareCount: 500_000 },
          { id: "p-platform", status: "ASSIGNED", shareCount: 100_000 },
        ],
      });

    await updateAvailableShares({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      shareCount: 0,
    });

    expect(tx.participation.delete).toHaveBeenCalledWith({ where: { id: "p-pool" } });
    expect(tx.participation.update).not.toHaveBeenCalled();
    expect(tx.participation.create).not.toHaveBeenCalled();
  });

  it("shareCount=0 sin pool existente: no rompe (no-op)", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique
      .mockResolvedValueOnce({ ownerId: ACTOR })
      .mockResolvedValueOnce({
        id: PROJECT_ID,
        totalShares: 1_000_000,
        participations: [
          { id: "p-platform", status: "ASSIGNED", shareCount: 100_000 },
        ],
      });

    await expect(
      updateAvailableShares({
        projectId: PROJECT_ID,
        actorId: ACTOR,
        shareCount: 0,
      })
    ).resolves.toBeDefined();
    expect(tx.participation.delete).not.toHaveBeenCalled();
  });

  it("ACTUALIZA pool existente si shareCount > 0", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique
      .mockResolvedValueOnce({ ownerId: ACTOR })
      .mockResolvedValueOnce({
        id: PROJECT_ID,
        totalShares: 1_000_000,
        participations: [
          { id: "p-pool", status: "AVAILABLE", shareCount: 500_000 },
        ],
      });

    await updateAvailableShares({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      shareCount: 300_000,
    });

    expect(tx.participation.update).toHaveBeenCalledWith({
      where: { id: "p-pool" },
      data: { shareCount: 300_000 },
    });
    expect(tx.participation.create).not.toHaveBeenCalled();
    expect(tx.participation.delete).not.toHaveBeenCalled();
  });

  it("CREA pool nuevo si no existe y shareCount > 0", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique
      .mockResolvedValueOnce({ ownerId: ACTOR })
      .mockResolvedValueOnce({
        id: PROJECT_ID,
        slug: "pushka",
        totalShares: 1_000_000,
        participations: [
          { id: "p-platform", status: "ASSIGNED", shareCount: 100_000 },
        ],
      });

    await updateAvailableShares({
      projectId: PROJECT_ID,
      actorId: ACTOR,
      shareCount: 500_000,
    });

    expect(tx.participation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: PROJECT_ID,
          status: "AVAILABLE",
          shareCount: 500_000,
          isPlatformStake: false,
        }),
      })
    );
  });

  it("acepta justo el máximo permitido (= totalShares - assigned)", async () => {
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique
      .mockResolvedValueOnce({ ownerId: ACTOR })
      .mockResolvedValueOnce({
        id: PROJECT_ID,
        slug: "pushka",
        totalShares: 1_000_000,
        participations: [
          { id: "p-platform", status: "ASSIGNED", shareCount: 100_000 },
        ],
      });

    // max = 1M - 100k = 900k
    await expect(
      updateAvailableShares({
        projectId: PROJECT_ID,
        actorId: ACTOR,
        shareCount: 900_000,
      })
    ).resolves.toBeDefined();
  });
});
