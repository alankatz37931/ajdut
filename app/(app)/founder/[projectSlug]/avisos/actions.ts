"use server";

import { after } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { notifyProjectMembersBroadcast } from "@/lib/email/notifications";

export type BroadcastResult =
  | { ok: true }
  | { ok: false; error: string };

// Estados de participación que representan a un socio "asignado" (no el pool disponible).
const ASSIGNED_STATUSES = [
  "ASSIGNED",
  "IN_RESALE",
  "TRANSFER_PENDING",
  "IN_NEGOTIATION",
] as const;

/**
 * Junta los emails únicos de los socios de un proyecto: usuarios con al menos
 * una Participation asignada, no platform stake, en este proyecto.
 */
async function loadMemberEmails(projectId: string): Promise<string[]> {
  const parts = await prisma.participation.findMany({
    where: {
      projectId,
      isPlatformStake: false,
      currentOwnerId: { not: null },
      status: { in: [...ASSIGNED_STATUSES] },
    },
    select: { currentOwner: { select: { email: true } } },
  });
  const emails = new Set<string>();
  for (const p of parts) {
    const email = p.currentOwner?.email;
    if (email) emails.add(email);
  }
  return [...emails];
}

/**
 * Resuelve el email de un único miembro, validando que sea efectivamente
 * miembro del proyecto. Devuelve null si no califica — el caller lo trata
 * como input inválido.
 */
async function loadOneMemberEmail(
  projectId: string,
  userId: string
): Promise<string | null> {
  const member = await prisma.participation.findFirst({
    where: {
      projectId,
      isPlatformStake: false,
      currentOwnerId: userId,
      status: { in: [...ASSIGNED_STATUSES] },
    },
    select: { currentOwner: { select: { email: true } } },
  });
  return member?.currentOwner?.email ?? null;
}

export async function sendBroadcastAction(
  projectSlug: string,
  formData: FormData
): Promise<BroadcastResult> {
  const user = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, name: true, ownerId: true, status: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado." };

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  // Pueden enviar: owner del proyecto, co-admin vinculado, o admin.
  if (!access.canEdit && access.role !== "CO_ADMIN" && access.role !== "ADMIN") {
    return { ok: false, error: "No tenés permiso para enviar avisos en este proyecto." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const recipientUserIdRaw = String(formData.get("recipientUserId") ?? "").trim();
  const recipientUserId = recipientUserIdRaw.length > 0 ? recipientUserIdRaw : null;

  if (subject.length === 0) return { ok: false, error: "El asunto no puede estar vacío." };
  if (subject.length > 160) return { ok: false, error: "El asunto no puede superar los 160 caracteres." };
  if (body.length === 0) return { ok: false, error: "El mensaje no puede estar vacío." };
  if (body.length > 5000) return { ok: false, error: "El mensaje no puede superar los 5000 caracteres." };

  let emails: string[];
  if (recipientUserId) {
    const oneEmail = await loadOneMemberEmail(project.id, recipientUserId);
    if (!oneEmail) {
      return {
        ok: false,
        error: "El destinatario seleccionado no es miembro de este proyecto.",
      };
    }
    emails = [oneEmail];
  } else {
    emails = await loadMemberEmails(project.id);
    if (emails.length === 0) {
      return { ok: false, error: "Este proyecto todavía no tiene miembros a quienes avisar." };
    }
  }

  const founderName = user.name ?? project.name;

  // fire-and-forget: el envío no debe bloquear la respuesta al founder.
  after(async () => {
    await notifyProjectMembersBroadcast({
      to: emails,
      projectName: project.name,
      founderName,
      subject,
      body,
    });
  });

  return { ok: true };
}
