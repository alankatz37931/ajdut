import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.hoisted` permite definir el mock object antes del hoisting del vi.mock.
// Sin esto, el factory de vi.mock falla con "Cannot access 'tx' before initialization".
const tx = vi.hoisted(() => ({
  lead: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  participation: {
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
  },
  ownershipHistory: {
    create: vi.fn(),
  },
  certificate: {
    create: vi.fn(),
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

import { assignSharesFromLead } from "@/lib/services/share-assignment";
import {
  ForbiddenError,
  InvariantViolation,
  NotFoundError,
  ValidationError,
} from "@/lib/services/errors";

function makeLead(
  overrides: Partial<{
    id: string;
    status: string;
    shareCountRequested: number;
    project: {
      id: string;
      slug: string;
      ownerId: string;
      name: string;
      status: string;
    };
    user: {
      id: string;
      fullName: string;
      email: string;
      isActive: boolean;
      deletedAt: Date | null;
    };
  }> = {}
) {
  return {
    id: overrides.id ?? "lead-1",
    status: overrides.status ?? "OPEN",
    shareCountRequested: overrides.shareCountRequested ?? 100,
    project: overrides.project ?? {
      id: "project-1",
      slug: "pushka",
      ownerId: "founder-1",
      name: "Pushka",
      status: "ACTIVE",
    },
    user: overrides.user ?? {
      id: "investor-1",
      fullName: "Ana Inversor",
      email: "ana@inv.com",
      isActive: true,
      deletedAt: null,
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

describe("assignSharesFromLead — autorización", () => {
  it("rechaza si el actor no es el founder del proyecto", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(makeLead());

    await expect(
      assignSharesFromLead({
        leadId: "lead-1",
        actorId: "otro-usuario",
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("permite si el actor es el founder", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(makeLead());
    tx.participation.findFirst.mockResolvedValueOnce({
      id: "pool-1",
      shareCount: 1000,
    });
    tx.participation.create.mockResolvedValueOnce({ id: "part-new" });
    tx.certificate.create.mockResolvedValueOnce({ id: "cert-1" });

    const result = await assignSharesFromLead({
      leadId: "lead-1",
      actorId: "founder-1",
    });

    expect(result.toUserId).toBe("investor-1");
    expect(result.shareCount).toBe(100);
  });
});

describe("assignSharesFromLead — validaciones de estado", () => {
  it("rechaza si el lead no existe", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(null);
    await expect(
      assignSharesFromLead({ leadId: "x", actorId: "founder-1" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rechaza lead ya CONVERTIDO", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(makeLead({ status: "CONVERTED" }));
    await expect(
      assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" })
    ).rejects.toBeInstanceOf(InvariantViolation);
  });

  it("rechaza lead DISMISSED", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(makeLead({ status: "DISMISSED" }));
    await expect(
      assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" })
    ).rejects.toBeInstanceOf(InvariantViolation);
  });

  it("acepta lead en CONTACTED (founder ya se había contactado)", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(makeLead({ status: "CONTACTED" }));
    tx.participation.findFirst.mockResolvedValueOnce({ id: "pool-1", shareCount: 1000 });
    tx.participation.create.mockResolvedValueOnce({ id: "part-new" });
    tx.certificate.create.mockResolvedValueOnce({ id: "cert-1" });

    const r = await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });
    expect(r.shareCount).toBe(100);
  });

  it("rechaza si el proyecto no está ACTIVE", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(
      makeLead({
        project: {
          id: "project-1",
          slug: "pushka",
          ownerId: "founder-1",
          name: "Pushka",
          status: "SUSPENDED",
        },
      })
    );
    await expect(
      assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" })
    ).rejects.toBeInstanceOf(InvariantViolation);
  });

  it("rechaza si el investor ya no tiene cuenta activa", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(
      makeLead({
        user: {
          id: "investor-1",
          fullName: "Ana",
          email: "ana@x.com",
          isActive: false,
          deletedAt: null,
        },
      })
    );
    await expect(
      assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("assignSharesFromLead — validaciones de pool", () => {
  it("rechaza si el proyecto no tiene pool AVAILABLE", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(makeLead());
    tx.participation.findFirst.mockResolvedValueOnce(null);
    await expect(
      assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" })
    ).rejects.toBeInstanceOf(InvariantViolation);
  });

  it("rechaza si el pool tiene menos shares que el pedido", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(makeLead({ shareCountRequested: 200 }));
    tx.participation.findFirst.mockResolvedValueOnce({ id: "pool-1", shareCount: 100 });
    await expect(
      assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza shareCountRequested < 1", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(makeLead({ shareCountRequested: 0 }));
    await expect(
      assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("assignSharesFromLead — efectos del happy path", () => {
  beforeEach(() => {
    tx.lead.findUnique.mockResolvedValue(makeLead({ shareCountRequested: 200 }));
    tx.participation.findFirst.mockResolvedValue({ id: "pool-1", shareCount: 1000 });
    tx.participation.create.mockResolvedValue({ id: "part-new" });
    tx.certificate.create.mockResolvedValue({ id: "cert-1" });
  });

  it("decrementa el pool en shareCountRequested (no lo borra si queda > 0)", async () => {
    await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });

    expect(tx.participation.update).toHaveBeenCalledWith({
      where: { id: "pool-1" },
      data: { shareCount: 800 }, // 1000 - 200
    });
    expect(tx.participation.delete).not.toHaveBeenCalled();
  });

  it("BORRA el pool si queda en 0", async () => {
    tx.lead.findUnique.mockResolvedValue(makeLead({ shareCountRequested: 1000 }));
    tx.participation.findFirst.mockResolvedValue({ id: "pool-1", shareCount: 1000 });

    await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });

    expect(tx.participation.delete).toHaveBeenCalledWith({ where: { id: "pool-1" } });
    expect(tx.participation.update).not.toHaveBeenCalled();
  });

  it("crea nueva Participation con status=ASSIGNED al inversor", async () => {
    await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });

    expect(tx.participation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ASSIGNED",
          currentOwnerId: "investor-1",
          shareCount: 200,
          isPlatformStake: false,
        }),
      })
    );
  });

  it("registra OwnershipHistory con blockHash (cadena de propiedad)", async () => {
    await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });

    expect(tx.ownershipHistory.create).toHaveBeenCalledTimes(1);
    const args = tx.ownershipHistory.create.mock.calls[0]?.[0];
    expect(args.data.fromUserId).toBeNull();
    expect(args.data.toUserId).toBe("investor-1");
    expect(args.data.blockHash).toMatch(/^[0-9a-f]{64}$/);
    expect(args.data.prevHash).toBeNull();
  });

  it("emite un Certificate vinculado a la Participation", async () => {
    await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });

    expect(tx.certificate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          issuedToUserId: "investor-1",
        }),
      })
    );
  });

  it("marca el Lead como CONVERTED con resolvedAt", async () => {
    await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });

    expect(tx.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead-1" },
        data: expect.objectContaining({ status: "CONVERTED" }),
      })
    );
  });

  it("registra DOS entradas en AuditLog: PARTICIPATION.ASSIGNED + CERTIFICATE.ISSUED", async () => {
    await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });

    const actions = tx.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(actions).toContain("PARTICIPATION.ASSIGNED");
    expect(actions).toContain("CERTIFICATE.ISSUED");
  });
});
