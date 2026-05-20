import { renderEmail, escapeText } from "../layout";

export type PendingAssignmentRejectedToFounderInput = {
  founderFirstName: string;
  projectName: string;
  recipientLabel: string;
  shareCount: number;
  note: string;
  projectUrl: string;
};

function fmtInt(n: number) {
  return n.toLocaleString("es-MX");
}

export function pendingAssignmentRejectedToFounderEmail(
  input: PendingAssignmentRejectedToFounderInput
) {
  const subject = `Asignación rechazada por AJDUT — ${input.projectName}`;
  const html = renderEmail({
    preview: `Tu propuesta de ${fmtInt(input.shareCount)} acciones para ${input.recipientLabel} fue rechazada.`,
    eyebrow: "Asignación rechazada",
    heading: `${escapeText(input.founderFirstName)}, revisamos tu propuesta.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        El equipo de AJDUT decidió no aprobar la asignación de
        <strong>${fmtInt(input.shareCount)} acciones</strong> de
        <strong>${escapeText(input.projectName)}</strong> a
        <strong>${escapeText(input.recipientLabel)}</strong>.
      </p>
      <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Nota del revisor
      </p>
      <p style="margin:0 0 24px 0;white-space:pre-line;">${escapeText(input.note)}</p>
      <p style="margin:0;">
        Si querés, podés proponer una nueva asignación desde tu proyecto.
      </p>
    `,
    ctaLabel: "Volver a mi proyecto →",
    ctaUrl: input.projectUrl,
  });
  return { subject, html };
}
