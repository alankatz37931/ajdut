import { describe, it, expect, vi, beforeEach } from "vitest";

// Tras Wave 1 (race-safe): createInterestLead corre dentro de un
// prisma.$transaction y delega el calculo de availability a
// getAvailableSharesForProposal, que hace participation.findFirst +
// pendingAssignment.aggregate. El mock simula ambos canales.
const mocks = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  lead: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  participation: { findFirst: vi.fn() },
  pendingAssignment: { aggregate: vi.fn() },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    ...mocks,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: (cb: any) => cb(mocks),
  },
}));

import { createInterestLead } from "@/lib/services/interest";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/services/errors";

const baseInput = {
  projectId: "project-1",
  userId: "investor-1",
  shareCountRequested: 100,
  message: "",
};

function makeProject(
  overrides: Partial<{
    status: string;
    ownerId: string;
  }> = {}
) {
  return {
    id: "project-1",
    status: overrides.status ?? "ACTIVE",
    ownerId: overrides.ownerId ?? "founder-1",
  };
}

/**
 * Default mocks para `getAvailableSharesForProposal`:
 * - pool AVAILABLE con `available` shares
 * - sin PendingAssignments pendientes (reserved = 0)
 */
function mockAvailability(available: number, reserved = 0) {
  mocks.participation.findFirst.mockResolvedValue({ shareCount: available });
  mocks.pendingAssignment.aggregate.mockResolvedValue({
    _sum: { shareCount: reserved },
  });
}

beforeEach(() => {
  for (const model of Object.values(mocks)) {
    for (const fn of Object.values(model)) {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as ReturnType<typeof vi.fn>).mockReset();
      }
    }
  }
});

describe("createInterestLead — validaciones básicas", () => {
  it("rechaza si el proyecto no existe", async () => {
    mocks.project.findUnique.mockResolvedValueOnce(null);
    await expect(createInterestLead(baseInput)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rechaza si el proyecto NO está ACTIVE", async () => {
    mocks.project.findUnique.mockResolvedValueOnce(
      makeProject({ status: "PENDING_APPROVAL" })
    );
    await expect(createInterestLead(baseInput)).rejects.toBeInstanceOf(ValidationError);
  });

  it("RECHAZA self-purchase (founder no compra su propio proyecto)", async () => {
    mocks.project.findUnique.mockResolvedValueOnce(
      makeProject({ ownerId: "investor-1" })
    );
    await expect(createInterestLead(baseInput)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("createInterestLead — validaciones del usuario", () => {
  beforeEach(() => {
    mocks.project.findUnique.mockResolvedValue(makeProject());
    mockAvailability(1000);
  });

  it("rechaza si el usuario no existe", async () => {
    mocks.user.findUnique.mockResolvedValueOnce(null);
    await expect(createInterestLead(baseInput)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rechaza si el usuario está inactivo", async () => {
    mocks.user.findUnique.mockResolvedValueOnce({
      role: "PARTNER",
      isActive: false,
      deletedAt: null,
    });
    await expect(createInterestLead(baseInput)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("BLOQUEA al usuario institucional PLATFORM", async () => {
    mocks.user.findUnique.mockResolvedValueOnce({
      role: "PLATFORM",
      isActive: true,
      deletedAt: null,
    });
    await expect(createInterestLead(baseInput)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("createInterestLead — validaciones del pedido", () => {
  beforeEach(() => {
    mocks.project.findUnique.mockResolvedValue(makeProject());
    mocks.user.findUnique.mockResolvedValue({
      role: "PARTNER",
      isActive: true,
      deletedAt: null,
    });
    mockAvailability(500);
  });

  it("rechaza shareCount < 1", async () => {
    await expect(
      createInterestLead({ ...baseInput, shareCountRequested: 0 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rechaza si pedís más de lo disponible", async () => {
    await expect(
      createInterestLead({ ...baseInput, shareCountRequested: 600 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("acepta justo en el límite (= available)", async () => {
    mocks.lead.create.mockResolvedValueOnce({ id: "lead-1" });
    await expect(
      createInterestLead({ ...baseInput, shareCountRequested: 500 })
    ).resolves.toBeDefined();
  });

  it("descuenta PendingAssignments pendientes al calcular available", async () => {
    // pool tiene 500 pero 300 ya estan reservados → solo 200 disponibles
    mockAvailability(500, 300);
    await expect(
      createInterestLead({ ...baseInput, shareCountRequested: 250 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("RECHAZA message > 2000 caracteres (defensiva, también validado en action)", async () => {
    await expect(
      createInterestLead({ ...baseInput, message: "x".repeat(2001) })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("acepta message vacío (mensaje es opcional)", async () => {
    mocks.lead.create.mockResolvedValueOnce({ id: "lead-1" });
    await expect(createInterestLead({ ...baseInput, message: "" })).resolves.toBeDefined();
  });
});

describe("createInterestLead — efectos", () => {
  beforeEach(() => {
    mocks.project.findUnique.mockResolvedValue(makeProject());
    mocks.user.findUnique.mockResolvedValue({
      role: "PARTNER",
      isActive: true,
      deletedAt: null,
    });
    mockAvailability(1000);
    mocks.lead.create.mockResolvedValue({ id: "lead-1" });
  });

  it("crea Lead en estado OPEN", async () => {
    await createInterestLead(baseInput);
    const call = mocks.lead.create.mock.calls[0]?.[0];
    expect(call.data.status).toBe("OPEN");
    expect(call.data.projectId).toBe("project-1");
    expect(call.data.userId).toBe("investor-1");
    expect(call.data.shareCountRequested).toBe(100);
  });

  it("registra auditoría PARTICIPATION.LEAD_CREATED", async () => {
    await createInterestLead(baseInput);
    const actions = mocks.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action
    );
    expect(actions).toContain("PARTICIPATION.LEAD_CREATED");
  });

  it("setea expiresAt en el futuro (~14 días según LEAD_EXPIRATION_DAYS)", async () => {
    const before = Date.now();
    await createInterestLead(baseInput);
    const call = mocks.lead.create.mock.calls[0]?.[0];
    const exp = (call.data.expiresAt as Date).getTime();
    expect(exp).toBeGreaterThan(before);
  });
});
