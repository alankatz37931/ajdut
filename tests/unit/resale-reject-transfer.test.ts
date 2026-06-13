import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.hoisted` permite definir el mock object antes del hoisting del vi.mock
// (mismo patrón que share-assignment.test.ts). rejectTransfer toca: user
// (assertAdmin), resaleListing (findUnique/update), participation
// (findUnique/update) y auditLog (recordAudit).
const tx = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  resaleListing: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  participation: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    ...tx,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: (cb: any) => cb(tx),
  },
}));

import { rejectTransfer } from "@/lib/services/participation";
import {
  ForbiddenError,
  IllegalTransition,
  NotFoundError,
} from "@/lib/services/errors";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function makeListing(
  overrides: Partial<{
    id: string;
    participationId: string;
    projectId: string;
    sellerId: string;
    status: string;
    shareCount: number | null;
    proposedBuyerId: string | null;
  }> = {}
) {
  return {
    id: "listing-1",
    participationId: "part-1",
    projectId: "project-1",
    sellerId: "seller-1",
    status: "AWAITING_VALIDATION",
    shareCount: 50,
    proposedBuyerId: "buyer-1",
    buyerAcceptedAt: NOW,
    buyerSignedAt: NOW,
    ownerAcceptedAt: NOW,
    buyerConfirmationTokenHash: "hash-abc",
    buyerConfirmationTokenExpiresAt: NOW,
    ...overrides,
  };
}

function makeParticipation(
  overrides: Partial<{
    id: string;
    projectId: string;
    shareCount: number;
    status: string;
    currentOwnerId: string;
  }> = {}
) {
  return {
    id: "part-1",
    projectId: "project-1",
    shareCount: 100,
    status: "ASSIGNED",
    currentOwnerId: "seller-1",
    ...overrides,
  };
}

const baseInput = {
  resaleListingId: "listing-1",
  adminId: "admin-1",
  note: "El traspaso no procede.",
};

beforeEach(() => {
  for (const model of Object.values(tx)) {
    for (const fn of Object.values(model)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
  // Default: el actor es un ADMIN activo.
  tx.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: true });
});

describe("rejectTransfer — guardas", () => {
  it("rechaza si el actor no es ADMIN", async () => {
    tx.user.findUnique.mockResolvedValue({ role: "PARTNER", isActive: true });

    await expect(rejectTransfer(baseInput)).rejects.toBeInstanceOf(ForbiddenError);
    expect(tx.resaleListing.update).not.toHaveBeenCalled();
  });

  it("rechaza si el ADMIN está inactivo", async () => {
    tx.user.findUnique.mockResolvedValue({ role: "ADMIN", isActive: false });

    await expect(rejectTransfer(baseInput)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("NotFound si el listing no existe", async () => {
    tx.resaleListing.findUnique.mockResolvedValue(null);

    await expect(rejectTransfer(baseInput)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("IllegalTransition si el listing no está AWAITING_VALIDATION", async () => {
    tx.resaleListing.findUnique.mockResolvedValue(
      makeListing({ status: "LISTED" })
    );

    await expect(rejectTransfer(baseInput)).rejects.toBeInstanceOf(IllegalTransition);
    expect(tx.resaleListing.update).not.toHaveBeenCalled();
  });

  it("IllegalTransition si era transferencia TOTAL y la participación no está TRANSFER_PENDING", async () => {
    tx.resaleListing.findUnique.mockResolvedValue(makeListing({ shareCount: 100 }));
    tx.participation.findUnique.mockResolvedValue(
      makeParticipation({ status: "ASSIGNED" })
    );

    await expect(rejectTransfer(baseInput)).rejects.toBeInstanceOf(IllegalTransition);
    expect(tx.resaleListing.update).not.toHaveBeenCalled();
    expect(tx.participation.update).not.toHaveBeenCalled();
  });
});

describe("rejectTransfer — el listing vuelve PUBLICADO (LISTED), sin comprador zombie", () => {
  it("transferencia PARCIAL: listing → LISTED con comprador y validaciones limpiados; la participación no se toca", async () => {
    tx.resaleListing.findUnique.mockResolvedValue(makeListing({ shareCount: 50 }));
    tx.participation.findUnique.mockResolvedValue(
      makeParticipation({ shareCount: 100, status: "ASSIGNED" })
    );

    await rejectTransfer(baseInput);

    expect(tx.resaleListing.update).toHaveBeenCalledWith({
      where: { id: "listing-1" },
      data: {
        // Vuelve adquirible: AcquireButton y acquireResale exigen LISTED.
        status: "LISTED",
        proposedBuyerId: null,
        buyerAcceptedAt: null,
        buyerSignedAt: null,
        ownerAcceptedAt: null,
        buyerConfirmationTokenHash: null,
        buyerConfirmationTokenExpiresAt: null,
      },
    });
    // Parcial: la participación nunca dejó de estar ASSIGNED.
    expect(tx.participation.update).not.toHaveBeenCalled();
  });

  it("transferencia TOTAL: listing → LISTED y la participación vuelve a IN_RESALE (publicada)", async () => {
    tx.resaleListing.findUnique.mockResolvedValue(makeListing({ shareCount: 100 }));
    tx.participation.findUnique.mockResolvedValue(
      makeParticipation({ shareCount: 100, status: "TRANSFER_PENDING" })
    );

    await rejectTransfer(baseInput);

    expect(tx.resaleListing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-1" },
        data: expect.objectContaining({ status: "LISTED", proposedBuyerId: null }),
      })
    );
    expect(tx.participation.update).toHaveBeenCalledWith({
      where: { id: "part-1" },
      data: { status: "IN_RESALE" },
    });
  });

  it("listing legacy con shareCount null se interpreta como transferencia TOTAL", async () => {
    tx.resaleListing.findUnique.mockResolvedValue(makeListing({ shareCount: null }));
    tx.participation.findUnique.mockResolvedValue(
      makeParticipation({ shareCount: 100, status: "TRANSFER_PENDING" })
    );

    await rejectTransfer(baseInput);

    expect(tx.participation.update).toHaveBeenCalledWith({
      where: { id: "part-1" },
      data: { status: "IN_RESALE" },
    });
  });

  it("audita PARTICIPATION.TRANSFER_REJECTED con la nota y el flag partial", async () => {
    tx.resaleListing.findUnique.mockResolvedValue(makeListing({ shareCount: 50 }));
    tx.participation.findUnique.mockResolvedValue(
      makeParticipation({ shareCount: 100, status: "ASSIGNED" })
    );

    await rejectTransfer(baseInput);

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "admin-1",
        projectId: "project-1",
        action: "PARTICIPATION.TRANSFER_REJECTED",
        entityType: "ResaleListing",
        entityId: "listing-1",
        payload: { note: "El traspaso no procede.", partial: true },
      }),
    });
  });
});
