"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { DomainError } from "@/lib/services/errors";
import {
  upsertMilestone,
  removeMilestone,
} from "@/lib/services/project-content";

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
  console.error(`[hitos:${tag}]`, e);
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

export async function upsertMilestoneAction(
  projectSlug: string,
  formData: FormData
): Promise<Result> {
  const user = await requireRole(["PROJECT_OWNER", "ADMIN"]);
  const projectId = await resolveProjectId(projectSlug, user.id);
  if (!projectId) return { ok: false, error: "Proyecto no encontrado." };

  const milestoneId = String(formData.get("milestoneId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "PLANNED").trim() as
    | "PLANNED"
    | "IN_PROGRESS"
    | "ACHIEVED"
    | "DELAYED"
    | "CANCELLED";
  const targetDateStr = String(formData.get("targetDate") ?? "").trim();
  const achievedAtStr = String(formData.get("achievedAt") ?? "").trim();

  try {
    await upsertMilestone({
      actorId: user.id,
      projectId,
      milestoneId: milestoneId || undefined,
      title,
      description,
      status,
      targetDate: targetDateStr ? new Date(targetDateStr) : null,
      achievedAt: achievedAtStr ? new Date(achievedAtStr) : null,
    });
    revalidatePath(`/founder/${projectSlug}/hitos`);
    revalidatePath(`/founder/${projectSlug}`);
    revalidatePath(`/proyectos/${projectSlug}`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "upsertMilestoneAction");
  }
}

export async function removeMilestoneAction(
  projectSlug: string,
  milestoneId: string
): Promise<Result> {
  const user = await requireRole(["PROJECT_OWNER", "ADMIN"]);
  const projectId = await resolveProjectId(projectSlug, user.id);
  if (!projectId) return { ok: false, error: "Proyecto no encontrado." };

  try {
    await removeMilestone({ actorId: user.id, projectId, milestoneId });
    revalidatePath(`/founder/${projectSlug}/hitos`);
    revalidatePath(`/founder/${projectSlug}`);
    revalidatePath(`/proyectos/${projectSlug}`);
    return { ok: true };
  } catch (e) {
    return toFailure(e, "removeMilestoneAction");
  }
}
