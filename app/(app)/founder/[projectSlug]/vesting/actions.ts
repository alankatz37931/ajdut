"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import {
  createVestingSchedule,
  cancelVestingSchedule,
} from "@/lib/services/vesting";
import { DomainError } from "@/lib/services/errors";

export type CreateVestingResult =
  | {
      ok: true;
      data: {
        scheduleId: string;
        releaseCount: number;
        totalShares: number;
        exceedsAvailableWarning: boolean;
      };
    }
  | { ok: false; error: string; code?: string };

/**
 * Parsea una fecha "YYYY-MM-DD" (del <input type=date>) a un Date local a las
 * 08:00 — coincide con la hora del cron diario para que el día indicado se
 * procese ese mismo día. Devuelve null si es inválida.
 */
function parseDateInput(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T08:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function createVestingScheduleAction(
  projectSlug: string,
  formData: FormData
): Promise<CreateVestingResult> {
  const actor = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, ownerId: true, status: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado." };

  const access = await getProjectAccess({
    userId: actor.id,
    userRole: actor.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canEdit && access.role !== "CO_ADMIN" && access.role !== "ADMIN") {
    return {
      ok: false,
      error: "No tenés permiso para crear cronogramas en este proyecto.",
    };
  }

  const mode = String(formData.get("mode") ?? "monthly");
  const targetMode = String(formData.get("targetMode") ?? "email"); // "email" | "user"
  const targetUserIdRaw = String(formData.get("targetUserId") ?? "").trim();
  const email = String(formData.get("targetEmail") ?? "").trim().toLowerCase();
  const name = String(formData.get("targetName") ?? "").trim();
  const totalRaw = String(formData.get("totalShares") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const totalShares = Number.parseInt(totalRaw, 10);

  if (!Number.isFinite(totalShares) || totalShares < 1) {
    return {
      ok: false,
      error: "El total de participaciones debe ser un entero mayor o igual a 1.",
    };
  }

  // ─ Destinatario ─
  let targetUserId: string | null = null;
  let targetEmail: string | null = null;
  let targetName: string | null = null;
  if (targetMode === "user" && targetUserIdRaw) {
    targetUserId = targetUserIdRaw;
  } else {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "El email del destinatario no es válido." };
    }
    if (name.length < 2) {
      return { ok: false, error: "Falta el nombre del destinatario." };
    }
    targetEmail = email;
    targetName = name;
  }

  // ─ Modo del cronograma ─
  let monthly: { installments: number; startAt: Date } | undefined;
  let releases: Array<{ shareCount: number; releaseAt: Date }> | undefined;

  if (mode === "monthly") {
    const installments = Number.parseInt(
      String(formData.get("installments") ?? "").trim(),
      10
    );
    const startAt = parseDateInput(String(formData.get("startAt") ?? ""));
    if (!Number.isFinite(installments) || installments < 1) {
      return { ok: false, error: "El número de tramos debe ser un entero mayor o igual a 1." };
    }
    if (!startAt) {
      return { ok: false, error: "La fecha de inicio no es válida." };
    }
    monthly = { installments, startAt };
  } else {
    // Custom: tramos serializados como JSON [{shareCount, date}]
    const customRaw = String(formData.get("customReleases") ?? "[]");
    let parsed: Array<{ shareCount: number; date: string }>;
    try {
      parsed = JSON.parse(customRaw);
    } catch {
      return { ok: false, error: "No se pudieron leer los tramos personalizados." };
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { ok: false, error: "Hace falta al menos un tramo." };
    }
    const built: Array<{ shareCount: number; releaseAt: Date }> = [];
    for (const r of parsed) {
      const sc = Number.parseInt(String(r.shareCount), 10);
      const dt = parseDateInput(String(r.date ?? ""));
      if (!Number.isFinite(sc) || sc < 1) {
        return { ok: false, error: "Cada tramo debe entregar un entero mayor o igual a 1." };
      }
      if (!dt) {
        return { ok: false, error: "Hay un tramo con fecha inválida." };
      }
      built.push({ shareCount: sc, releaseAt: dt });
    }
    releases = built;
  }

  try {
    const result = await createVestingSchedule({
      projectId: project.id,
      createdById: actor.id,
      targetUserId,
      targetEmail,
      targetName,
      totalShares,
      reason: reason || null,
      monthly,
      releases,
    });
    revalidatePath(`/founder/${projectSlug}/vesting`);
    return {
      ok: true,
      data: {
        scheduleId: result.scheduleId,
        releaseCount: result.releaseCount,
        totalShares: result.totalShares,
        exceedsAvailableWarning: result.exceedsAvailableWarning,
      },
    };
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error("createVestingScheduleAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }
}

export type CancelVestingResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

export async function cancelVestingScheduleAction(
  projectSlug: string,
  scheduleId: string
): Promise<CancelVestingResult> {
  const actor = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, ownerId: true, status: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado." };

  const access = await getProjectAccess({
    userId: actor.id,
    userRole: actor.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canEdit && access.role !== "CO_ADMIN" && access.role !== "ADMIN") {
    return { ok: false, error: "No tenés permiso para cancelar este cronograma." };
  }

  try {
    await cancelVestingSchedule(scheduleId, actor.id);
    revalidatePath(`/founder/${projectSlug}/vesting`);
    return { ok: true };
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error("cancelVestingScheduleAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }
}
