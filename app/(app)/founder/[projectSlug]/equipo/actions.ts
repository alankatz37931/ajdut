"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { DomainError, ValidationError } from "@/lib/services/errors";
import {
  upsertFounder,
  removeFounder,
} from "@/lib/services/project-content";
import { normalizeOptionalUrl } from "@/lib/utils/url";
import { buildCapTableInput, CAP_TABLE_INCLUDE } from "@/lib/services/project";
import { computeCapTable } from "@/lib/services/cap-table";

type Result =
  | { ok: true }
  | { ok: false; error: string; code?: string; field?: string };

type ExternalDTO = {
  id: string;
  label: string;
  classId: string;
  peopleCount: number;
  shareCount: number;
};

export type UpsertExternalResult =
  | { ok: true; holding: ExternalDTO }
  | { ok: false; error: string; code?: string; field?: string };

/**
 * DomainError → message + code + field (si vino en details).
 * Cualquier otro Error → log servidor + mensaje genérico, para no filtrar
 * códigos Prisma ni nombres de tabla al cliente.
 */
function toFailure(e: unknown, tag: string): Extract<Result, { ok: false }> {
  if (e instanceof DomainError) {
    const field = (e.details as { field?: string } | undefined)?.field;
    return { ok: false, error: e.message, code: e.code, field };
  }
  console.error(`[equipo:${tag}]`, e);
  return { ok: false, error: "Error inesperado." };
}

async function resolveProjectId(slug: string, ownerId: string) {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, ownerId: true },
  });
  if (!project || project.ownerId !== ownerId) return null;
  return project.id;
}

export async function upsertFounderAction(
  projectSlug: string,
  formData: FormData
): Promise<Result> {
  const user = await requireRole(["PROJECT_OWNER"]);
  const projectId = await resolveProjectId(projectSlug, user.id);
  if (!projectId) return { ok: false, error: "Proyecto no encontrado." };

  const founderId = String(formData.get("founderId") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const references = String(formData.get("references") ?? "").trim();
  const linkedinUrlNormalized = normalizeOptionalUrl(formData.get("linkedinUrl"));
  if (linkedinUrlNormalized === "INVALID") {
    return {
      ok: false,
      error: "El link de LinkedIn no es válido — solo http/https.",
      field: "linkedinUrl",
    };
  }
  const equityRaw = String(formData.get("equityPercent") ?? "0");
  const equityPercent = Number.parseFloat(equityRaw);
  const joinedAtStr = String(formData.get("joinedAt") ?? "").trim();
  const joinedAt = joinedAtStr ? new Date(joinedAtStr) : null;
  const isActive = String(formData.get("isActive") ?? "true") === "true";
  const shareholderClassIdRaw = String(formData.get("shareholderClassId") ?? "").trim();
  const shareholderClassId = shareholderClassIdRaw || null;
  const vestingMonthsRaw = String(formData.get("vestingMonths") ?? "").trim();
  const vestingMonths = vestingMonthsRaw
    ? Number.parseInt(vestingMonthsRaw, 10)
    : null;
  const vestingInitialRaw = String(
    formData.get("vestingInitialPercent") ?? ""
  ).trim();
  const vestingInitialPercent = vestingInitialRaw
    ? Number.parseFloat(vestingInitialRaw)
    : null;
  const vestingFinalRaw = String(
    formData.get("vestingFinalPercent") ?? ""
  ).trim();
  const vestingFinalPercent = vestingFinalRaw
    ? Number.parseFloat(vestingFinalRaw)
    : null;

  try {
    await upsertFounder({
      actorId: user.id,
      projectId,
      founderId: founderId || undefined,
      fullName,
      role,
      bio: bio || null,
      references: references || null,
      linkedinUrl: linkedinUrlNormalized,
      equityPercent: Number.isFinite(equityPercent) ? equityPercent : 0,
      joinedAt,
      isActive,
      shareholderClassId,
      vestingMonths: vestingMonths !== null && Number.isFinite(vestingMonths) ? vestingMonths : null,
      vestingInitialPercent:
        vestingInitialPercent !== null && Number.isFinite(vestingInitialPercent)
          ? vestingInitialPercent
          : null,
      vestingFinalPercent:
        vestingFinalPercent !== null && Number.isFinite(vestingFinalPercent)
          ? vestingFinalPercent
          : null,
    });
    revalidatePath(`/founder/${projectSlug}/equipo`);
    revalidatePath(`/founder/${projectSlug}`);
    revalidatePath(`/proyectos/${projectSlug}`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "upsertFounderAction");
  }
}

export async function removeFounderAction(
  projectSlug: string,
  founderId: string
): Promise<Result> {
  const user = await requireRole(["PROJECT_OWNER"]);
  const projectId = await resolveProjectId(projectSlug, user.id);
  if (!projectId) return { ok: false, error: "Proyecto no encontrado." };

  try {
    await removeFounder({ actorId: user.id, projectId, founderId });
    revalidatePath(`/founder/${projectSlug}/equipo`);
    revalidatePath(`/founder/${projectSlug}`);
    revalidatePath(`/proyectos/${projectSlug}`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "removeFounderAction");
  }
}

/* ─── Composición de participaciones ─────────────────────────────────────
 * La Composición vive embebida en la página de Equipo (la ruta /composicion
 * es solo un redirect), así que sus server actions conviven acá. */

/** Carga el proyecto y verifica que el viewer sea su owner. Throws si no. */
async function ownedProject(projectSlug: string) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, ownerId: true },
  });
  if (!project || project.ownerId !== user.id) {
    throw new Error("Proyecto no encontrado.");
  }
  return project;
}

/**
 * Las 4 clases de participación son FIJAS (ver `lib/services/shareholder-class`):
 * no se crean, renombran ni borran. El owner solo REASIGNA participantes entre
 * ellas. Por eso este helper valida que la clase destino exista en el proyecto Y
 * sea una de las canónicas (`kind != null`); las legacy sin `kind` no son
 * destino válido. Devuelve el `id` resuelto o `null` para "sin clase".
 */
async function resolveCanonicalClass(
  projectId: string,
  classId: string
): Promise<string | null> {
  if (!classId) return null;
  const cls = await prisma.shareholderClass.findUnique({ where: { id: classId } });
  if (!cls || cls.projectId !== projectId || cls.kind === null) {
    throw new ValidationError("classId", "Clase no encontrada.");
  }
  return classId;
}

export async function assignHolderClassAction(
  projectSlug: string,
  holderUserId: string,
  classId: string
): Promise<Result> {
  try {
    const project = await ownedProject(projectSlug);
    const resolved = await resolveCanonicalClass(project.id, classId);
    await prisma.participation.updateMany({
      where: { projectId: project.id, currentOwnerId: holderUserId },
      data: { shareholderClassId: resolved },
    });
    revalidatePath(`/founder/${projectSlug}/equipo`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "assignHolderClassAction");
  }
}

export async function upsertExternalHoldingAction(
  projectSlug: string,
  input: {
    id?: string;
    label: string;
    classId: string;
    peopleCount: number;
    shareCount: number;
  }
): Promise<UpsertExternalResult> {
  try {
    const project = await ownedProject(projectSlug);
    const label = input.label.trim();
    // Validamos NaN/Infinity ANTES de truncar — `Math.trunc(NaN) === NaN`
    // se cuela del !isFinite anterior y deja caer la falla recién en Prisma.
    if (!Number.isFinite(input.peopleCount) || !Number.isFinite(input.shareCount)) {
      return { ok: false, error: "Cantidad inválida." };
    }
    const peopleCount = Math.trunc(input.peopleCount);
    const shareCount = Math.trunc(input.shareCount);
    if (!Number.isInteger(peopleCount) || peopleCount < 1) {
      return { ok: false, error: "La cantidad de personas debe ser al menos 1." };
    }
    if (!Number.isInteger(shareCount) || shareCount < 1) {
      return { ok: false, error: "La cantidad de participaciones debe ser al menos 1." };
    }
    // Cap defensivo: 1e9 personas/acciones es claramente input erróneo y
    // protege contra inputs absurdos que pueden romper queries downstream.
    if (peopleCount > 1e9) {
      return { ok: false, error: "La cantidad de personas excede el límite permitido." };
    }
    if (shareCount > 1e9) {
      return { ok: false, error: "La cantidad de participaciones excede el límite permitido." };
    }
    const resolved = await resolveCanonicalClass(project.id, input.classId);

    // ── Candado del cap table unificado ──────────────────────────────
    // equipo + plataforma + asignados + (todas las externas CON el cambio) no
    // pueden superar el total emitido (100%). Permitimos reducir en proyectos
    // legacy ya >100%; solo bloqueamos cuando el cambio AUMENTA el comprometido
    // por encima del total.
    const capProject = await prisma.project.findUnique({
      where: { id: project.id },
      include: CAP_TABLE_INCLUDE,
    });
    if (!capProject) return { ok: false, error: "Proyecto no encontrado." };
    const totalShares = capProject.totalShares;

    // Resto comprometido sin externas (equipo + plataforma + asignados).
    const restShares = computeCapTable({
      ...buildCapTableInput(capProject),
      externalHoldings: [],
    }).committedShares;

    const existingHoldings = await prisma.externalHolding.findMany({
      where: { projectId: project.id },
      select: { id: true, shareCount: true },
    });
    const currentExternalShares = existingHoldings.reduce((s, h) => s + h.shareCount, 0);
    const newExternalShares = existingHoldings
      .filter((h) => h.id !== input.id)
      .reduce((s, h) => s + h.shareCount, 0) + shareCount;

    const currentCommitted = restShares + currentExternalShares;
    const newCommitted = restShares + newExternalShares;
    if (newCommitted > totalShares && newCommitted > currentCommitted) {
      throw new ValidationError(
        "shareCount",
        "El cap table superaría el 100%. El equipo + tenencias + asignados no pueden exceder el total de participaciones emitidas. Una opción es revisar los porcentajes; otra, emitir más junto con los propietarios."
      );
    }

    const data = {
      label: label || null,
      shareholderClassId: resolved,
      peopleCount,
      shareCount,
    };
    let row;
    if (input.id) {
      const existing = await prisma.externalHolding.findUnique({
        where: { id: input.id },
      });
      if (!existing || existing.projectId !== project.id) {
        return { ok: false, error: "Tenencia no encontrada." };
      }
      row = await prisma.externalHolding.update({ where: { id: input.id }, data });
    } else {
      row = await prisma.externalHolding.create({
        data: { ...data, projectId: project.id },
      });
    }
    revalidatePath(`/founder/${projectSlug}/equipo`);
    return {
      ok: true,
      holding: {
        id: row.id,
        label: row.label ?? "",
        classId: row.shareholderClassId ?? "",
        peopleCount: row.peopleCount,
        shareCount: row.shareCount,
      },
    };
  } catch (e) {
    return toFailure(e, "upsertExternalHoldingAction");
  }
}

export async function removeExternalHoldingAction(
  projectSlug: string,
  holdingId: string
): Promise<Result> {
  try {
    const project = await ownedProject(projectSlug);
    const existing = await prisma.externalHolding.findUnique({
      where: { id: holdingId },
    });
    if (!existing || existing.projectId !== project.id) {
      return { ok: false, error: "Tenencia no encontrada." };
    }
    await prisma.externalHolding.delete({ where: { id: holdingId } });
    revalidatePath(`/founder/${projectSlug}/equipo`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "removeExternalHoldingAction");
  }
}
