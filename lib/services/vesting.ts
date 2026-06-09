import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import {
  createPendingFromInvite,
  getAvailableSharesForProposal,
} from "./pending-assignment";
import {
  DomainError,
  ForbiddenError,
  InvariantViolation,
  NotFoundError,
  ValidationError,
} from "./errors";

type Tx = Prisma.TransactionClient;

// ─── VESTING ────────────────────────────────────────────────────────
//
// Entrega programada de participaciones a través del tiempo, auto-ejecutada.
//
// El founder define un cronograma de releases (tramos con fecha + cantidad).
// Cada release, al llegar su fecha, NO asigna directamente: crea un
// `PendingAssignment` (vía `createPendingFromInvite`) que entra al MISMO flujo
// de validación bilateral (proposer + target confirman) y aprobación de admin
// que cualquier invitación directa del founder. La asignación real al pool la
// ejecuta `approvePendingAssignment` cuando el admin aprueba.
//
// Pool: al CREAR el schedule validamos como sanity check que el total entre en
// el available actual (con la salvedad de que el pool puede cambiar). NO
// reservamos el pool — cada release valida disponibilidad al ejecutarse y, si
// no alcanza, queda SKIPPED para revisión manual.

const MONTH_MS = 30; // sentinel; usamos addMonths real abajo

export type VestingReleaseInput = {
  /** Cuántas participaciones libera este tramo. Entero >= 1. */
  shareCount: number;
  /** Fecha en que se debe crear el PendingAssignment. Debe ser futura. */
  releaseAt: Date;
};

export type CreateVestingScheduleInput = {
  projectId: string;
  /** Founder que crea el cronograma. Debe ser owner del proyecto. */
  createdById: string;
  /** Destinatario: user existente (toma precedencia) … */
  targetUserId?: string | null;
  /** … o email nuevo (se crea la cuenta al ejecutar cada release). */
  targetEmail?: string | null;
  /** Nombre para mostrar / crear la cuenta. Requerido si es por email. */
  targetName?: string | null;
  /** Total a entregar en todo el cronograma. Debe == suma de releases. */
  totalShares: number;
  reason?: string | null;
  /** Tramos explícitos. Mutuamente excluyente con `monthly`. */
  releases?: VestingReleaseInput[];
  /**
   * Helper: genera N tramos iguales mensuales desde `startAt`. El form usa esto
   * para el modo mensual (la opción principal del cliente). El último tramo
   * absorbe el remanente de la división para que la suma == totalShares.
   */
  monthly?: {
    /** Número de tramos. Entero >= 1. */
    installments: number;
    /** Fecha del primer release. */
    startAt: Date;
  };
};

export type CreateVestingScheduleResult = {
  scheduleId: string;
  releaseCount: number;
  totalShares: number;
  /**
   * True si el total del cronograma supera el pool disponible actual. No es un
   * error (el pool puede cambiar antes de cada release), pero la UI debería
   * mostrar un warning para que el founder esté avisado.
   */
  exceedsAvailableWarning: boolean;
  availableNow: number;
};

/** Suma meses a una fecha conservando la hora; clamp de fin de mes. */
function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  const targetMonth = d.getMonth() + months;
  const targetDate = new Date(d.getTime());
  targetDate.setMonth(targetMonth);
  // Si por overflow (ej. 31 ene + 1 mes) saltó de mes, clamp al último día.
  if (targetDate.getDate() !== d.getDate()) {
    targetDate.setDate(0);
  }
  return targetDate;
}
void MONTH_MS;

/**
 * Genera N tramos iguales mensuales. El último absorbe el remanente para que
 * la suma sea exactamente `totalShares` (evita perder participaciones por la
 * división entera).
 */
export function buildMonthlyReleases(args: {
  totalShares: number;
  installments: number;
  startAt: Date;
}): VestingReleaseInput[] {
  const { totalShares, installments, startAt } = args;
  const per = Math.floor(totalShares / installments);
  const releases: VestingReleaseInput[] = [];
  let allocated = 0;
  for (let i = 0; i < installments; i++) {
    const isLast = i === installments - 1;
    const shareCount = isLast ? totalShares - allocated : per;
    allocated += shareCount;
    releases.push({
      shareCount,
      releaseAt: addMonths(startAt, i),
    });
  }
  return releases;
}

async function assertProjectOwner(
  tx: Tx,
  projectId: string,
  userId: string
): Promise<{ slug: string; name: string }> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, status: true, slug: true, name: true },
  });
  if (!project) throw new NotFoundError("Project", projectId);
  if (project.status !== "ACTIVE") {
    throw new InvariantViolation(
      "PR_05_PROJECT_INACTIVE",
      "El proyecto no está activo; no se pueden crear cronogramas de vesting."
    );
  }
  if (project.ownerId !== userId) {
    // Admins también pueden, por simetría con el resto del sistema.
    const actor = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });
    if (!actor || !actor.isActive || actor.role !== "ADMIN") {
      throw new ForbiddenError(
        "Solo el founder dueño del proyecto puede crear cronogramas de vesting."
      );
    }
  }
  return { slug: project.slug, name: project.name };
}

// ─── Crear cronograma ───────────────────────────────────────────────

export async function createVestingSchedule(
  input: CreateVestingScheduleInput
): Promise<CreateVestingScheduleResult> {
  // ─ Resolver / validar releases ─
  let releases: VestingReleaseInput[];
  if (input.monthly) {
    if (
      !Number.isInteger(input.monthly.installments) ||
      input.monthly.installments < 1
    ) {
      throw new ValidationError(
        "installments",
        "El número de tramos debe ser un entero mayor o igual a 1."
      );
    }
    if (
      !(input.monthly.startAt instanceof Date) ||
      Number.isNaN(input.monthly.startAt.getTime())
    ) {
      throw new ValidationError("startAt", "La fecha de inicio es inválida.");
    }
    if (!Number.isInteger(input.totalShares) || input.totalShares < 1) {
      throw new ValidationError(
        "totalShares",
        "El total de participaciones debe ser un entero mayor o igual a 1."
      );
    }
    if (input.totalShares < input.monthly.installments) {
      throw new ValidationError(
        "totalShares",
        "El total no alcanza para repartir al menos 1 participación por tramo."
      );
    }
    releases = buildMonthlyReleases({
      totalShares: input.totalShares,
      installments: input.monthly.installments,
      startAt: input.monthly.startAt,
    });
  } else if (input.releases && input.releases.length > 0) {
    releases = input.releases;
  } else {
    throw new ValidationError(
      "releases",
      "El cronograma debe tener al menos un tramo."
    );
  }

  // ─ Validar cada release ─
  for (const r of releases) {
    if (!Number.isInteger(r.shareCount) || r.shareCount < 1) {
      throw new ValidationError(
        "shareCount",
        "Cada tramo debe entregar un entero mayor o igual a 1 participaciones."
      );
    }
    if (!(r.releaseAt instanceof Date) || Number.isNaN(r.releaseAt.getTime())) {
      throw new ValidationError("releaseAt", "Hay una fecha de tramo inválida.");
    }
  }

  // ─ Fechas futuras y ordenadas (estrictamente crecientes) ─
  const now = Date.now();
  let prevTime: number | null = null;
  for (const r of releases) {
    const t = r.releaseAt.getTime();
    if (t <= now) {
      throw new ValidationError(
        "releaseAt",
        "Todas las fechas de los tramos deben ser futuras."
      );
    }
    if (prevTime !== null && t <= prevTime) {
      throw new ValidationError(
        "releaseAt",
        "Las fechas de los tramos deben estar en orden creciente."
      );
    }
    prevTime = t;
  }

  // ─ total == suma de releases ─
  const sum = releases.reduce((s, r) => s + r.shareCount, 0);
  if (sum !== input.totalShares) {
    throw new ValidationError(
      "totalShares",
      `El total (${input.totalShares}) no coincide con la suma de los tramos (${sum}).`
    );
  }

  // ─ Resolver destinatario ─
  const email = input.targetEmail?.trim().toLowerCase() || null;
  const name = input.targetName?.trim() || null;
  let resolvedTargetUserId: string | null = input.targetUserId ?? null;
  let resolvedTargetEmail: string | null = email;
  let resolvedTargetName: string | null = name;

  return prisma.$transaction(async (tx) => {
    const project = await assertProjectOwner(tx, input.projectId, input.createdById);

    if (resolvedTargetUserId) {
      const u = await tx.user.findUnique({
        where: { id: resolvedTargetUserId },
        select: { id: true, email: true, fullName: true, isActive: true, deletedAt: true },
      });
      if (!u) throw new NotFoundError("User", resolvedTargetUserId);
      if (!u.isActive || u.deletedAt) {
        throw new DomainError(
          "USER_INACTIVE",
          "El destinatario seleccionado no tiene cuenta activa."
        );
      }
      // Normalizamos email/nombre desde el user existente para que los releases
      // siempre tengan datos consistentes para el flujo de invite.
      resolvedTargetEmail = u.email;
      resolvedTargetName = u.fullName;
    } else {
      if (!resolvedTargetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedTargetEmail)) {
        throw new ValidationError(
          "targetEmail",
          "Ingresá un email válido o seleccioná un socio existente."
        );
      }
      if (!resolvedTargetName || resolvedTargetName.length < 2) {
        throw new ValidationError(
          "targetName",
          "Ingresá el nombre del destinatario."
        );
      }
      // Si el email ya pertenece a un user, lo linkeamos.
      const existing = await tx.user.findUnique({
        where: { email: resolvedTargetEmail },
        select: { id: true, fullName: true, isActive: true, deletedAt: true },
      });
      if (existing) {
        if (!existing.isActive || existing.deletedAt) {
          throw new DomainError(
            "USER_INACTIVE",
            "Ya existe una cuenta con ese email pero está suspendida o eliminada."
          );
        }
        resolvedTargetUserId = existing.id;
        resolvedTargetName = existing.fullName;
      }
    }

    // ─ Sanity check de pool (warning, no error) ─
    const availableNow = await getAvailableSharesForProposal(input.projectId, tx);
    const exceedsAvailableWarning = input.totalShares > availableNow;

    const schedule = await tx.vestingSchedule.create({
      data: {
        projectId: input.projectId,
        targetUserId: resolvedTargetUserId,
        targetEmail: resolvedTargetEmail,
        targetName: resolvedTargetName,
        createdById: input.createdById,
        totalShares: input.totalShares,
        reason: input.reason?.trim() || null,
        status: "ACTIVE",
        releases: {
          create: releases.map((r) => ({
            shareCount: r.shareCount,
            releaseAt: r.releaseAt,
            status: "PENDING",
          })),
        },
      },
      select: { id: true },
    });

    await recordAudit(tx, {
      actorId: input.createdById,
      projectId: input.projectId,
      action: "VESTING.SCHEDULE_CREATED",
      entityType: "VestingSchedule",
      entityId: schedule.id,
      payload: {
        projectName: project.name,
        targetUserId: resolvedTargetUserId,
        targetEmail: resolvedTargetEmail,
        totalShares: input.totalShares,
        releaseCount: releases.length,
        exceedsAvailableWarning,
        availableNow,
      },
    });

    return {
      scheduleId: schedule.id,
      releaseCount: releases.length,
      totalShares: input.totalShares,
      exceedsAvailableWarning,
      availableNow,
    };
  });
}

// ─── Cancelar cronograma ────────────────────────────────────────────

export type CancelVestingScheduleResult = {
  scheduleId: string;
  cancelledReleases: number;
};

export async function cancelVestingSchedule(
  scheduleId: string,
  actorId: string
): Promise<CancelVestingScheduleResult> {
  return prisma.$transaction(async (tx) => {
    const schedule = await tx.vestingSchedule.findUnique({
      where: { id: scheduleId },
      include: { project: { select: { id: true, ownerId: true } } },
    });
    if (!schedule) throw new NotFoundError("VestingSchedule", scheduleId);

    if (schedule.project.ownerId !== actorId) {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { role: true, isActive: true },
      });
      if (!actor || !actor.isActive || actor.role !== "ADMIN") {
        throw new ForbiddenError(
          "Solo el founder dueño o un admin pueden cancelar el cronograma."
        );
      }
    }

    if (schedule.status !== "ACTIVE") {
      throw new InvariantViolation(
        "VS_01_NOT_ACTIVE",
        `El cronograma ya está ${schedule.status} y no se puede cancelar.`
      );
    }

    // Sólo los PENDING se cancelan. Los ya RELEASED/SKIPPED quedan como están.
    const cancelled = await tx.vestingRelease.updateMany({
      where: { scheduleId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });

    await tx.vestingSchedule.update({
      where: { id: scheduleId },
      data: { status: "CANCELLED" },
    });

    await recordAudit(tx, {
      actorId,
      projectId: schedule.projectId,
      action: "VESTING.SCHEDULE_CANCELLED",
      entityType: "VestingSchedule",
      entityId: scheduleId,
      payload: { cancelledReleases: cancelled.count },
    });

    return { scheduleId, cancelledReleases: cancelled.count };
  });
}

// ─── Procesar releases vencidos (lo llama el cron) ──────────────────

export type ProcessDueReleasesResult = {
  processed: number;
  released: number;
  skipped: number;
  errors: number;
  completedSchedules: number;
};

/**
 * Busca VestingRelease PENDING con `releaseAt <= now` cuyo schedule esté ACTIVE
 * y por cada uno crea un PendingAssignment vía `createPendingFromInvite` — el
 * mismo flujo que una invitación directa del founder. NO asigna directamente;
 * sólo arranca el flujo de validación.
 *
 * Por release (try/catch independiente, no crashea el batch entero):
 *  - Si el pool no alcanza (o cualquier error de dominio) → SKIPPED + audit.
 *  - Si OK → RELEASED, linkea `pendingAssignmentId` + audit.
 *
 * Si tras procesar no quedan releases PENDING en el schedule, lo marca COMPLETED.
 */
export async function processDueReleases(
  now: Date = new Date()
): Promise<ProcessDueReleasesResult> {
  const due = await prisma.vestingRelease.findMany({
    where: {
      status: "PENDING",
      releaseAt: { lte: now },
      schedule: { status: "ACTIVE" },
    },
    orderBy: { releaseAt: "asc" },
    include: {
      schedule: {
        include: {
          project: { select: { id: true, slug: true, name: true, status: true } },
          targetUser: {
            select: { id: true, email: true, fullName: true, isActive: true, deletedAt: true },
          },
        },
      },
    },
  });

  let released = 0;
  let skipped = 0;
  let errors = 0;
  const touchedScheduleIds = new Set<string>();

  for (const release of due) {
    touchedScheduleIds.add(release.scheduleId);
    const schedule = release.schedule;

    try {
      if (schedule.project.status !== "ACTIVE") {
        await markSkipped(release.id, schedule.projectId, {
          reason: "PROJECT_INACTIVE",
          shareCount: release.shareCount,
        });
        skipped++;
        continue;
      }

      // Resolver email + nombre para el flujo de invite.
      let email: string | null = schedule.targetEmail;
      let fullName: string | null = schedule.targetName;
      if (schedule.targetUser) {
        if (!schedule.targetUser.isActive || schedule.targetUser.deletedAt) {
          await markSkipped(release.id, schedule.projectId, {
            reason: "TARGET_INACTIVE",
            shareCount: release.shareCount,
          });
          skipped++;
          continue;
        }
        email = schedule.targetUser.email;
        fullName = schedule.targetUser.fullName;
      }

      if (!email || !fullName) {
        await markSkipped(release.id, schedule.projectId, {
          reason: "MISSING_TARGET_DATA",
          shareCount: release.shareCount,
        });
        skipped++;
        continue;
      }

      // Posición del release dentro del schedule (para reason "N/M").
      const ordinal = await prisma.vestingRelease.count({
        where: {
          scheduleId: schedule.id,
          releaseAt: { lte: release.releaseAt },
        },
      });
      const totalReleases = await prisma.vestingRelease.count({
        where: { scheduleId: schedule.id },
      });
      const reason = `Vesting release ${ordinal}/${totalReleases}${
        schedule.reason ? ` — ${schedule.reason}` : ""
      }`;

      const result = await createPendingFromInvite({
        projectId: schedule.projectId,
        projectSlug: schedule.project.slug,
        proposedById: schedule.createdById,
        inviteEmail: email,
        inviteFullName: fullName,
        inviteMessage: undefined,
        shareCount: release.shareCount,
        reason,
      });

      await prisma.$transaction(async (tx) => {
        await tx.vestingRelease.update({
          where: { id: release.id },
          data: {
            status: "RELEASED",
            releasedAt: new Date(),
            pendingAssignmentId: result.pendingId,
          },
        });
        await recordAudit(tx, {
          actorId: schedule.createdById,
          projectId: schedule.projectId,
          action: "VESTING.RELEASE_EXECUTED",
          entityType: "VestingRelease",
          entityId: release.id,
          payload: {
            scheduleId: schedule.id,
            pendingAssignmentId: result.pendingId,
            shareCount: release.shareCount,
            ordinal,
            totalReleases,
          },
        });
      });
      released++;
    } catch (e) {
      // Pool insuficiente (ValidationError) u otro DomainError → SKIPPED.
      // Cualquier error inesperado también se contiene: SKIPPED + log, sin
      // tirar el batch entero.
      const code = e instanceof DomainError ? e.code : "UNEXPECTED";
      const message = e instanceof Error ? e.message : String(e);
      try {
        await markSkipped(release.id, schedule.projectId, {
          reason: code,
          message,
          shareCount: release.shareCount,
        });
        skipped++;
      } catch (inner) {
        console.error("processDueReleases: failed to mark SKIPPED", release.id, inner);
        errors++;
      }
    }
  }

  // Marcar COMPLETED los schedules sin releases PENDING restantes.
  let completedSchedules = 0;
  for (const scheduleId of touchedScheduleIds) {
    const remaining = await prisma.vestingRelease.count({
      where: { scheduleId, status: "PENDING" },
    });
    if (remaining === 0) {
      const sched = await prisma.vestingSchedule.findUnique({
        where: { id: scheduleId },
        select: { status: true },
      });
      if (sched?.status === "ACTIVE") {
        await prisma.vestingSchedule.update({
          where: { id: scheduleId },
          data: { status: "COMPLETED" },
        });
        completedSchedules++;
      }
    }
  }

  return {
    processed: due.length,
    released,
    skipped,
    errors,
    completedSchedules,
  };
}

async function markSkipped(
  releaseId: string,
  projectId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.vestingRelease.update({
      where: { id: releaseId },
      data: { status: "SKIPPED", releasedAt: new Date() },
    });
    await recordAudit(tx, {
      actorId: null,
      projectId,
      action: "VESTING.RELEASE_SKIPPED",
      entityType: "VestingRelease",
      entityId: releaseId,
      payload,
    });
  });
  console.warn("[vesting] release SKIPPED", releaseId, payload);
}

// ─── Lectura para el dashboard del founder ──────────────────────────

export type VestingScheduleView = {
  id: string;
  status: string;
  targetLabel: string;
  targetEmail: string | null;
  totalShares: number;
  reason: string | null;
  createdAt: Date;
  releasedCount: number;
  totalReleases: number;
  deliveredShares: number;
  nextReleaseAt: Date | null;
  releases: Array<{
    id: string;
    shareCount: number;
    releaseAt: Date;
    status: string;
  }>;
};

export async function listVestingSchedules(
  projectId: string
): Promise<VestingScheduleView[]> {
  const schedules = await prisma.vestingSchedule.findMany({
    where: { projectId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      targetUser: { select: { fullName: true, alias: true, email: true } },
      releases: { orderBy: { releaseAt: "asc" } },
    },
  });

  return schedules.map((s) => {
    const releasedCount = s.releases.filter((r) => r.status === "RELEASED").length;
    const deliveredShares = s.releases
      .filter((r) => r.status === "RELEASED")
      .reduce((sum, r) => sum + r.shareCount, 0);
    const nextPending = s.releases.find((r) => r.status === "PENDING");
    const targetLabel =
      s.targetUser?.alias ??
      s.targetUser?.fullName ??
      s.targetName ??
      s.targetEmail ??
      "—";
    return {
      id: s.id,
      status: s.status,
      targetLabel,
      targetEmail: s.targetUser?.email ?? s.targetEmail,
      totalShares: s.totalShares,
      reason: s.reason,
      createdAt: s.createdAt,
      releasedCount,
      totalReleases: s.releases.length,
      deliveredShares,
      nextReleaseAt: nextPending?.releaseAt ?? null,
      releases: s.releases.map((r) => ({
        id: r.id,
        shareCount: r.shareCount,
        releaseAt: r.releaseAt,
        status: r.status,
      })),
    };
  });
}
