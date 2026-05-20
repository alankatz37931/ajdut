import { renderEmail, escapeText } from "../layout";

export type PendingAssignmentApprovedToFounderInput = {
  founderFirstName: string;
  projectName: string;
  recipientLabel: string;
  shareCount: number;
  projectUrl: string;
};

function fmtInt(n: number) {
  return n.toLocaleString("es-MX");
}

export function pendingAssignmentApprovedToFounderEmail(
  input: PendingAssignmentApprovedToFounderInput
) {
  const subject = `Asignación validada por AJDUT — ${input.projectName}`;
  const html = renderEmail({
    preview: `Tu propuesta de ${fmtInt(input.shareCount)} acciones para ${input.recipientLabel} fue aprobada.`,
    eyebrow: "Asignación aprobada",
    heading: `${escapeText(input.founderFirstName)}, tu asignación quedó firme.`,
    bodyHtml: `
      <p style="margin:0 0 24px 0;">
        El equipo de AJDUT validó la propuesta de asignación de
        <strong>${fmtInt(input.shareCount)} acciones</strong> de
        <strong>${escapeText(input.projectName)}</strong> para
        <strong>${escapeText(input.recipientLabel)}</strong>.
        La participación ya quedó registrada en la cadena inmutable y el
        certificado fue emitido.
      </p>
      <p style="margin:0 0 16px 0;">
        El destinatario ya recibió su notificación. Podés ver el estado del
        proyecto desde el botón de abajo.
      </p>
    `,
    ctaLabel: "Ver mi proyecto →",
    ctaUrl: input.projectUrl,
  });
  return { subject, html };
}
