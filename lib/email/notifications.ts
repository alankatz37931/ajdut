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
