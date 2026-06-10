import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { assertCanEditProject, buildCapTableInput, CAP_TABLE_INCLUDE } from "./project";
import { computeCapTable, equityPercentToShares } from "./cap-table";
import { NotFoundError, ValidationError } from "./errors";

// ─── Founders / Equipo ──────────────────────────────────────────────

export type UpsertFounderInput = {
  actorId: string;
  projectId: string;
  founderId?: string; // si va, es update; sino, create
  fullName: string;
  role: string;
  bio?: string | null;
  references?: string | null;
  linkedinUrl?: string | null;
  equityPercent: number;
  joinedAt?: Date | null;
  isActive: boolean;
  shareholderClassId?: string | null;
  vestingMonths?: number | null;
  vestingStartAt?: string | null;
};

export async function upsertFounder(input: UpsertFounderInput) {
  return prisma.$transaction(async (tx) => {
    await assertCanEditProject(tx, input.actorId, input.projectId);

    const profile = await tx.startupProfile.findUnique({
      where: { projectId: input.projectId },
      select: {
        id: true,
        founders: { select: { id: true, equityPercent: true, isActive: true } },
      },
    });
    if (!profile) throw new NotFoundError("StartupProfile", input.projectId);

    if (input.fullName.trim().length < 2) {
      throw new ValidationError("fullName", "Nombre demasiado corto.");
    }
    if (input.role.trim().length < 2) {
      throw new ValidationError("role", "Indicá el rol.");
    }
    if (input.equityPercent < 0 || input.equityPercent > 100) {
      throw new ValidationError("equityPercent", "El % debe estar entre 0 y 100.");
    }

    // Si vino una clase, validamos que pertenezca a este proyecto.
    if (input.shareholderClassId) {
      const cls = await tx.shareholderClass.findUnique({
        where: { id: input.shareholderClassId },
        select: { projectId: true },
      });
      if (!cls || cls.projectId !== input.projectId) {
        throw new ValidationError("shareholderClassId", "Clase inválida.");
      }
    }

    // ── Vesting: si hay tramos (>0), el equity se entrega de a poco ───
    const hasVesting = Boolean(input.vestingMonths && input.vestingMonths > 0);
    let vestingMonths: number | null = null;
    let vestingStartAt: Date | null = null;
    if (hasVesting) {
      const months = input.vestingMonths as number;
      if (!Number.isInteger(months) || months < 1 || months > 120) {
        throw new ValidationError(
          "vestingMonths",
          "Los tramos deben ser entre 1 y 120 meses."
        );
      }
      if (!input.vestingStartAt) {
        throw new ValidationError(
          "vestingStartAt",
          "Indicá la fecha de inicio del vesting."
        );
      }
      const start = new Date(input.vestingStartAt);
      if (Number.isNaN(start.getTime())) {
        throw new ValidationError(
          "vestingStartAt",
          "Indicá la fecha de inicio del vesting."
        );
      }
      vestingMonths = months;
      vestingStartAt = start;
    }

    // ── Candado del cap table unificado ──────────────────────────────
    // El equipo (equity% → participaciones) + tenencias externas + plataforma
    // + asignados no pueden superar el total emitido (100%). Cargamos el resto
    // del cap table y recomputamos el equipo CON el cambio aplicado.
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      include: CAP_TABLE_INCLUDE,
    });
    if (!project) throw new NotFoundError("Project", input.projectId);
    const totalShares = project.totalShares;

    // Resto comprometido (externas + plataforma + asignados) en participaciones.
    // founders:[] + reservedShares:0 → committed = todo MENOS el equipo (lo
    // reservado por vesting es del equipo y se recalcula en newTeamShares como
    // el target completo de cada founder).
    const restShares = computeCapTable({
      ...buildCapTableInput(project),
      founders: [],
      reservedShares: 0,
    }).committedShares;

    // Equipo CON el cambio aplicado: solo founders ACTIVOS cuentan como equity
    // (igual que el dashboard). Reemplazamos/agregamos el que se está guardando.
    const isEditing = Boolean(input.founderId);
    const editedActive = input.isActive;
    const newTeamEquities: number[] = [];
    for (const f of profile.founders) {
      if (isEditing && f.id === input.founderId) {
        if (editedActive) newTeamEquities.push(input.equityPercent);
        continue; // si se desactiva, no suma
      }
      if (f.isActive) newTeamEquities.push(Number(f.equityPercent));
    }
    if (!isEditing && editedActive) {
      newTeamEquities.push(input.equityPercent);
    }
    // Per-founder rounding, igual que computeCapTable (no redondear la suma).
    const newTeamShares = newTeamEquities.reduce(
      (s, eq) => s + equityPercentToShares(eq, totalShares),
      0
    );

    // Estado actual (sin el cambio) para distinguir AUMENTO de REDUCCIÓN: en
    // proyectos legacy ya >100% permitimos reducir/ajustar, solo bloqueamos
    // cuando el nuevo total comprometido sube por encima del total.
    const currentTeamShares = profile.founders
      .filter((f) => f.isActive)
      .reduce((s, f) => s + equityPercentToShares(Number(f.equityPercent), totalShares), 0);
    const currentCommitted = currentTeamShares + restShares;
    const newCommitted = newTeamShares + restShares;

    if (newCommitted > totalShares && newCommitted > currentCommitted) {
      throw new ValidationError(
        "equityPercent",
        "El cap table superaría el 100%. El equipo + tenencias + asignados no pueden exceder el total de participaciones emitidas. Ajustá los porcentajes o consultá con los propietarios para emitir más."
      );
    }

    let result;
    if (input.founderId) {
      result = await tx.founder.update({
        where: { id: input.founderId },
        data: {
          fullName: input.fullName.trim(),
          role: input.role.trim(),
          bio: input.bio?.trim() || null,
          references: input.references?.trim() || null,
          linkedinUrl: input.linkedinUrl || null,
          equityPercent: new Prisma.Decimal(input.equityPercent),
          joinedAt: input.joinedAt ?? null,
          isActive: input.isActive,
          shareholderClassId: input.shareholderClassId ?? null,
          vestingMonths,
          vestingStartAt,
        },
      });
    } else {
      result = await tx.founder.create({
        data: {
          startupProfileId: profile.id,
          fullName: input.fullName.trim(),
          role: input.role.trim(),
          bio: input.bio?.trim() || null,
          references: input.references?.trim() || null,
          linkedinUrl: input.linkedinUrl || null,
          equityPercent: new Prisma.Decimal(input.equityPercent),
          joinedAt: input.joinedAt ?? null,
          isActive: input.isActive,
          shareholderClassId: input.shareholderClassId ?? null,
          vestingMonths,
          vestingStartAt,
        },
      });
    }

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: input.projectId,
      action: "FOUNDER.UPSERTED",
      entityType: "Founder",
      entityId: result.id,
      payload: { fullName: result.fullName, role: result.role },
    });

    return result;
  });
}

export async function removeFounder(input: {
  actorId: string;
  projectId: string;
  founderId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await assertCanEditProject(tx, input.actorId, input.projectId);

    const founder = await tx.founder.findUnique({
      where: { id: input.founderId },
      include: { startupProfile: { select: { projectId: true } } },
    });
    if (!founder) throw new NotFoundError("Founder", input.founderId);
    if (founder.startupProfile.projectId !== input.projectId) {
      throw new NotFoundError("Founder", input.founderId);
    }

    await tx.founder.delete({ where: { id: input.founderId } });
    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: input.projectId,
      action: "FOUNDER.REMOVED",
      entityType: "Founder",
      entityId: input.founderId,
      payload: { fullName: founder.fullName },
    });
    return { ok: true as const };
  });
}

// ─── Milestones / Hitos ─────────────────────────────────────────────

export type UpsertMilestoneInput = {
  actorId: string;
  projectId: string;
  milestoneId?: string;
  title: string;
  description: string;
  status: "PLANNED" | "IN_PROGRESS" | "ACHIEVED" | "DELAYED" | "CANCELLED";
  targetDate?: Date | null;
  achievedAt?: Date | null;
};

export async function upsertMilestone(input: UpsertMilestoneInput) {
  return prisma.$transaction(async (tx) => {
    await assertCanEditProject(tx, input.actorId, input.projectId);

    const profile = await tx.startupProfile.findUnique({
      where: { projectId: input.projectId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundError("StartupProfile", input.projectId);

    if (input.title.trim().length < 3) {
      throw new ValidationError("title", "El título es muy corto.");
    }
    if (input.description.trim().length < 3) {
      throw new ValidationError("description", "La descripción es muy corta.");
    }

    // Si está ACHIEVED y no hay achievedAt, lo seteamos a hoy.
    const achievedAt =
      input.status === "ACHIEVED" && !input.achievedAt ? new Date() : input.achievedAt ?? null;

    let result;
    if (input.milestoneId) {
      result = await tx.milestone.update({
        where: { id: input.milestoneId },
        data: {
          title: input.title.trim(),
          description: input.description.trim(),
          status: input.status,
          targetDate: input.targetDate ?? null,
          achievedAt,
        },
      });
    } else {
      result = await tx.milestone.create({
        data: {
          startupProfileId: profile.id,
          title: input.title.trim(),
          description: input.description.trim(),
          status: input.status,
          targetDate: input.targetDate ?? null,
          achievedAt,
        },
      });
    }

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: input.projectId,
      action: "MILESTONE.UPSERTED",
      entityType: "Milestone",
      entityId: result.id,
      payload: { title: result.title, status: result.status },
    });

    return result;
  });
}

export async function removeMilestone(input: {
  actorId: string;
  projectId: string;
  milestoneId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await assertCanEditProject(tx, input.actorId, input.projectId);

    const m = await tx.milestone.findUnique({
      where: { id: input.milestoneId },
      include: { startupProfile: { select: { projectId: true } } },
    });
    if (!m) throw new NotFoundError("Milestone", input.milestoneId);
    if (m.startupProfile.projectId !== input.projectId) {
      throw new NotFoundError("Milestone", input.milestoneId);
    }

    await tx.milestone.delete({ where: { id: input.milestoneId } });
    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: input.projectId,
      action: "MILESTONE.REMOVED",
      entityType: "Milestone",
      entityId: input.milestoneId,
      payload: { title: m.title },
    });
    return { ok: true as const };
  });
}

// ─── Métricas ───────────────────────────────────────────────────────

export const METRIC_KINDS = [
  "MRR",
  "ARR",
  "GMV",
  "ACTIVE_USERS",
  "PAYING_CUSTOMERS",
  "CHURN_RATE",
  "BURN_RATE",
  "RUNWAY_MONTHS",
  "CAC",
  "LTV",
  "GROSS_MARGIN",
  "HEADCOUNT",
  "CUSTOM",
] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];

export type AddMetricInput = {
  actorId: string;
  projectId: string;
  kind: MetricKind;
  customLabel?: string | null;
  value: number;
  unit: string;
  asOf: Date;
  visibility: "PRIVATE" | "PUBLIC_TO_HOLDERS";
};

export async function addMetric(input: AddMetricInput) {
  return prisma.$transaction(async (tx) => {
    await assertCanEditProject(tx, input.actorId, input.projectId);

    const profile = await tx.startupProfile.findUnique({
      where: { projectId: input.projectId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundError("StartupProfile", input.projectId);

    if (!Number.isFinite(input.value)) {
      throw new ValidationError("value", "El valor debe ser un número válido.");
    }
    if (input.kind === "CUSTOM" && !input.customLabel?.trim()) {
      throw new ValidationError("customLabel", "Para métrica CUSTOM hay que indicar la etiqueta.");
    }
    if (input.unit.trim().length === 0) {
      throw new ValidationError("unit", "Indicá la unidad (USD, MXN, %, count, etc.).");
    }

    const metric = await tx.startupMetric.create({
      data: {
        startupProfileId: profile.id,
        kind: input.kind,
        customLabel: input.customLabel?.trim() || null,
        value: new Prisma.Decimal(input.value),
        unit: input.unit.trim(),
        asOf: input.asOf,
        reportedById: input.actorId,
        visibility: input.visibility,
      },
    });

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: input.projectId,
      action: "METRIC.RECORDED",
      entityType: "StartupMetric",
      entityId: metric.id,
      payload: {
        kind: metric.kind,
        value: input.value,
        unit: metric.unit,
        asOf: input.asOf.toISOString(),
      },
    });

    return metric;
  });
}

export async function removeMetric(input: {
  actorId: string;
  projectId: string;
  metricId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await assertCanEditProject(tx, input.actorId, input.projectId);

    const m = await tx.startupMetric.findUnique({
      where: { id: input.metricId },
      include: { startupProfile: { select: { projectId: true } } },
    });
    if (!m) throw new NotFoundError("StartupMetric", input.metricId);
    if (m.startupProfile.projectId !== input.projectId) {
      throw new NotFoundError("StartupMetric", input.metricId);
    }

    await tx.startupMetric.delete({ where: { id: input.metricId } });
    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: input.projectId,
      action: "METRIC.REMOVED",
      entityType: "StartupMetric",
      entityId: input.metricId,
      payload: { kind: m.kind },
    });
    return { ok: true as const };
  });
}
