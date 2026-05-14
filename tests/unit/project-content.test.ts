import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  project: { findUnique: vi.fn() },
  startupProfile: { findUnique: vi.fn() },
  founder: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
  milestone: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() },
  startupMetric: {
    create: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
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
  upsertFounder,
  removeFounder,
  upsertMilestone,
  removeMilestone,
  addMetric,
  removeMetric,
} from "@/lib/services/project-content";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/services/errors";

const ACTOR = "founder-1";
const PROJECT_ID = "project-1";

function mockActorAndProject(
  args: Partial<{ ownerId: string; isActive: boolean }> = {}
) {
  // assertCanEditProject hace: user.findUnique, luego project.findUnique
  tx.user.findUnique.mockResolvedValueOnce({
    isActive: args.isActive ?? true,
  });
  tx.project.findUnique.mockResolvedValueOnce({
    ownerId: args.ownerId ?? ACTOR,
  });
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

describe("upsertFounder — autorización", () => {
  it("rechaza si actor no es founder del proyecto", async () => {
    mockActorAndProject({ ownerId: "otro" });
    await expect(
      upsertFounder({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        fullName: "Ana",
        role: "CEO",
        equityPercent: 50,
        isActive: true,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("upsertFounder — validaciones", () => {
  beforeEach(() => {
    mockActorAndProject();
    tx.startupProfile.findUnique.mockResolvedValue({
      id: "sp1",
      founders: [],
    });
  });

  it("nombre demasiado corto", async () => {
    await expect(
      upsertFounder({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        fullName: "A",
        role: "CEO",
        equityPercent: 50,
        isActive: true,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rol demasiado corto", async () => {
    await expect(
      upsertFounder({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        fullName: "Ana",
        role: "A",
        equityPercent: 50,
        isActive: true,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("equity fuera de 0..100", async () => {
    await expect(
      upsertFounder({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        fullName: "Ana",
        role: "CEO",
        equityPercent: 150,
        isActive: true,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("equity negativo", async () => {
    await expect(
      upsertFounder({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        fullName: "Ana",
        role: "CEO",
        equityPercent: -1,
        isActive: true,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("upsertFounder — invariante equity ≤ 100%", () => {
  it("RECHAZA si suma de equity supera 100%", async () => {
    mockActorAndProject();
    tx.startupProfile.findUnique.mockResolvedValueOnce({
      id: "sp1",
      founders: [
        { id: "f1", equityPercent: new Prisma.Decimal(60) },
        { id: "f2", equityPercent: new Prisma.Decimal(30) },
      ],
    });
    await expect(
      upsertFounder({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        fullName: "Ana",
        role: "CEO",
        equityPercent: 20, // 60+30+20 = 110 > 100
        isActive: true,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("permite si la suma queda en 100% justo", async () => {
    mockActorAndProject();
    tx.startupProfile.findUnique.mockResolvedValueOnce({
      id: "sp1",
      founders: [
        { id: "f1", equityPercent: new Prisma.Decimal(60) },
        { id: "f2", equityPercent: new Prisma.Decimal(30) },
      ],
    });
    tx.founder.create.mockResolvedValueOnce({ id: "f-new", fullName: "Ana", role: "CEO" });

    await expect(
      upsertFounder({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        fullName: "Ana",
        role: "CEO",
        equityPercent: 10,
        isActive: true,
      })
    ).resolves.toBeDefined();
  });

  it("al EDITAR un founder existente, no se cuenta su equity actual (no doble-cuenta)", async () => {
    mockActorAndProject();
    tx.startupProfile.findUnique.mockResolvedValueOnce({
      id: "sp1",
      founders: [
        { id: "f1", equityPercent: new Prisma.Decimal(60) },
        { id: "f2", equityPercent: new Prisma.Decimal(40) },
      ],
    });
    tx.founder.update.mockResolvedValueOnce({ id: "f1", fullName: "Ana", role: "CEO" });

    // Edito f1 cambiándole equity de 60 a 70 → otros (40) + 70 = 110 > 100 → falla
    await expect(
      upsertFounder({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        founderId: "f1",
        fullName: "Ana",
        role: "CEO",
        equityPercent: 70,
        isActive: true,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("removeFounder", () => {
  it("rechaza si el founder pertenece a otro proyecto", async () => {
    mockActorAndProject();
    tx.founder.findUnique.mockResolvedValueOnce({
      id: "f1",
      fullName: "Ana",
      startupProfile: { projectId: "OTRO-PROYECTO" },
    });
    await expect(
      removeFounder({ actorId: ACTOR, projectId: PROJECT_ID, founderId: "f1" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("happy path: borra y registra audit", async () => {
    mockActorAndProject();
    tx.founder.findUnique.mockResolvedValueOnce({
      id: "f1",
      fullName: "Ana",
      startupProfile: { projectId: PROJECT_ID },
    });
    await removeFounder({ actorId: ACTOR, projectId: PROJECT_ID, founderId: "f1" });
    expect(tx.founder.delete).toHaveBeenCalledWith({ where: { id: "f1" } });
    const auditAction = tx.auditLog.create.mock.calls[0]?.[0].data.action;
    expect(auditAction).toBe("FOUNDER.REMOVED");
  });
});

describe("upsertMilestone — auto-fecha al estado ACHIEVED", () => {
  beforeEach(() => {
    mockActorAndProject();
    tx.startupProfile.findUnique.mockResolvedValueOnce({ id: "sp1" });
  });

  it("status ACHIEVED sin achievedAt → setea now()", async () => {
    tx.milestone.create.mockResolvedValueOnce({
      id: "m1",
      title: "MVP",
      status: "ACHIEVED",
    });

    await upsertMilestone({
      actorId: ACTOR,
      projectId: PROJECT_ID,
      title: "MVP funcional",
      description: "Llegamos al MVP",
      status: "ACHIEVED",
      // achievedAt: no provisto
    });

    const createCall = tx.milestone.create.mock.calls[0]?.[0];
    expect(createCall.data.achievedAt).toBeInstanceOf(Date);
  });

  it("status PLANNED → achievedAt queda en null", async () => {
    tx.milestone.create.mockResolvedValueOnce({ id: "m1", title: "MVP", status: "PLANNED" });
    await upsertMilestone({
      actorId: ACTOR,
      projectId: PROJECT_ID,
      title: "MVP funcional",
      description: "Plan",
      status: "PLANNED",
    });
    const createCall = tx.milestone.create.mock.calls[0]?.[0];
    expect(createCall.data.achievedAt).toBeNull();
  });

  it("título o descripción demasiado cortos → ValidationError", async () => {
    // Re-setupeamos porque la beforeEach ya consumió los mocks
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.project.findUnique.mockResolvedValueOnce({ ownerId: ACTOR });
    tx.startupProfile.findUnique.mockResolvedValueOnce({ id: "sp1" });

    await expect(
      upsertMilestone({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        title: "ab",
        description: "ok descripción",
        status: "PLANNED",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("removeMilestone", () => {
  it("rechaza milestone de otro proyecto", async () => {
    mockActorAndProject();
    tx.milestone.findUnique.mockResolvedValueOnce({
      id: "m1",
      title: "x",
      startupProfile: { projectId: "OTRO" },
    });
    await expect(
      removeMilestone({ actorId: ACTOR, projectId: PROJECT_ID, milestoneId: "m1" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("addMetric", () => {
  beforeEach(() => {
    mockActorAndProject();
    tx.startupProfile.findUnique.mockResolvedValueOnce({ id: "sp1" });
  });

  it("CUSTOM sin customLabel → ValidationError", async () => {
    await expect(
      addMetric({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        kind: "CUSTOM",
        customLabel: "",
        value: 100,
        unit: "count",
        asOf: new Date(),
        visibility: "PUBLIC_TO_HOLDERS",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("value no finito → ValidationError", async () => {
    await expect(
      addMetric({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        kind: "MRR",
        value: Number.NaN,
        unit: "USD",
        asOf: new Date(),
        visibility: "PUBLIC_TO_HOLDERS",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("unit vacío → ValidationError", async () => {
    await expect(
      addMetric({
        actorId: ACTOR,
        projectId: PROJECT_ID,
        kind: "MRR",
        value: 100,
        unit: "  ",
        asOf: new Date(),
        visibility: "PUBLIC_TO_HOLDERS",
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("happy path: crea con audit METRIC.RECORDED", async () => {
    tx.startupMetric.create.mockResolvedValueOnce({ id: "m1", kind: "MRR", unit: "USD" });
    await addMetric({
      actorId: ACTOR,
      projectId: PROJECT_ID,
      kind: "MRR",
      value: 50000,
      unit: "USD",
      asOf: new Date("2026-04-01"),
      visibility: "PUBLIC_TO_HOLDERS",
    });
    const auditAction = tx.auditLog.create.mock.calls[0]?.[0].data.action;
    expect(auditAction).toBe("METRIC.RECORDED");
  });
});

describe("removeMetric", () => {
  it("rechaza métrica de otro proyecto", async () => {
    mockActorAndProject();
    tx.startupMetric.findUnique.mockResolvedValueOnce({
      id: "m1",
      kind: "MRR",
      startupProfile: { projectId: "OTRO" },
    });
    await expect(
      removeMetric({ actorId: ACTOR, projectId: PROJECT_ID, metricId: "m1" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("happy path: borra y audit METRIC.REMOVED", async () => {
    mockActorAndProject();
    tx.startupMetric.findUnique.mockResolvedValueOnce({
      id: "m1",
      kind: "MRR",
      startupProfile: { projectId: PROJECT_ID },
    });
    await removeMetric({ actorId: ACTOR, projectId: PROJECT_ID, metricId: "m1" });
    expect(tx.startupMetric.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
    const auditAction = tx.auditLog.create.mock.calls[0]?.[0].data.action;
    expect(auditAction).toBe("METRIC.REMOVED");
  });
});
