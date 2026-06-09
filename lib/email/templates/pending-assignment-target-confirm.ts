import { renderEmail, escapeText } from "../layout";

/**
 * Email al target (receptor) de una PendingAssignment pidiéndole que confirme
 * la asignación antes de que el admin la ejecute. Validación bilateral.
 */
export type PendingAssignmentTargetConfirmInput = {
  targetFirstName: string;
  proposerName: string;
  projectName: string;
  shareCount: number;
  message: string | null;
  confirmUrl: string;
  expiresAt: Date;
};

function fmtInt(n: number) {
  return n.toLocaleString("es-MX");
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function pendingAssignmentTargetConfirmEmail(
  input: PendingAssignmentTargetConfirmInput
) {
  const subject = `Confirmá tu asignación en ${input.projectName} — AJDUT`;

  const messageBlock =
    input.message && input.message.trim().length > 0
      ? `
        <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
          Mensaje de ${escapeText(input.proposerName)}
        </p>
        <p style="margin:0 0 16px 0;white-space:pre-line;">${escapeText(input.message)}</p>
      `
      : "";

  const html = renderEmail({
    preview: `${input.proposerName} te quiere asignar ${fmtInt(input.shareCount)} participaciones de ${input.projectName}.`,
    eyebrow: "Tu confirmación es necesaria",
    heading: `${escapeText(input.targetFirstName)}, confirmá tu asignación.`,
    bodyHtml: `
      <p style="margin:0 0 24px 0;">
        <strong>${escapeText(input.proposerName)}</strong> propuso asignarte
        <strong>${fmtInt(input.shareCount)} participaciones</strong> de
        <strong>${escapeText(input.projectName)}</strong> en AJDUT.
      </p>
      <p style="margin:0 0 16px 0;">
        Antes de que el equipo de AJDUT ejecute la operación, necesitamos que
        confirmes que estás de acuerdo. Es un click — el link es de un solo uso
        y vence el ${escapeText(fmtDate(input.expiresAt))}.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:160px;">Proyecto</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.projectName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Propuesto por</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.proposerName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Participaciones</td>
          <td style="padding:8px 0;color:#1A1A2E;">${fmtInt(input.shareCount)}</td>
        </tr>
      </table>
      ${messageBlock}
      <p style="margin:24px 0 0 0;color:#4B4B5E;font-size:14px;">
        Si no reconocés esta propuesta, simplemente ignorá este mail — el link
        vence solo y no se ejecuta nada sin tu confirmación.
      </p>
    `,
    ctaLabel: "Revisar y confirmar →",
    ctaUrl: input.confirmUrl,
  });

  return { subject, html };
}
