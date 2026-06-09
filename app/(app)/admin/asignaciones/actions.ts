"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  approvePendingAssignment,
  rejectPendingAssignment,
  regenerateTargetConfirmationToken,
} from "@/lib/services/pending-assignment";
import { DomainError } from "@/lib/services/errors";
import {
  notifyFounderPendingAssignmentApproved,
  notifyFounderPendingAssignmentRejected,
  notifyInvestorSharesAssigned,
  notifyFounderInvite,
  notifyTargetPendingAssignmentConfirm,
} from "@/lib/email/notifications";

export type AdminActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

function firstName(full: string): string {
  const t = full.trim();
  if (!t) return "Hola";
  return t.split(/\s+/)[0] ?? t;
}

export async function approvePendingAssignmentAction(
  pendingId: string,
  options?: { override?: boolean; overrideNote?: string }
): Promise<AdminActionResult> {
  const admin = await requireRole(["ADMIN"]);

  let result: Awaited<ReturnType<typeof approvePendingAssignment>>;
  try {
    result = await approvePendingAssignment({
      pendingId,
      adminId: admin.id,
      override: options?.override,
      overrideNote: options?.overrideNote,
    });
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error("approvePendingAssignmentAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }

  revalidatePath("/admin/asignaciones");
  revalidatePath(`/founder/${result.projectSlug}`);
  revalidatePath(`/founder/${result.projectSlug}/leads`);
  revalidatePath(`/proyectos/${result.projectSlug}`);
  revalidatePath("/partner");

  // Emails: socio + founder. fire-and-forget.
  after(async () => {
    // 1. Email al socio (igual que el flujo previo de assign)
    const project = await prisma.project.findUnique({
      where: { id: result.projectId },
      select: {
        name: true,
        slug: true,
        totalShares: true,
        startupProfile: {
          select: { preMoneyValuation: true, valuationCurrency: true },
        },
      },
    });
    const certificate = await prisma.certificate.findUnique({
      where: { id: result.certificateId },
      select: { serialCode: true },
    });

    if (!project || !certificate) return;

    const valuation = project.startupProfile?.preMoneyValuation
      ? Number(project.startupProfile.preMoneyValuation)
      : null;
    const currency = project.startupProfile?.valuationCurrency ?? "USD";
    const pricePerShare =
      valuation && project.totalShares > 0
        ? valuation / project.totalShares
        : null;
    const amount = pricePerShare ? pricePerShare * result.shareCount : null;
    const fmtMoney = (n: number) =>
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n);

    // Email al socio que recibió las acciones
    if (result.source === "LEAD") {
      // Para LEAD ya hay user existente activo
      await notifyInvestorSharesAssigned({
        to: result.toEmail,
        investorFirstName: firstName(result.toFullName),
        projectName: project.name,
        shareCount: result.shareCount,
        amountFormatted: amount !== null ? fmtMoney(amount) : null,
        pricePerShareFormatted:
          pricePerShare !== null ? fmtMoney(pricePerShare) : null,
        serial: result.newSerial,
        certificateSerial: certificate.serialCode,
      });
    } else {
      // INVITE: reusar el email de invitación del founder (lleva link de
      // setup si es usuario nuevo, o link de login si ya existía)
      await notifyFounderInvite({
        to: result.toEmail,
        inviteeFirstName: firstName(result.toFullName),
        founderName: result.proposerFullName,
        projectName: project.name,
        shareCount: result.shareCount,
        message: null,
        setupUrl:
          result.wasNewUser && result.setupToken
            ? `${appUrl()}/establecer-contrasena/${result.setupToken}`
            : null,
        expiresAt: result.setupExpiresAt ?? null,
        isNew: result.wasNewUser,
      });
    }

    // 2. Email al founder confirmando que la asignación quedó firme
    await notifyFounderPendingAssignmentApproved({
      to: result.proposerEmail,
      founderFirstName: firstName(result.proposerFullName),
      projectName: project.name,
      projectSlug: project.slug,
      recipientLabel: `${result.toFullName} · ${result.toEmail}`,
      shareCount: result.shareCount,
    });
  });

  return { ok: true };
}

export async function rejectPendingAssignmentAction(
  pendingId: string,
  note: string
): Promise<AdminActionResult> {
  const admin = await requireRole(["ADMIN"]);

  let result: Awaited<ReturnType<typeof rejectPendingAssignment>>;
  try {
    result = await rejectPendingAssignment({
      pendingId,
      adminId: admin.id,
      note,
    });
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error("rejectPendingAssignmentAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }

  revalidatePath("/admin/asignaciones");
  revalidatePath(`/founder/${result.projectSlug}`);
  revalidatePath(`/founder/${result.projectSlug}/leads`);

  after(async () => {
    await notifyFounderPendingAssignmentRejected({
      to: result.proposerEmail,
      founderFirstName: firstName(result.proposerFullName),
      projectName: result.projectName,
      projectSlug: result.projectSlug,
      recipientLabel: result.recipientLabel,
      shareCount: result.shareCount,
      note: result.note,
    });
  });

  return { ok: true };
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3001"
  );
}

/**
 * Admin reenvía el mail de confirmación al receptor (validación bilateral).
 * Re-genera el token (single-use, el viejo queda invalidado) y manda el mail.
 * Permite avanzar cuando el target perdió el email original o el link venció.
 */
export async function resendTargetConfirmationAction(
  pendingId: string
): Promise<AdminActionResult> {
  const admin = await requireRole(["ADMIN"]);

  let result: Awaited<ReturnType<typeof regenerateTargetConfirmationToken>>;
  try {
    result = await regenerateTargetConfirmationToken({
      pendingId,
      adminId: admin.id,
    });
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error("resendTargetConfirmationAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }

  revalidatePath("/admin/asignaciones");

  after(async () => {
    if (!result.targetEmail) return;
    const targetFirstName =
      result.targetFullName.split(/\s+/)[0] ?? result.targetFullName;
    await notifyTargetPendingAssignmentConfirm({
      to: result.targetEmail,
      targetFirstName,
      proposerName: result.proposerFullName,
      projectName: result.projectName,
      shareCount: result.shareCount,
      message: null,
      confirmToken: result.targetConfirmationToken,
      expiresAt: result.targetConfirmationExpiresAt,
    });
  });

  return { ok: true };
}
