"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import {
  createPendingFromInvite,
  getAvailableSharesForProposal,
} from "@/lib/services/pending-assignment";
import { DomainError } from "@/lib/services/errors";
import {
  notifyAdminsPendingAssignment,
  notifyTargetPendingAssignmentConfirm,
} from "@/lib/email/notifications";

export type InviteResult =
  | {
      ok: true;
      data: {
        pending: true;
        shareCount: number;
        email: string;
        fullName: string;
      };
    }
  | { ok: false; error: string; code?: string };

export async function inviteMemberAction(
  projectSlug: string,
  formData: FormData
): Promise<InviteResult> {
  const actor = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, name: true, slug: true, ownerId: true, status: true },
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
    return { ok: false, error: "No tenés permiso para invitar miembros a este proyecto." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const sharesRaw = String(formData.get("shareCount") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const shareCount = Number.parseInt(sharesRaw, 10);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "El email no es válido." };
  }
  if (fullName.length < 2) {
    return { ok: false, error: "Falta el nombre completo del invitado." };
  }
  if (!Number.isFinite(shareCount) || shareCount < 1) {
    return { ok: false, error: "La cantidad de acciones debe ser un entero mayor o igual a 1." };
  }
  if (message.length > 1000) {
    return { ok: false, error: "El mensaje no puede superar los 1000 caracteres." };
  }

  // Pre-check: ¿hay suficientes acciones disponibles (incluyendo pending)?
  const available = await getAvailableSharesForProposal(project.id);
  if (shareCount > available) {
    return {
      ok: false,
      error: `Solo hay ${available} acciones disponibles (incluyendo propuestas pendientes).`,
    };
  }

  let pendingId: string;
  let targetConfirmationToken: string;
  let targetConfirmationExpiresAt: Date;
  try {
    const result = await createPendingFromInvite({
      projectId: project.id,
      projectSlug: project.slug,
      proposedById: actor.id,
      inviteEmail: email,
      inviteFullName: fullName,
      inviteMessage: message || undefined,
      shareCount,
      reason: `Invitación directa del founder — ${shareCount} acciones${message ? " (con mensaje)" : ""}.`,
    });
    pendingId = result.pendingId;
    targetConfirmationToken = result.targetConfirmationToken;
    targetConfirmationExpiresAt = result.targetConfirmationExpiresAt;
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error("inviteMemberAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }

  after(async () => {
    const founder = await prisma.user.findUnique({
      where: { id: actor.id },
      select: { email: true, fullName: true, alias: true },
    });
    if (!founder) return;

    const proposerName = founder.alias ?? founder.fullName;
    const targetFirstName = fullName.split(/\s+/)[0] ?? fullName;

    await Promise.all([
      notifyAdminsPendingAssignment({
        pendingId,
        projectName: project.name,
        proposedByName: proposerName,
        proposedByEmail: founder.email,
        source: "INVITE",
        recipientLabel: `${fullName} · ${email}`,
        shareCount,
        message: message.length > 0 ? message : null,
      }),
      // Validación bilateral: el target recibe link de confirmación.
      notifyTargetPendingAssignmentConfirm({
        to: email,
        targetFirstName,
        proposerName,
        projectName: project.name,
        shareCount,
        message: message.length > 0 ? message : null,
        confirmToken: targetConfirmationToken,
        expiresAt: targetConfirmationExpiresAt,
      }),
    ]);
  });

  revalidatePath(`/founder/${project.slug}`);
  revalidatePath(`/admin/asignaciones`);

  return {
    ok: true,
    data: { pending: true, shareCount, email, fullName },
  };
}
