import { renderEmail, escapeText } from "../layout";

/**
 * El founder pidió más información antes de decidir sobre el lead.
 * El miembro recibe la pregunta del founder por email y debe responder
 * por fuera (la plataforma no es un chat para esta etapa).
 */
export type LeadMoreInfoRequestInput = {
  requesterFirstName: string;
  projectName: string;
  projectUrl: string;
  founderName: string;
  question: string;
};

export function leadMoreInfoRequestEmail(input: LeadMoreInfoRequestInput) {
  const subject = `${input.founderName} te pidió más información sobre ${input.projectName}`;

  const questionBlock = `
    <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
      Pregunta del project owner
    </p>
    <p style="margin:0 0 16px 0;white-space:pre-line;">${escapeText(input.question)}</p>
  `;

  const html = renderEmail({
    preview: `${input.founderName} necesita más contexto para avanzar con tu interés.`,
    eyebrow: "Conversación abierta",
    heading: `Hola, ${escapeText(input.requesterFirstName)}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        Antes de avanzar con tu interés en <strong>${escapeText(input.projectName)}</strong>,
        ${escapeText(input.founderName)} quiere conocerte un poco más.
      </p>
      ${questionBlock}
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Respondé este email directamente. La conversación es por fuera de AJDUT.
      </p>
    `,
    ctaLabel: "Ver el proyecto",
    ctaUrl: input.projectUrl,
  });

  return { subject, html };
}
