import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.hoisted` permite definir el mock object antes del hoisting del vi.mock.
// Sin esto, el factory de vi.mock falla con "Cannot access 'tx' before initialization".
//
// Nota: tras Wave 1 (race-safe atomic pool decrement), el servicio usa
// `tx.participation.updateMany` para el decremento y `tx.participation.deleteMany`
// para limpiar pools en 0. `update` y `delete` siguen presentes en el mock
// porque otros call paths podrían usarlos, pero las assertions del happy path
// chequean `updateMany`/`deleteMany`.
const tx = vi.hoisted(() => ({
  lead: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  participation: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
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
  shareholderClass: {
    findFirst: vi.fn(),
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
  // Defaults sanos para el happy path: el decremento atómico siempre
  // afecta 1 fila y el cleanup del pool vacío no encuentra nada.
  tx.participation.updateMany.mockResolvedValue({ count: 1 });
  tx.participation.deleteMany.mockResolvedValue({ count: 0 });
  // Clase por defecto (Inversor pasivo) para quien adquiere.
  tx.shareholderClass.findFirst.mockResolvedValue({ id: "cls-passive" });
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

describe("assignSharesFromLead — validaciones de pool (race-safe path)", () => {
  it("rechaza si el proyecto no tiene pool AVAILABLE", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(makeLead());
    // updateMany no afecta filas → distinguimos vía findFirst posterior.
    tx.participation.updateMany.mockResolvedValueOnce({ count: 0 });
    tx.participation.findFirst.mockResolvedValueOnce(null);
    await expect(
      assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" })
    ).rejects.toBeInstanceOf(InvariantViolation);
  });

  it("rechaza si el pool tiene menos shares que el pedido", async () => {
    tx.lead.findUnique.mockResolvedValueOnce(makeLead({ shareCountRequested: 200 }));
    // updateMany no afecta porque shareCount: { gte: 200 } no matchea pool de 100
    tx.participation.updateMany.mockResolvedValueOnce({ count: 0 });
    tx.participation.findFirst.mockResolvedValueOnce({ shareCount: 100 });
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
    tx.participation.create.mockResolvedValue({ id: "part-new" });
    tx.certificate.create.mockResolvedValue({ id: "cert-1" });
  });

  it("decrementa el pool atómicamente con updateMany + decrement", async () => {
    await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });

    expect(tx.participation.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        status: "AVAILABLE",
        shareCount: { gte: 200 },
      },
      data: { shareCount: { decrement: 200 } },
    });
  });

  it("limpia pools en 0 con deleteMany post-decremento", async () => {
    await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });

    expect(tx.participation.deleteMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", status: "AVAILABLE", shareCount: 0 },
    });
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

  it("serialCode incluye sufijo random (no solo timestamp)", async () => {
    await assignSharesFromLead({ leadId: "lead-1", actorId: "founder-1" });

    const createCall = tx.participation.create.mock.calls[0]?.[0];
    const serial = createCall.data.serialCode as string;
    // Formato: AJDUT-{SLUG}-{timestamp36}-{6 hex random}
    expect(serial).toMatch(/^AJDUT-PUSHKA-[A-Z0-9]+-[A-F0-9]{6}$/);
  });
});
