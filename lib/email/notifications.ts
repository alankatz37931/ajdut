/**
 * Helpers de alto nivel para enviar las notificaciones del flujo de aplicaciones.
 * Cada función es fire-and-forget: si el envío falla, loggea pero no rompe el
 * flujo de negocio. La trazabilidad real vive en AuditLog.
 */
import { sendEmail } from "./send";
import { getAdminNotifyEmails } from "./client";
import {
  applicationReceivedEmail,
  type ApplicationReceivedInput,
} from "./templates/application-received";
import {
  newApplicationAdminEmail,
  type NewApplicationAdminInput,
} from "./templates/new-application-admin";
import {
  applicationApprovedEmail,
  type ApplicationApprovedInput,
} from "./templates/application-approved";
import {
  applicationRejectedEmail,
  type ApplicationRejectedInput,
} from "./templates/application-rejected";
import {
  newInterestToFounderEmail,
  type NewInterestToFounderInput,
} from "./templates/new-interest-to-founder";
import {
  interestReceivedConfirmationEmail,
  type InterestReceivedConfirmationInput,
} from "./templates/interest-received-confirmation";
import { passwordResetLinkEmail } from "./templates/password-reset-link";
import { verificationCodeEmail } from "./templates/verification-code";
import {
  newProjectPendingAdminEmail,
  type NewProjectPendingAdminInput,
} from "./templates/new-project-pending-admin";
import {
  projectApprovedFounderEmail,
} from "./templates/project-approved-founder";
import {
  projectRejectedFounderEmail,
} from "./templates/project-rejected-founder";
import {
  sharesAssignedInvestorEmail,
} from "./templates/shares-assigned-investor";
import {
  founderBroadcastEmail,
  type FounderBroadcastInput,
} from "./templates/founder-broadcast";
import {
  adminBroadcastEmail,
  type AdminBroadcastInput,
} from "./templates/admin-broadcast";
import {
  founderInviteEmail,
  type FounderInviteInput,
} from "./templates/founder-invite";
import {
  reportPublishedEmail,
  type ReportPublishedInput,
} from "./templates/report-published";
import {
  infoRequestToFounderEmail,
  type InfoRequestToFounderInput,
} from "./templates/info-request-to-founder";
import {
  infoRequestResolvedEmail,
  type InfoRequestResolvedInput,
} from "./templates/info-request-resolved";
import {
  pendingAssignmentToAdminEmail,
  type PendingAssignmentToAdminInput,
} from "./templates/pending-assignment-to-admin";
import {
  pendingAssignmentApprovedToFounderEmail,
} from "./templates/pending-assignment-approved-to-founder";
import {
  pendingAssignmentRejectedToFounderEmail,
} from "./templates/pending-assignment-rejected-to-founder";
import {
  chatNewMessageEmail,
  type ChatNewMessageInput,
} from "./templates/chat-new-message";
import {
  validationCheckEmail,
} from "./templates/validation-check";

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3001"
  );
}

export async function notifyApplicantReceived(input: { to: string } & ApplicationReceivedInput) {
  const { subject, html } = applicationReceivedEmail(input);
  return sendEmail({ to: input.to, subject, html, fireAndForget: true, kind: "application.received" });
}

export async function notifyAdminsNewApplication(
  input: Omit<NewApplicationAdminInput, "reviewUrl">
) {
  const admins = getAdminNotifyEmails();
  if (admins.length === 0) {
    console.warn(
      "ADMIN_NOTIFY_EMAILS no está configurado. Saltando notificación a admins.\n" +
        "Sugerencia: agrega ADMIN_NOTIFY_EMAILS=tu@email.com en .env"
    );
    return { ok: false as const, error: "no admin recipients", via: "console" as const };
  }
  const reviewUrl = `${appUrl()}/admin/applications/${input.applicationId}`;
  const { subject, html } = newApplicationAdminEmail({ ...input, reviewUrl });
  return sendEmail({ to: admins, subject, html, fireAndForget: true, kind: "application.admin-notice" });
}

export async function notifyApplicantApproved(input: {
  to: string;
  fullName: string;
  role: "PARTNER" | "PROJECT_OWNER" | "CO_ADMIN";
  setupToken: string;
  expiresAt: Date;
}) {
  const setupUrl = `${appUrl()}/establecer-contrasena/${input.setupToken}`;
  const { subject, html } = applicationApprovedEmail({
    fullName: input.fullName,
    role: input.role,
    setupUrl,
    expiresAt: input.expiresAt,
  });
  return sendEmail({ to: input.to, subject, html, fireAndForget: true, kind: "application.approved" });
}

export async function notifyApplicantRejected(
  input: { to: string } & ApplicationRejectedInput
) {
  const { subject, html } = applicationRejectedEmail(input);
  return sendEmail({ to: input.to, subject, html, fireAndForget: true, kind: "application.rejected" });
}

// ─── Lifecycle de proyectos ────────────────────────────────────────

export async function notifyAdminsNewProjectPending(input: {
  projectSlug: string;
  projectName: string;
  founderName: string;
  founderEmail: string;
  sector: string;
  stage: string;
  valuation: number;
  currency: "USD" | "MXN";
  pricePerShare: number;
  totalShares: number;
  oneLiner: string;
}) {
  const admins = getAdminNotifyEmails();
  if (admins.length === 0) {
    console.warn("ADMIN_NOTIFY_EMAILS no configurado. Saltando notificación de proyecto pendiente.");
    return { ok: false as const, error: "no admin recipients", via: "console" as const };
  }
  const reviewUrl = `${appUrl()}/proyectos/${input.projectSlug}`;
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: input.currency,
      maximumFractionDigits: 2,
    }).format(n);
  const fmtInt = (n: number) => n.toLocaleString("es-MX");

  const { subject, html } = newProjectPendingAdminEmail({
    projectName: input.projectName,
    founderName: input.founderName,
    founderEmail: input.founderEmail,
    sector: input.sector,
    stage: input.stage,
    valuationFormatted: fmtMoney(input.valuation),
    pricePerShareFormatted: fmtMoney(input.pricePerShare),
    totalSharesFormatted: fmtInt(input.totalShares),
    oneLiner: input.oneLiner,
    reviewUrl,
  });
  return sendEmail({ to: admins, subject, html, fireAndForget: true, kind: "project.pending" });
}

export async function notifyFounderProjectApproved(input: {
  to: string;
  founderFirstName: string;
  projectName: string;
  projectSlug: string;
}) {
  const projectUrl = `${appUrl()}/founder/${input.projectSlug}`;
  const { subject, html } = projectApprovedFounderEmail({
    founderFirstName: input.founderFirstName,
    projectName: input.projectName,
    projectUrl,
  });
  return sendEmail({ to: input.to, subject, html, fireAndForget: true, kind: "project.approved" });
}

export async function notifyFounderProjectRejected(input: {
  to: string;
  founderFirstName: string;
  projectName: string;
  reason: string;
}) {
  const { subject, html } = projectRejectedFounderEmail({
    founderFirstName: input.founderFirstName,
    projectName: input.projectName,
    reason: input.reason,
  });
  return sendEmail({ to: input.to, subject, html, fireAndForget: true, kind: "project.rejected" });
}

// ─── Asignación de acciones (cierre del loop de compra) ────────────

export async function notifyInvestorSharesAssigned(input: {
  to: string;
  investorFirstName: string;
  projectName: string;
  shareCount: number;
  amountFormatted: string | null;
  pricePerShareFormatted: string | null;
  serial: string;
  certificateSerial: string;
}) {
  const portfolioUrl = `${appUrl()}/partner`;
  const { subject, html } = sharesAssignedInvestorEmail({
    investorFirstName: input.investorFirstName,
    projectName: input.projectName,
    shareCount: input.shareCount,
    amountFormatted: input.amountFormatted,
    pricePerShareFormatted: input.pricePerShareFormatted,
    serial: input.serial,
    certificateSerial: input.certificateSerial,
    portfolioUrl,
  });
  return sendEmail({ to: input.to, subject, html, fireAndForget: true, kind: "shares.assigned" });
}

// ─── Aviso del founder a sus socios ────────────────────────────────

/**
 * Envía un aviso del founder a todos los socios de su proyecto.
 * fireAndForget: si Resend está caído no rompe el flujo; queda en AuditLog.
 */
export async function notifyProjectMembersBroadcast(
  input: { to: string[] } & FounderBroadcastInput
) {
  const { subject, html } = founderBroadcastEmail({
    projectName: input.projectName,
    founderName: input.founderName,
    subject: input.subject,
    body: input.body,
  });
  return sendEmail({
    to: input.to,
    subject,
    html,
    fireAndForget: true,
    kind: "founder.broadcast",
  });
}

// ─── Aviso del admin a usuarios filtrados ──────────────────────────

/**
 * Envía un aviso del equipo de AJDUT a un conjunto de usuarios filtrado
 * (por rol, actividad, o miembros de un proyecto). fireAndForget: si Resend
 * está caído no rompe la respuesta al admin; el AuditLog tiene la lista.
 */
export async function notifyAdminBroadcast(
  input: { to: string[] } & AdminBroadcastInput
) {
  const { subject, html } = adminBroadcastEmail({
    subject: input.subject,
    body: input.body,
  });
  return sendEmail({
    to: input.to,
    subject,
    html,
    fireAndForget: true,
    kind: "admin.broadcast",
  });
}

// ─── Invitación directa del founder a un nuevo miembro ─────────────

/**
 * Envía la invitación a un miembro recién agregado por el founder. Si el
 * usuario es nuevo (recién creado), `input.setupUrl` debe estar presente y
 * el email muestra el link de "establecer contraseña". Si ya existía,
 * `setupUrl` viene null y se muestra el link de login.
 */
export async function notifyFounderInvite(
  input: { to: string } & Omit<FounderInviteInput, "loginUrl"> & { loginUrl?: string }
) {
  const loginUrl = input.loginUrl ?? `${appUrl()}/acceder`;
  const { subject, html } = founderInviteEmail({
    inviteeFirstName: input.inviteeFirstName,
    founderName: input.founderName,
    projectName: input.projectName,
    shareCount: input.shareCount,
    message: input.message,
    setupUrl: input.setupUrl,
    expiresAt: input.expiresAt,
    loginUrl,
    isNew: input.isNew,
  });
  return sendEmail({
    to: input.to,
    subject,
    html,
    fireAndForget: true,
    kind: "founder.invite",
  });
}

// ─── Reportes trimestrales / anuales del founder ──────────────────

/**
 * Notifica a todos los socios del proyecto que se publicó un nuevo reporte.
 * fireAndForget: si Resend está caído no rompe el flujo; el AuditLog queda
 * con la acción REPORT.PUBLISHED como fuente de verdad.
 */
export async function notifyMembersReportPublished(
  input: { to: string[] } & ReportPublishedInput
) {
  const { subject, html } = reportPublishedEmail({
    projectName: input.projectName,
    reportTitle: input.reportTitle,
    period: input.period,
    kindLabel: input.kindLabel,
    summary: input.summary,
    url: input.url,
  });
  return sendEmail({
    to: input.to,
    subject,
    html,
    fireAndForget: true,
    kind: "report.published",
  });
}

// ─── Verificación de email (para aplicaciones) ────────────────────

export async function notifyVerificationCode(input: {
  to: string;
  fullName: string;
  code: string;
  expiresAt: Date;
}) {
  const { subject, html } = verificationCodeEmail({
    fullName: input.fullName,
    code: input.code,
    expiresAt: input.expiresAt,
  });
  // No fireAndForget: necesitamos saber si llegó al usuario antes de seguir.
  return sendEmail({ to: input.to, subject, html, kind: "verification.code" });
}

// ─── Password reset ────────────────────────────────────────────────

export async function notifyPasswordReset(input: {
  to: string;
  fullName: string;
  resetToken: string;
  expiresAt: Date;
}) {
  const resetUrl = `${appUrl()}/establecer-contrasena/${input.resetToken}`;
  const { subject, html } = passwordResetLinkEmail({
    fullName: input.fullName,
    resetUrl,
    expiresAt: input.expiresAt,
  });
  return sendEmail({ to: input.to, subject, html, fireAndForget: true, kind: "password.reset" });
}

// ─── Interés (compra de acciones) ──────────────────────────────────

export async function notifyFounderNewInterest(input: {
  to: string;
  projectSlug: string;
} & Omit<NewInterestToFounderInput, "leadsUrl">) {
  const leadsUrl = `${appUrl()}/founder/${input.projectSlug}/leads`;
  const { subject, html } = newInterestToFounderEmail({
    founderFirstName: input.founderFirstName,
    projectName: input.projectName,
    investorName: input.investorName,
    investorEmail: input.investorEmail,
    sharesRequested: input.sharesRequested,
    amountFormatted: input.amountFormatted,
    pricePerShareFormatted: input.pricePerShareFormatted,
    message: input.message,
    leadsUrl,
  });
  return sendEmail({ to: input.to, subject, html, fireAndForget: true, kind: "interest.founder" });
}

export async function notifyInvestorInterestReceived(input: {
  to: string;
  projectSlug: string;
} & Omit<InterestReceivedConfirmationInput, "projectUrl">) {
  const projectUrl = `${appUrl()}/proyectos/${input.projectSlug}`;
  const { subject, html } = interestReceivedConfirmationEmail({
    investorFirstName: input.investorFirstName,
    projectName: input.projectName,
    founderName: input.founderName,
    sharesRequested: input.sharesRequested,
    amountFormatted: input.amountFormatted,
    pricePerShareFormatted: input.pricePerShareFormatted,
    projectUrl,
  });
  return sendEmail({ to: input.to, subject, html, fireAndForget: true, kind: "interest.investor" });
}

/**
 * Notifica al equipo de admins de AJDUT cuando hay un nuevo interés de compra.
 * Reutiliza el template del founder con CTA al proyecto (admins no acceden
 * a la lista de leads del founder).
 */
export async function notifyAdminsNewInterest(input: {
  projectSlug: string;
  projectName: string;
  investorName: string;
  investorEmail: string;
  sharesRequested: number;
  amountFormatted: string | null;
  pricePerShareFormatted: string | null;
  message: string;
}) {
  const admins = getAdminNotifyEmails();
  if (admins.length === 0) {
    console.warn(
      "ADMIN_NOTIFY_EMAILS no configurado. Saltando notificación de interés a admins."
    );
    return { ok: false as const, error: "no admin recipients", via: "console" as const };
  }
  const projectUrl = `${appUrl()}/proyectos/${input.projectSlug}`;
  const { subject, html } = newInterestToFounderEmail({
    founderFirstName: "equipo",
    projectName: input.projectName,
    investorName: input.investorName,
    investorEmail: input.investorEmail,
    sharesRequested: input.sharesRequested,
    amountFormatted: input.amountFormatted,
    pricePerShareFormatted: input.pricePerShareFormatted,
    message: input.message,
    leadsUrl: projectUrl,
  });
  return sendEmail({
    to: admins,
    subject: `[AJDUT] ${subject}`,
    html,
    fireAndForget: true,
    kind: "interest.admin-notice",
  });
}

// ─── Solicitudes de información (etapa 1) ─────────────────────────

export async function notifyFounderInfoRequest(input: {
  to: string;
  projectSlug: string;
} & Omit<InfoRequestToFounderInput, "reviewUrl">) {
  const reviewUrl = `${appUrl()}/founder/${input.projectSlug}/leads`;
  const { subject, html } = infoRequestToFounderEmail({
    founderFirstName: input.founderFirstName,
    projectName: input.projectName,
    requesterName: input.requesterName,
    requesterEmail: input.requesterEmail,
    message: input.message,
    reviewUrl,
  });
  return sendEmail({
    to: input.to,
    subject,
    html,
    fireAndForget: true,
    kind: "info-request.founder",
  });
}

// ─── Asignaciones pendientes (Ola 5) ──────────────────────────────

/**
 * Notifica a todos los admins de AJDUT que llegó una nueva propuesta de
 * asignación que requiere validación.
 */
export async function notifyAdminsPendingAssignment(
  input: Omit<PendingAssignmentToAdminInput, "reviewUrl"> & {
    pendingId: string;
  }
) {
  const admins = getAdminNotifyEmails();
  if (admins.length === 0) {
    console.warn(
      "ADMIN_NOTIFY_EMAILS no configurado. Saltando notificación de asignación pendiente."
    );
    return { ok: false as const, error: "no admin recipients", via: "console" as const };
  }
  const reviewUrl = `${appUrl()}/admin/asignaciones`;
  const { subject, html } = pendingAssignmentToAdminEmail({
    projectName: input.projectName,
    proposedByName: input.proposedByName,
    proposedByEmail: input.proposedByEmail,
    source: input.source,
    recipientLabel: input.recipientLabel,
    shareCount: input.shareCount,
    message: input.message,
    reviewUrl,
  });
  return sendEmail({
    to: admins,
    subject,
    html,
    fireAndForget: true,
    kind: "pending-assignment.admin-notice",
  });
}

export async function notifyFounderPendingAssignmentApproved(input: {
  to: string;
  founderFirstName: string;
  projectName: string;
  projectSlug: string;
  recipientLabel: string;
  shareCount: number;
}) {
  const projectUrl = `${appUrl()}/founder/${input.projectSlug}`;
  const { subject, html } = pendingAssignmentApprovedToFounderEmail({
    founderFirstName: input.founderFirstName,
    projectName: input.projectName,
    recipientLabel: input.recipientLabel,
    shareCount: input.shareCount,
    projectUrl,
  });
  return sendEmail({
    to: input.to,
    subject,
    html,
    fireAndForget: true,
    kind: "pending-assignment.approved",
  });
}

export async function notifyFounderPendingAssignmentRejected(input: {
  to: string;
  founderFirstName: string;
  projectName: string;
  projectSlug: string;
  recipientLabel: string;
  shareCount: number;
  note: string;
}) {
  const projectUrl = `${appUrl()}/founder/${input.projectSlug}`;
  const { subject, html } = pendingAssignmentRejectedToFounderEmail({
    founderFirstName: input.founderFirstName,
    projectName: input.projectName,
    recipientLabel: input.recipientLabel,
    shareCount: input.shareCount,
    note: input.note,
    projectUrl,
  });
  return sendEmail({
    to: input.to,
    subject,
    html,
    fireAndForget: true,
    kind: "pending-assignment.rejected",
  });
}

// ─── Chat por proyecto (Ola 7a) ───────────────────────────────────

/**
 * Notifica a los miembros del canal (excluyendo al autor) que llegó un
 * mensaje nuevo. fireAndForget: si Resend está caído no rompe el post.
 *
 * En entornos no-producción NO emitimos para evitar spam durante el dev —
 * el AuditLog (CHAT.MESSAGE_POSTED) deja la traza para inspección manual.
 */
export async function notifyChannelNewMessage(
  input: { to: string[]; projectSlug: string } & Omit<ChatNewMessageInput, "chatUrl">
) {
  if (input.to.length === 0) {
    return { ok: true as const, id: null, via: "console" as const };
  }
  if (process.env.NODE_ENV !== "production") {
    // En dev/test la notificación es ruido — la dejamos visible en logs por si
    // alguien quiere verificar el flujo, sin tocar Resend.
    console.log(
      `[chat] (skip email en NODE_ENV=${process.env.NODE_ENV}) ${input.authorName} → ${input.to.length} miembro(s) en ${input.projectName}`
    );
    return { ok: true as const, id: null, via: "console" as const };
  }
  const chatUrl = `${appUrl()}/proyectos/${input.projectSlug}/chat`;
  const { subject, html } = chatNewMessageEmail({
    projectName: input.projectName,
    authorName: input.authorName,
    bodyPreview: input.bodyPreview,
    attachmentUrl: input.attachmentUrl,
    chatUrl,
  });
  return sendEmail({
    to: input.to,
    subject,
    html,
    fireAndForget: true,
    kind: "chat.new-message",
  });
}

// ─── Verificación de vida (Ola 7b) ────────────────────────────────

/**
 * Manda al miembro un email para que confirme que sigue activo. El link
 * lleva el checkId como token simple — la ruta /confirmar-vida/[id] lo
 * valida y marca la ValidationCheck como CONFIRMED.
 */
export async function notifyUserValidationCheck(input: {
  to: string;
  fullName: string;
  checkId: string;
  windowDays: number;
}) {
  const confirmUrl = `${appUrl()}/confirmar-vida/${input.checkId}`;
  const { subject, html } = validationCheckEmail({
    fullName: input.fullName,
    confirmUrl,
    windowDays: input.windowDays,
  });
  return sendEmail({
    to: input.to,
    subject,
    html,
    fireAndForget: true,
    kind: "validation.check",
  });
}

/**
 * Alerta al equipo de admins: este miembro acumuló suficientes verificaciones
 * sin responder y hay que contactar a sus herederos manualmente.
 */
export async function notifyAdminsHeirsEscalation(input: {
  userFullName: string;
  userEmail: string;
  missedCount: number;
}) {
  const admins = getAdminNotifyEmails();
  if (admins.length === 0) {
    console.warn(
      "ADMIN_NOTIFY_EMAILS no configurado. Saltando alerta de herederos."
    );
    return { ok: false as const, error: "no admin recipients", via: "console" as const };
  }
  const reviewUrl = `${appUrl()}/admin/herederos`;
  const { subject, html } = validationCheckEmail({
    fullName: "equipo",
    confirmUrl: reviewUrl,
    windowDays: 0,
  });
  // Reusamos el shell visual pero pisamos subject con texto operativo.
  const operSubject = `[AJDUT] Contactar herederos de ${input.userFullName}`;
  return sendEmail({
    to: admins,
    subject: operSubject,
    html: html
      .replace(
        "Verificación de vida",
        "Alerta — contactar herederos"
      )
      .replace(
        "Hola, equipo.",
        `Hola, equipo.`
      )
      .replace(
        /<p style="margin:0 0 16px 0;">[\s\S]*?<\/p>\s*<p style="margin:0 0 16px 0;">[\s\S]*?<\/p>/,
        `<p style="margin:0 0 16px 0;">
           <strong>${escapeHtml(input.userFullName)}</strong>
           (${escapeHtml(input.userEmail)}) acumuló ${input.missedCount}
           verificaciones de vida sin responder. Hay que ponerse en contacto
           con los herederos cargados en su cuenta.
         </p>
         <p style="margin:0 0 16px 0;">
           Entrá al panel para ver el listado de herederos y contactarlos
           uno por uno.
         </p>`
      ),
    fireAndForget: true,
    kind: "validation.escalated",
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyRequesterInfoRequestResolved(input: {
  to: string;
  projectSlug: string;
} & Omit<InfoRequestResolvedInput, "projectUrl">) {
  const projectUrl = `${appUrl()}/proyectos/${input.projectSlug}`;
  const { subject, html } = infoRequestResolvedEmail({
    requesterFirstName: input.requesterFirstName,
    projectName: input.projectName,
    founderName: input.founderName,
    decision: input.decision,
    note: input.note,
    projectUrl,
  });
  return sendEmail({
    to: input.to,
    subject,
    html,
    fireAndForget: true,
    kind: "info-request.resolved",
  });
}
