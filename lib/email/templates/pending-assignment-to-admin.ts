import { renderEmail, escapeText } from "../layout";

export type PendingAssignmentToAdminInput = {
  projectName: string;
  proposedByName: string;
  proposedByEmail: string;
  source: "LEAD" | "INVITE";
  recipientLabel: string; // nombre + email del destinatario (o invitado)
  shareCount: number;
  message: string | null;
  reviewUrl: string;
};

function fmtInt(n: number) {
  return n.toLocaleString("es-MX");
}

export function pendingAssignmentToAdminEmail(input: PendingAssignmentToAdminInput) {
  const subject = `Nueva asignación pendiente — ${input.projectName}`;
  const sourceLabel = input.source === "LEAD" ? "Lead aceptado" : "Invitación directa";

  const messageBlock =
    input.message && input.message.trim().length > 0
      ? `
        <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
          Mensaje del project owner
        </p>
        <p style="margin:0 0 16px 0;white-space:pre-line;">${escapeText(input.message)}</p>
      `
      : "";

  const html = renderEmail({
    preview: `${input.proposedByName} propuso ${fmtInt(input.shareCount)} acciones de ${input.projectName} para ${input.recipientLabel}.`,
    eyebrow: "Validación requerida",
    heading: `Nueva asignación pendiente en ${input.projectName}.`,
    bodyHtml: `
      <p style="margin:0 0 24px 0;">
        El project owner propuso una asignación de acciones que necesita tu validación
        antes de ejecutarse.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:160px;">Origen</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(sourceLabel)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Project owner</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.proposedByName)} · ${escapeText(input.proposedByEmail)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Destinatario</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.recipientLabel)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Acciones</td>
          <td style="padding:8px 0;color:#1A1A2E;">${fmtInt(input.shareCount)}</td>
        </tr>
      </table>
      ${messageBlock}
    `,
    ctaLabel: "Revisar asignación →",
    ctaUrl: input.reviewUrl,
  });

  return { subject, html };
}
