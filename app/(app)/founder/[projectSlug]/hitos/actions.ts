"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  upsertMilestone,
  removeMilestone,
} from "@/lib/services/project-content";

type Result = { ok: true } | { ok: false; error: string; field?: string };

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
  const user = await requireRole(["PROJECT_OWNER"]);
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
    const err = e as { message?: string; field?: string };
    return { ok: false, error: err.message ?? "Error inesperado.", field: err.field };
  }
}

export async function removeMilestoneAction(
  projectSlug: string,
  milestoneId: string
): Promise<Result> {
  const user = await requireRole(["PROJECT_OWNER"]);
  const projectId = await resolveProjectId(projectSlug, user.id);
  if (!projectId) return { ok: false, error: "Proyecto no encontrado." };

  try {
    await removeMilestone({ actorId: user.id, projectId, milestoneId });
    revalidatePath(`/founder/${projectSlug}/hitos`);
    revalidatePath(`/founder/${projectSlug}`);
    revalidatePath(`/proyectos/${projectSlug}`);
    return { ok: true };
  } catch (e) {
    const err = e as { message?: string };
    return { ok: false, error: err.message ?? "Error inesperado." };
  }
}
