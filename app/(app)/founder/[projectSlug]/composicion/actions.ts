"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { DomainError, ValidationError } from "@/lib/services/errors";
import { buildCapTableInput, CAP_TABLE_INCLUDE } from "@/lib/services/project";
import { computeCapTable } from "@/lib/services/cap-table";

type ExternalDTO = {
  id: string;
  label: string;
  classId: string;
  peopleCount: number;
  shareCount: number;
};

export type CompositionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string; field?: string };
export type UpsertExternalResult =
  | { ok: true; holding: ExternalDTO }
  | { ok: false; error: string; code?: string; field?: string };

/**
 * Wrap consistente para los catch de este módulo:
 *   - DomainError → exponemos message + code + field (si vino en details).
 *   - cualquier otro Error → log servidor + mensaje genérico al cliente,
 *     para no filtrar códigos Prisma (P2002, etc.) ni nombres de tabla.
 */
function toFailure(e: unknown, tag: string): {
  ok: false;
  error: string;
  code?: string;
  field?: string;
} {
  if (e instanceof DomainError) {
    const field = (e.details as { field?: string } | undefined)?.field;
    return { ok: false, error: e.message, code: e.code, field };
  }
  console.error(`[composicion:${tag}]`, e);
  return { ok: false, error: "Error inesperado." };
}

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
): Promise<CompositionResult> {
  try {
    const project = await ownedProject(projectSlug);
    const resolved = await resolveCanonicalClass(project.id, classId);
    await prisma.participation.updateMany({
      where: { projectId: project.id, currentOwnerId: holderUserId },
      data: { shareholderClassId: resolved },
    });
    revalidatePath(`/founder/${projectSlug}/composicion`);
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
      return { ok: false, error: "La cantidad de acciones debe ser al menos 1." };
    }
    // Cap defensivo: 1e9 personas/acciones es claramente input erróneo y
    // protege contra inputs absurdos que pueden romper queries downstream.
    if (peopleCount > 1e9) {
      return { ok: false, error: "La cantidad de personas excede el límite permitido." };
    }
    if (shareCount > 1e9) {
      return { ok: false, error: "La cantidad de acciones excede el límite permitido." };
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
    revalidatePath(`/founder/${projectSlug}/composicion`);
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
): Promise<CompositionResult> {
  try {
    const project = await ownedProject(projectSlug);
    const existing = await prisma.externalHolding.findUnique({
      where: { id: holdingId },
    });
    if (!existing || existing.projectId !== project.id) {
      return { ok: false, error: "Tenencia no encontrada." };
    }
    await prisma.externalHolding.delete({ where: { id: holdingId } });
    revalidatePath(`/founder/${projectSlug}/composicion`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "removeExternalHoldingAction");
  }
}
