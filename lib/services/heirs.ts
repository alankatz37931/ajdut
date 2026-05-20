/**
 * Servicio de herederos y verificación de vida (Ola 7b).
 *
 * - Heir: cada miembro carga sus herederos con un % de reparto. La suma de
 *   sharePercent por user no puede exceder 100. AJDUT no ejecuta transferencias
 *   automáticas — solo guarda los datos para que el equipo pueda contactarlos
 *   manualmente si dejan de responder.
 *
 * - ValidationCheck: cada cierto tiempo (validationFrequencyMonths) el sistema
 *   crea un check PENDING y manda email al user. Si no responde en N días
 *   (VALIDATION_WINDOW_DAYS), el check pasa a MISSED y missedValidationCount++.
 *   Tras 3 misses consecutivos sin confirmación, heirsEscalated=true y el admin
 *   recibe alerta (una sola vez hasta que el user confirme y se resetee).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import {
  notifyUserValidationCheck,
  notifyAdminsHeirsEscalation,
} from "@/lib/email/notifications";
import {
  ForbiddenError,
  InvariantViolation,
  NotFoundError,
  ValidationError,
} from "./errors";

/** Días que tiene el miembro para responder un check antes de marcarlo MISSED. */
export const VALIDATION_WINDOW_DAYS = 15;

/** Cantidad de MISSED consecutivos que disparan la escalación al admin. */
export const ESCALATION_THRESHOLD = 3;

/** Frecuencias permitidas (en meses). 0 = deshabilitado. */
export const ALLOWED_FREQUENCIES = [0, 1, 3, 6, 12] as const;
export type AllowedFrequency = (typeof ALLOWED_FREQUENCIES)[number];

export type HeirRow = {
  id: string;
  fullName: string;
  email: string | null;
  relationship: string | null;
  sharePercent: number;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Listado ────────────────────────────────────────────────────────

export async function listHeirs(userId: string): Promise<HeirRow[]> {
  const rows = await prisma.heir.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toRow);
}

function toRow(h: {
  id: string;
  fullName: string;
  email: string | null;
  relationship: string | null;
  sharePercent: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
}): HeirRow {
  return {
    id: h.id,
    fullName: h.fullName,
    email: h.email,
    relationship: h.relationship,
    sharePercent: Number(h.sharePercent),
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  };
}

// ─── Validaciones compartidas ───────────────────────────────────────

function normalizeFullName(raw: string): string {
  const v = raw.trim().replace(/\s+/g, " ");
  if (v.length < 2) {
    throw new ValidationError("fullName", "El nombre completo es obligatorio.");
  }
  if (v.length > 120) {
    throw new ValidationError("fullName", "Máximo 120 caracteres.");
  }
  return v;
}

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v.length === 0) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    throw new ValidationError("email", "Email inválido.");
  }
  if (v.length > 200) {
    throw new ValidationError("email", "Máximo 200 caracteres.");
  }
  return v;
}

function normalizeRelationship(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (v.length === 0) return null;
  if (v.length > 80) {
    throw new ValidationError("relationship", "Máximo 80 caracteres.");
  }
  return v;
}

function normalizeShare(raw: number): number {
  if (!Number.isFinite(raw)) {
    throw new ValidationError("sharePercent", "Porcentaje inválido.");
  }
  // Redondeamos a 2 decimales para que Decimal(5,2) no se queje.
  const v = Math.round(raw * 100) / 100;
  if (v < 0.01 || v > 100) {
    throw new ValidationError(
      "sharePercent",
      "El porcentaje debe estar entre 0.01 y 100."
    );
  }
  return v;
}

async function totalShareExcluding(
  tx: Prisma.TransactionClient,
  userId: string,
  excludeHeirId: string | null
): Promise<number> {
  const agg = await tx.heir.aggregate({
    where: {
      userId,
      ...(excludeHeirId ? { NOT: { id: excludeHeirId } } : {}),
    },
    _sum: { sharePercent: true },
  });
  return Number(agg._sum.sharePercent ?? 0);
}

// ─── CRUD de herederos ──────────────────────────────────────────────

export type AddHeirInput = {
  userId: string;
  fullName: string;
  email?: string | null;
  relationship?: string | null;
  sharePercent: number;
};

export async function addHeir(input: AddHeirInput): Promise<HeirRow> {
  const fullName = normalizeFullName(input.fullName);
  const email = normalizeEmail(input.email);
  const relationship = normalizeRelationship(input.relationship);
  const share = normalizeShare(input.sharePercent);

  return prisma.$transaction(async (tx) => {
    const used = await totalShareExcluding(tx, input.userId, null);
    const next = Math.round((used + share) * 100) / 100;
    if (next > 100) {
      throw new ValidationError(
        "sharePercent",
        `La suma de los % no puede superar 100 (actual ${used.toFixed(2)}%, queda ${(
          100 - used
        ).toFixed(2)}%).`
      );
    }

    const heir = await tx.heir.create({
      data: {
        userId: input.userId,
        fullName,
        email,
        relationship,
        sharePercent: new Prisma.Decimal(share.toFixed(2)),
      },
    });

    await recordAudit(tx, {
      actorId: input.userId,
      action: "HEIR.ADDED",
      entityType: "Heir",
      entityId: heir.id,
      payload: { fullName, sharePercent: share, hasEmail: !!email },
    });

    return toRow(heir);
  });
}

export type UpdateHeirInput = {
  heirId: string;
  actorId: string;
  fullName: string;
  email?: string | null;
  relationship?: string | null;
  sharePercent: number;
};

export async function updateHeir(input: UpdateHeirInput): Promise<HeirRow> {
  const fullName = normalizeFullName(input.fullName);
  const email = normalizeEmail(input.email);
  const relationship = normalizeRelationship(input.relationship);
  const share = normalizeShare(input.sharePercent);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.heir.findUnique({ where: { id: input.heirId } });
    if (!existing) throw new NotFoundError("Heir", input.heirId);
    if (existing.userId !== input.actorId) {
      throw new ForbiddenError("Solo el dueño puede editar a sus herederos.");
    }

    const used = await totalShareExcluding(tx, existing.userId, existing.id);
    const next = Math.round((used + share) * 100) / 100;
    if (next > 100) {
      throw new ValidationError(
        "sharePercent",
        `La suma de los % no puede superar 100 (actual sin éste ${used.toFixed(2)}%, queda ${(
          100 - used
        ).toFixed(2)}%).`
      );
    }

    const updated = await tx.heir.update({
      where: { id: existing.id },
      data: {
        fullName,
        email,
        relationship,
        sharePercent: new Prisma.Decimal(share.toFixed(2)),
      },
    });

    await recordAudit(tx, {
      actorId: input.actorId,
      action: "HEIR.UPDATED",
      entityType: "Heir",
      entityId: updated.id,
      payload: { fullName, sharePercent: share },
    });

    return toRow(updated);
  });
}

export type RemoveHeirInput = {
  heirId: string;
  actorId: string;
};

export async function removeHeir(input: RemoveHeirInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.heir.findUnique({ where: { id: input.heirId } });
    if (!existing) throw new NotFoundError("Heir", input.heirId);
    if (existing.userId !== input.actorId) {
      throw new ForbiddenError("Solo el dueño puede eliminar a sus herederos.");
    }
    await tx.heir.delete({ where: { id: existing.id } });
    await recordAudit(tx, {
      actorId: input.actorId,
      action: "HEIR.REMOVED",
      entityType: "Heir",
      entityId: existing.id,
      payload: { fullName: existing.fullName, sharePercent: Number(existing.sharePercent) },
    });
  });
}

// ─── Validación de vida — frecuencia ────────────────────────────────

export type SetFrequencyInput = {
  userId: string;
  months: number;
};

export async function setValidationFrequency(input: SetFrequencyInput): Promise<void> {
  if (!ALLOWED_FREQUENCIES.includes(input.months as AllowedFrequency)) {
    throw new ValidationError(
      "months",
      `Frecuencia inválida. Permitidas: ${ALLOWED_FREQUENCIES.join(", ")}.`
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { validationFrequencyMonths: input.months },
    });
    await recordAudit(tx, {
      actorId: input.userId,
      action: "VALIDATION.FREQUENCY_UPDATED",
      entityType: "User",
      entityId: input.userId,
      payload: { months: input.months },
    });
  });
}

// ─── Crear un check (envía email al user) ──────────────────────────

export type ScheduleCheckResult = {
  checkId: string;
  status: "CREATED" | "ALREADY_PENDING" | "DISABLED";
};

export async function scheduleValidationCheck(
  userId: string
): Promise<ScheduleCheckResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      alias: true,
      isActive: true,
      deletedAt: true,
      validationFrequencyMonths: true,
    },
  });
  if (!user) throw new NotFoundError("User", userId);
  if (!user.isActive || user.deletedAt) {
    throw new InvariantViolation("U_INACTIVE", "El usuario no está activo.");
  }
  if (user.validationFrequencyMonths <= 0) {
    return { checkId: "", status: "DISABLED" };
  }

  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.validationCheck.findFirst({
      where: { userId, status: "PENDING" },
      orderBy: { sentAt: "desc" },
      select: { id: true },
    });
    if (pending) {
      return { checkId: pending.id, status: "ALREADY_PENDING" as const };
    }
    const created = await tx.validationCheck.create({
      data: { userId, status: "PENDING" },
    });
    await recordAudit(tx, {
      actorId: null,
      action: "VALIDATION.SCHEDULED",
      entityType: "ValidationCheck",
      entityId: created.id,
      payload: { userId, frequencyMonths: user.validationFrequencyMonths },
    });
    return { checkId: created.id, status: "CREATED" as const };
  });

  if (result.status === "CREATED") {
    // Fire-and-forget: si el email falla, el check ya existe; el cron lo
    // marcará MISSED igual y el audit registra el fallo.
    await notifyUserValidationCheck({
      to: user.email,
      fullName: user.alias ?? user.fullName,
      checkId: result.checkId,
      windowDays: VALIDATION_WINDOW_DAYS,
    });
  }
  return result;
}

// ─── Confirmar (cuando el user pulsa el botón del email) ───────────

export type ConfirmResult =
  | { ok: true; confirmedAt: Date }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_RESPONDED" };

/**
 * Marca el check PENDING como CONFIRMED y resetea los contadores. Se usa
 * desde la ruta pública /confirmar-vida/[id]. Si el check ya está respondido
 * (CONFIRMED o MISSED) devolvemos un resultado neutro — la pantalla muestra
 * "ya confirmaste" sin filtrar info sensible.
 */
export async function markValidationConfirmed(
  checkId: string
): Promise<ConfirmResult> {
  return prisma.$transaction(async (tx) => {
    const check = await tx.validationCheck.findUnique({
      where: { id: checkId },
      select: { id: true, userId: true, status: true },
    });
    if (!check) return { ok: false as const, reason: "NOT_FOUND" as const };
    if (check.status !== "PENDING") {
      return { ok: false as const, reason: "ALREADY_RESPONDED" as const };
    }

    const now = new Date();
    await tx.validationCheck.update({
      where: { id: check.id },
      data: { status: "CONFIRMED", respondedAt: now },
    });
    await tx.user.update({
      where: { id: check.userId },
      data: {
        lastValidationConfirmedAt: now,
        missedValidationCount: 0,
        heirsEscalated: false,
      },
    });
    await recordAudit(tx, {
      actorId: check.userId,
      action: "VALIDATION.CONFIRMED",
      entityType: "ValidationCheck",
      entityId: check.id,
      payload: { userId: check.userId },
    });

    return { ok: true as const, confirmedAt: now };
  });
}

// ─── Marcar como MISSED (escalación si corresponde) ────────────────

export type MarkMissedResult = {
  status: "MISSED" | "ALREADY_MISSED" | "NOT_PENDING" | "NOT_DUE_YET" | "NOT_FOUND";
  escalated: boolean;
  missedCount: number;
};

/**
 * Marca un check PENDING como MISSED si pasaron más de VALIDATION_WINDOW_DAYS
 * desde su sentAt. Incrementa el contador del user. Si llega a ESCALATION_THRESHOLD
 * y heirsEscalated es false, lo flagea y manda alerta a admins.
 *
 * Esta función es idempotente — llamarla dos veces sobre el mismo check no
 * dispara dos escalaciones.
 */
export async function markValidationMissed(input: {
  checkId: string;
}): Promise<MarkMissedResult> {
  const result = await prisma.$transaction(async (tx) => {
    const check = await tx.validationCheck.findUnique({
      where: { id: input.checkId },
      select: { id: true, userId: true, status: true, sentAt: true },
    });
    if (!check) {
      return {
        status: "NOT_FOUND" as const,
        escalated: false,
        missedCount: 0,
        user: null,
      };
    }
    if (check.status === "MISSED") {
      const u = await tx.user.findUnique({
        where: { id: check.userId },
        select: { missedValidationCount: true },
      });
      return {
        status: "ALREADY_MISSED" as const,
        escalated: false,
        missedCount: u?.missedValidationCount ?? 0,
        user: null,
      };
    }
    if (check.status !== "PENDING") {
      return {
        status: "NOT_PENDING" as const,
        escalated: false,
        missedCount: 0,
        user: null,
      };
    }
    const dueAt = new Date(check.sentAt.getTime() + VALIDATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (Date.now() < dueAt.getTime()) {
      return {
        status: "NOT_DUE_YET" as const,
        escalated: false,
        missedCount: 0,
        user: null,
      };
    }

    await tx.validationCheck.update({
      where: { id: check.id },
      data: { status: "MISSED", respondedAt: null },
    });
    const updatedUser = await tx.user.update({
      where: { id: check.userId },
      data: { missedValidationCount: { increment: 1 } },
      select: {
        id: true,
        email: true,
        fullName: true,
        alias: true,
        missedValidationCount: true,
        heirsEscalated: true,
      },
    });

    await recordAudit(tx, {
      actorId: null,
      action: "VALIDATION.MISSED",
      entityType: "ValidationCheck",
      entityId: check.id,
      payload: {
        userId: check.userId,
        missedCount: updatedUser.missedValidationCount,
        windowDays: VALIDATION_WINDOW_DAYS,
      },
    });

    let escalated = false;
    if (
      updatedUser.missedValidationCount >= ESCALATION_THRESHOLD &&
      !updatedUser.heirsEscalated
    ) {
      await tx.user.update({
        where: { id: updatedUser.id },
        data: { heirsEscalated: true },
      });
      await tx.validationCheck.update({
        where: { id: check.id },
        data: { escalatedAt: new Date() },
      });
      await recordAudit(tx, {
        actorId: null,
        action: "VALIDATION.ESCALATED",
        entityType: "User",
        entityId: updatedUser.id,
        payload: {
          missedCount: updatedUser.missedValidationCount,
          checkId: check.id,
        },
      });
      escalated = true;
    }

    return {
      status: "MISSED" as const,
      escalated,
      missedCount: updatedUser.missedValidationCount,
      user: escalated ? updatedUser : null,
    };
  });

  // Email al admin fuera de la transacción para no bloquearla con I/O externa.
  if (result.escalated && result.user) {
    await notifyAdminsHeirsEscalation({
      userFullName: result.user.alias ?? result.user.fullName,
      userEmail: result.user.email,
      missedCount: result.missedCount,
    });
  }

  return {
    status: result.status,
    escalated: result.escalated,
    missedCount: result.missedCount,
  };
}

// ─── Cron pass manual: barrer todos los users ──────────────────────

export type CronRunStats = {
  usersConsidered: number;
  checksCreated: number;
  alreadyPending: number;
  checksMissed: number;
  escalations: number;
};

/**
 * Una pasada del scheduler: para cada user activo con frecuencia > 0
 *   1) marca como MISSED todo check PENDING vencido (>15 días)
 *   2) si no hay PENDING activo y pasó el periodo desde lastConfirmed,
 *      crea un nuevo ValidationCheck y manda email.
 *
 * Pensada para ejecutarse manualmente desde /admin/herederos (sin infra de
 * cron real). Idempotente: doble click no genera doble check.
 */
export async function runValidationCronPass(): Promise<CronRunStats> {
  const stats: CronRunStats = {
    usersConsidered: 0,
    checksCreated: 0,
    alreadyPending: 0,
    checksMissed: 0,
    escalations: 0,
  };

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      validationFrequencyMonths: { gt: 0 },
    },
    select: {
      id: true,
      validationFrequencyMonths: true,
      lastValidationConfirmedAt: true,
      createdAt: true,
    },
  });

  for (const u of users) {
    stats.usersConsidered += 1;

    // 1) Vencer checks PENDING
    const pendingChecks = await prisma.validationCheck.findMany({
      where: { userId: u.id, status: "PENDING" },
      select: { id: true, sentAt: true },
    });
    let hasActivePending = false;
    for (const c of pendingChecks) {
      const dueAt = new Date(
        c.sentAt.getTime() + VALIDATION_WINDOW_DAYS * 24 * 60 * 60 * 1000
      );
      if (Date.now() >= dueAt.getTime()) {
        const r = await markValidationMissed({ checkId: c.id });
        if (r.status === "MISSED") stats.checksMissed += 1;
        if (r.escalated) stats.escalations += 1;
      } else {
        hasActivePending = true;
      }
    }

    // 2) Crear nuevo check si toca y no hay otro PENDING activo
    if (hasActivePending) {
      stats.alreadyPending += 1;
      continue;
    }
    const lastConfirmed = u.lastValidationConfirmedAt ?? u.createdAt;
    const monthsSince = monthsBetween(lastConfirmed, new Date());
    if (monthsSince >= u.validationFrequencyMonths) {
      try {
        const r = await scheduleValidationCheck(u.id);
        if (r.status === "CREATED") stats.checksCreated += 1;
        if (r.status === "ALREADY_PENDING") stats.alreadyPending += 1;
      } catch {
        // Si falla la creación de uno (ej. user borrado entre queries), seguimos.
      }
    }
  }

  return stats;
}

function monthsBetween(from: Date, to: Date): number {
  // Aproximación cómoda: 30.4375 días por mes. No necesitamos precisión
  // calendárica exacta para decidir si toca verificación.
  const ms = to.getTime() - from.getTime();
  return ms / (30.4375 * 24 * 60 * 60 * 1000);
}

// ─── Helpers de lectura para UI ─────────────────────────────────────

export type ValidationState = {
  frequencyMonths: number;
  lastConfirmedAt: Date | null;
  missedCount: number;
  heirsEscalated: boolean;
  pendingCheck: { id: string; sentAt: Date } | null;
};

export async function getValidationState(userId: string): Promise<ValidationState> {
  const [user, pending] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        validationFrequencyMonths: true,
        lastValidationConfirmedAt: true,
        missedValidationCount: true,
        heirsEscalated: true,
      },
    }),
    prisma.validationCheck.findFirst({
      where: { userId, status: "PENDING" },
      orderBy: { sentAt: "desc" },
      select: { id: true, sentAt: true },
    }),
  ]);
  if (!user) throw new NotFoundError("User", userId);
  return {
    frequencyMonths: user.validationFrequencyMonths,
    lastConfirmedAt: user.lastValidationConfirmedAt,
    missedCount: user.missedValidationCount,
    heirsEscalated: user.heirsEscalated,
    pendingCheck: pending ? { id: pending.id, sentAt: pending.sentAt } : null,
  };
}

export type EscalatedUserRow = {
  id: string;
  fullName: string;
  alias: string | null;
  email: string;
  missedValidationCount: number;
  lastValidationConfirmedAt: Date | null;
  heirs: HeirRow[];
};

export async function listEscalatedUsers(): Promise<EscalatedUserRow[]> {
  const users = await prisma.user.findMany({
    where: { heirsEscalated: true, isActive: true, deletedAt: null },
    select: {
      id: true,
      fullName: true,
      alias: true,
      email: true,
      missedValidationCount: true,
      lastValidationConfirmedAt: true,
      heirs: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { missedValidationCount: "desc" },
  });
  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    alias: u.alias,
    email: u.email,
    missedValidationCount: u.missedValidationCount,
    lastValidationConfirmedAt: u.lastValidationConfirmedAt,
    heirs: u.heirs.map(toRow),
  }));
}
