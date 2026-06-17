"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { approveProject } from "@/lib/services/project-approval";
import {
  rejectProject,
  suspendProject,
  reactivateProject,
  softDeleteProject,
} from "@/lib/services/project";
import { DomainError } from "@/lib/services/errors";
import {
  notifyFounderProjectApproved,
  notifyFounderProjectRejected,
} from "@/lib/email/notifications";

export type ProjectModerationResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

export async function approveProjectAction(slug: string): Promise<ProjectModerationResult> {
  const admin = await requireRole(["ADMIN"]);
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, owner: { select: { email: true, fullName: true } } },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado.", code: "NOT_FOUND" };

  try {
    await approveProject({ projectId: project.id, adminId: admin.id });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    return { ok: false, error: "Error interno." };
  }

  revalidatePath(`/proyectos/${slug}`);
  revalidatePath(`/proyectos`);
  revalidatePath(`/founder/${slug}`);

  after(async () => {
    const first = project.owner.fullName.split(" ")[0] ?? project.owner.fullName;
    await notifyFounderProjectApproved({
      to: project.owner.email,
      founderFirstName: first,
      projectName: project.name,
      projectSlug: project.slug,
    });
  });

  return { ok: true };
}

export async function rejectProjectAction(
  slug: string,
  reason: string
): Promise<ProjectModerationResult> {
  const admin = await requireRole(["ADMIN"]);
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, owner: { select: { email: true, fullName: true } } },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado.", code: "NOT_FOUND" };

  try {
    await rejectProject({ projectId: project.id, adminId: admin.id, reason });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    return { ok: false, error: "Error interno." };
  }

  revalidatePath(`/proyectos/${slug}`);
  revalidatePath(`/proyectos`);

  after(async () => {
    const first = project.owner.fullName.split(" ")[0] ?? project.owner.fullName;
    await notifyFounderProjectRejected({
      to: project.owner.email,
      founderFirstName: first,
      projectName: project.name,
      reason,
    });
  });

  return { ok: true };
}

// Helper interno: corre una acción de moderación de proyecto por slug.
async function runProjectModeration(
  slug: string,
  fn: (args: { projectId: string; adminId: string }) => Promise<unknown>
): Promise<ProjectModerationResult> {
  const admin = await requireRole(["ADMIN"]);
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado.", code: "NOT_FOUND" };
  try {
    await fn({ projectId: project.id, adminId: admin.id });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    return { ok: false, error: "Error interno." };
  }
  revalidatePath(`/proyectos/${slug}`);
  revalidatePath(`/proyectos`);
  revalidatePath(`/founder/${slug}`);
  return { ok: true };
}

/** Admin inactiva un proyecto (ACTIVE → SUSPENDED): deja de verse para miembros. */
export async function suspendProjectAction(slug: string): Promise<ProjectModerationResult> {
  return runProjectModeration(slug, suspendProject);
}

/** Admin reactiva un proyecto (SUSPENDED → ACTIVE). */
export async function reactivateProjectAction(slug: string): Promise<ProjectModerationResult> {
  return runProjectModeration(slug, reactivateProject);
}

/** Admin elimina un proyecto (soft-delete): desaparece de la plataforma. */
export async function deleteProjectAction(slug: string): Promise<ProjectModerationResult> {
  return runProjectModeration(slug, softDeleteProject);
}
