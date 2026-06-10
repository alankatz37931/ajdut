"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { DomainError, ValidationError } from "@/lib/services/errors";
import { buildCapTableInput, CAP_TABLE_INCLUDE } from "@/lib/services/project";
import { computeCapTable } from "@/lib/services/cap-table";

type ClassDTO = { id: string; name: string };
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
export type CreateClassResult =
  | { ok: true; class: ClassDTO }
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

export async function createClassAction(
  projectSlug: string,
  name: string
): Promise<CreateClassResult> {
  try {
    const project = await ownedProject(projectSlug);
    const clean = name.trim();
    if (clean.length < 2) return { ok: false, error: "El nombre de la clase es muy corto." };
    if (clean.length > 60) return { ok: false, error: "Máximo 60 caracteres." };
    const count = await prisma.shareholderClass.count({
      where: { projectId: project.id },
    });
    const created = await prisma.shareholderClass.create({
      data: { projectId: project.id, name: clean, order: count },
    });
    revalidatePath(`/founder/${projectSlug}/composicion`);
    return { ok: true, class: { id: created.id, name: created.name } };
  } catch (e) {
    return toFailure(e, "createClassAction");
  }
}

export async function renameClassAction(
  projectSlug: string,
  classId: string,
  name: string
): Promise<CompositionResult> {
  try {
    const project = await ownedProject(projectSlug);
    const clean = name.trim();
    if (clean.length < 2) return { ok: false, error: "Nombre muy corto." };
    if (clean.length > 60) return { ok: false, error: "Máximo 60 caracteres." };
    const cls = await prisma.shareholderClass.findUnique({ where: { id: classId } });
    if (!cls || cls.projectId !== project.id) {
      return { ok: false, error: "Clase no encontrada." };
    }
    await prisma.shareholderClass.update({
      where: { id: classId },
      data: { name: clean },
    });
    revalidatePath(`/founder/${projectSlug}/composicion`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "renameClassAction");
  }
}

export async function deleteClassAction(
  projectSlug: string,
  classId: string
): Promise<CompositionResult> {
  try {
    const project = await ownedProject(projectSlug);
    const cls = await prisma.shareholderClass.findUnique({ where: { id: classId } });
    if (!cls || cls.projectId !== project.id) {
      return { ok: false, error: "Clase no encontrada." };
    }
    // Desvincular participaciones y tenencias externas, después borrar la clase.
    await prisma.$transaction([
      prisma.participation.updateMany({
        where: { shareholderClassId: classId },
        data: { shareholderClassId: null },
      }),
      prisma.externalHolding.updateMany({
        where: { shareholderClassId: classId },
        data: { shareholderClassId: null },
      }),
      prisma.shareholderClass.delete({ where: { id: classId } }),
    ]);
    revalidatePath(`/founder/${projectSlug}/composicion`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "deleteClassAction");
  }
}

export async function assignHolderClassAction(
  projectSlug: string,
  holderUserId: string,
  classId: string
): Promise<CompositionResult> {
  try {
    const project = await ownedProject(projectSlug);
    let resolved: string | null = null;
    if (classId) {
      const cls = await prisma.shareholderClass.findUnique({ where: { id: classId } });
      if (!cls || cls.projectId !== project.id) {
        return { ok: false, error: "Clase no encontrada." };
      }
      resolved = classId;
    }
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
    let resolved: string | null = null;
    if (input.classId) {
      const cls = await prisma.shareholderClass.findUnique({ where: { id: input.classId } });
      if (!cls || cls.projectId !== project.id) {
        return { ok: false, error: "Clase no encontrada." };
      }
      resolved = input.classId;
    }

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
        "El cap table superaría el 100%. El equipo + tenencias + asignados no pueden exceder el total de participaciones emitidas. Ajustá los porcentajes o consultá con los propietarios para emitir más."
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
