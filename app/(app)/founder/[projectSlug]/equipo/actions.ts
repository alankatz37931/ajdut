"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/services/errors";
import {
  upsertFounder,
  removeFounder,
} from "@/lib/services/project-content";
import { normalizeOptionalUrl } from "@/lib/utils/url";

type Result =
  | { ok: true }
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
