"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { getProjectAccess } from "@/lib/services/project-access";
import { recordAudit } from "@/lib/services/audit";

export type DocumentResult = { ok: true } | { ok: false; error: string };

/** Valida sesión + permiso de edición sobre el proyecto. */
async function ownerGuard(projectSlug: string) {
  const user = await requireSession();
  const dict = await getDict();
  const e = dict.documentsPanel.errors;
  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, ownerId: true, status: true },
  });
  if (!project) {
    return { ok: false as const, error: e.projectNotFound };
  }
  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canEdit) {
    return { ok: false as const, error: e.noPermission };
  }
  return { ok: true as const, user, project, errors: e };
}

/**
 * El founder comparte un documento con los miembros del proyecto. El
 * documento es el archivo en sí — el título es el nombre del archivo.
 */
export async function uploadDocumentAction(
  projectSlug: string,
  title: string,
  storageKey: string
): Promise<DocumentResult> {
  const guard = await ownerGuard(projectSlug);
  if (!guard.ok) return { ok: false, error: guard.error };
  const e = guard.errors;

  const cleanTitle = title.trim();
  if (!cleanTitle) return { ok: false, error: e.nameRequired };
  if (!storageKey.trim()) return { ok: false, error: e.fileRequired };

  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          projectId: guard.project.id,
          title: cleanTitle.slice(0, 200),
          storageKey: storageKey.trim(),
          uploadedById: guard.user.id,
        },
      });
      await recordAudit(tx, {
        actorId: guard.user.id,
        projectId: guard.project.id,
        action: "DOCUMENT.UPLOADED",
        entityType: "Document",
        entityId: doc.id,
        payload: { title: cleanTitle },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : e.uploadError;
    return { ok: false, error: msg };
  }

  revalidatePath(`/founder/${projectSlug}`);
  revalidatePath("/documentos");
  return { ok: true };
}

/** El founder elimina un documento del proyecto. */
export async function deleteDocumentAction(
  projectSlug: string,
  documentId: string
): Promise<DocumentResult> {
  const guard = await ownerGuard(projectSlug);
  if (!guard.ok) return { ok: false, error: guard.error };
  const e = guard.errors;

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true, projectId: true },
  });
  if (!doc || doc.projectId !== guard.project.id) {
    return { ok: false, error: e.notFound };
  }

  try {
    await prisma.document.delete({ where: { id: documentId } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : e.deleteError;
    return { ok: false, error: msg };
  }

  revalidatePath(`/founder/${projectSlug}`);
  revalidatePath("/documentos");
  return { ok: true };
}
