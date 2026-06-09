"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { createPendingFromLead } from "@/lib/services/pending-assignment";
import {
  approveInfoRequest,
  rejectInfoRequest,
} from "@/lib/services/info-request";
import { DomainError } from "@/lib/services/errors";
import {
  notifyAdminsPendingAssignment,
  notifyRequesterInfoRequestResolved,
  notifyLeadMoreInfoRequest,
  notifyTargetPendingAssignmentConfirm,
} from "@/lib/email/notifications";

export type LeadActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function loadLeadForOwner(leadId: string, actorId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { project: { select: { ownerId: true, slug: true } } },
  });
  if (!lead) return null;
  if (lead.project.ownerId !== actorId) return null;
  return lead;
}

export async function markLeadContactedAction(leadId: string): Promise<LeadActionResult> {
  const user = await requireSession();
  const lead = await loadLeadForOwner(leadId, user.id);
  if (!lead) return { ok: false, error: "Lead no encontrado." };
  if (lead.status !== "OPEN") {
    return { ok: false, error: "Este lead ya está cerrado o resuelto." };
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "CONTACTED" },
  });
  revalidatePath(`/founder/${lead.project.slug}/leads`);
  return { ok: true };
}

/**
 * Marca el lead como "En entrevista" — etapa intermedia entre haberlo
 * contactado y haber decidido aceptar/descartar. Acepta transición desde
 * OPEN o CONTACTED.
 */
export async function markLeadInterviewingAction(
  leadId: string
): Promise<LeadActionResult> {
  const user = await requireSession();
  const lead = await loadLeadForOwner(leadId, user.id);
  if (!lead) return { ok: false, error: "Lead no encontrado." };
  if (lead.status !== "OPEN" && lead.status !== "CONTACTED") {
    return { ok: false, error: "Este lead ya está resuelto." };
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "INTERVIEWING" },
  });
  revalidatePath(`/founder/${lead.project.slug}/leads`);
  return { ok: true };
}

/**
 * El founder pide más información al lead antes de decidir aceptar/descartar.
 * Envía un email al lead con la pregunta del founder y mueve el lead a
 * INTERVIEWING para que quede registrado el estado "en conversación".
 */
export async function requestMoreInfoAction(
  leadId: string,
  question: string
): Promise<LeadActionResult> {
  const user = await requireSession();
  const lead = await loadLeadForOwner(leadId, user.id);
  if (!lead) return { ok: false, error: "Lead no encontrado." };
  if (
    lead.status !== "OPEN" &&
    lead.status !== "CONTACTED" &&
    lead.status !== "INTERVIEWING"
  ) {
    return { ok: false, error: "Este lead ya está resuelto." };
  }
  const trimmed = question.trim();
  if (trimmed.length < 5) {
    return { ok: false, error: "Escribí al menos 5 caracteres de pregunta." };
  }

  // Cargar datos necesarios para el email antes de la transacción.
  const [project, target, founder] = await Promise.all([
    prisma.project.findUnique({
      where: { id: lead.projectId },
      select: { name: true, slug: true },
    }),
    prisma.user.findUnique({
      where: { id: lead.userId },
      select: { email: true, fullName: true },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true, alias: true },
    }),
  ]);
  if (!project || !target) {
    return { ok: false, error: "Datos del lead incompletos." };
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "INTERVIEWING" },
  });
  revalidatePath(`/founder/${lead.project.slug}/leads`);

  after(async () => {
    if (!founder) return;
    await notifyLeadMoreInfoRequest({
      to: target.email,
      requesterFirstName: target.fullName.split(" ")[0] ?? target.fullName,
      projectName: project.name,
      projectSlug: project.slug,
      founderName: founder.alias ?? founder.fullName,
      question: trimmed,
    });
  });

  return { ok: true };
}

export async function dismissLeadAction(leadId: string): Promise<LeadActionResult> {
  const user = await requireSession();
  const lead = await loadLeadForOwner(leadId, user.id);
  if (!lead) return { ok: false, error: "Lead no encontrado." };
  if (
    lead.status !== "OPEN" &&
    lead.status !== "CONTACTED" &&
    lead.status !== "INTERVIEWING"
  ) {
    return { ok: false, error: "Este lead ya está resuelto." };
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "DISMISSED", resolvedAt: new Date() },
  });
  revalidatePath(`/founder/${lead.project.slug}/leads`);
  return { ok: true };
}

/**
 * Ola 5: el founder ya no ejecuta la asignación directamente. Propone una
 * PendingAssignment que el admin valida desde /admin/asignaciones. Recién
 * cuando el admin aprueba se decrementa el pool, se crea la Participation y
 * se emite el Certificate.
 */
export async function acceptLeadAndAssignAction(leadId: string): Promise<LeadActionResult> {
  const user = await requireSession();
  const lead = await loadLeadForOwner(leadId, user.id);
  if (!lead) return { ok: false, error: "Lead no encontrado." };

  // Cargar info del proyecto + founder para el email a admins
  const project = await prisma.project.findUnique({
    where: { id: lead.projectId },
    select: { id: true, name: true, slug: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado." };

  const target = await prisma.user.findUnique({
    where: { id: lead.userId },
    select: { fullName: true, email: true },
  });

  let pendingId: string;
  let targetConfirmationToken: string;
  let targetConfirmationExpiresAt: Date;
  try {
    const result = await createPendingFromLead({
      projectId: lead.projectId,
      projectSlug: project.slug,
      proposedById: user.id,
      leadId: lead.id,
      shareCount: lead.shareCountRequested,
    });
    pendingId = result.pendingId;
    targetConfirmationToken = result.targetConfirmationToken;
    targetConfirmationExpiresAt = result.targetConfirmationExpiresAt;
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno al proponer la asignación." };
  }

  revalidatePath(`/founder/${project.slug}/leads`);
  revalidatePath(`/founder/${project.slug}`);
  revalidatePath(`/admin/asignaciones`);

  after(async () => {
    const founder = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, fullName: true, alias: true },
    });
    if (!founder || !target) return;

    const proposerName = founder.alias ?? founder.fullName;
    const targetFirstName = target.fullName.split(/\s+/)[0] ?? target.fullName;

    await Promise.all([
      notifyAdminsPendingAssignment({
        pendingId,
        projectName: project.name,
        proposedByName: proposerName,
        proposedByEmail: founder.email,
        source: "LEAD",
        recipientLabel: `${target.fullName} · ${target.email}`,
        shareCount: lead.shareCountRequested,
        message: lead.message?.trim().length ? lead.message : null,
      }),
      // Validación bilateral: el target (que ya es usuario AJDUT) recibe link
      // de confirmación. También lo verá in-app via banner de notificación.
      notifyTargetPendingAssignmentConfirm({
        to: target.email,
        targetFirstName,
        proposerName,
        projectName: project.name,
        shareCount: lead.shareCountRequested,
        message: lead.message?.trim().length ? lead.message : null,
        confirmToken: targetConfirmationToken,
        expiresAt: targetConfirmationExpiresAt,
      }),
    ]);
  });

  return { ok: true };
}

// ─── InfoRequest (etapa 1) ──────────────────────────────────────────

async function loadInfoRequestForOwner(infoRequestId: string, actorId: string) {
  const req = await prisma.infoRequest.findUnique({
    where: { id: infoRequestId },
    include: {
      project: { select: { ownerId: true, slug: true, name: true } },
      requester: { select: { email: true, fullName: true } },
    },
  });
  if (!req) return null;
  if (req.project.ownerId !== actorId) return null;
  return req;
}

export async function approveInfoRequestAction(
  infoRequestId: string,
  note: string
): Promise<LeadActionResult> {
  const user = await requireSession();
  const req = await loadInfoRequestForOwner(infoRequestId, user.id);
  if (!req) return { ok: false, error: "Solicitud no encontrada." };

  try {
    await approveInfoRequest(req.id, user.id, note);
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno." };
  }

  revalidatePath(`/founder/${req.project.slug}/leads`);
  revalidatePath(`/proyectos/${req.project.slug}`);

  after(async () => {
    const owner = await prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true },
    });
    const requesterFirst =
      req.requester.fullName.split(" ")[0] ?? req.requester.fullName;
    await notifyRequesterInfoRequestResolved({
      to: req.requester.email,
      projectSlug: req.project.slug,
      requesterFirstName: requesterFirst,
      projectName: req.project.name,
      founderName: owner?.fullName ?? "el founder",
      decision: "APPROVED",
      note,
    });
  });

  return { ok: true };
}

export async function rejectInfoRequestAction(
  infoRequestId: string,
  note: string
): Promise<LeadActionResult> {
  const user = await requireSession();
  const req = await loadInfoRequestForOwner(infoRequestId, user.id);
  if (!req) return { ok: false, error: "Solicitud no encontrada." };

  try {
    await rejectInfoRequest(req.id, user.id, note);
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno." };
  }

  revalidatePath(`/founder/${req.project.slug}/leads`);
  revalidatePath(`/proyectos/${req.project.slug}`);

  after(async () => {
    const owner = await prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true },
    });
    const requesterFirst =
      req.requester.fullName.split(" ")[0] ?? req.requester.fullName;
    await notifyRequesterInfoRequestResolved({
      to: req.requester.email,
      projectSlug: req.project.slug,
      requesterFirstName: requesterFirst,
      projectName: req.project.name,
      founderName: owner?.fullName ?? "el founder",
      decision: "REJECTED",
      note,
    });
  });

  return { ok: true };
}
