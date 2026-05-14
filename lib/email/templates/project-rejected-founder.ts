import { renderEmail, escapeText } from "../layout";

export type ProjectRejectedFounderInput = {
  founderFirstName: string;
  projectName: string;
  reason: string;
};

export function projectRejectedFounderEmail(input: ProjectRejectedFounderInput) {
  const subject = `Sobre tu proyecto ${input.projectName}`;
  const html = renderEmail({
    preview: `Tu proyecto ${input.projectName} no avanzó esta vez.`,
    eyebrow: "Resultado de la revisión",
    heading: `Hola, ${escapeText(input.founderFirstName)}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        El equipo revisó <strong>${escapeText(input.projectName)}</strong> y decidió no
        activarlo en este momento.
      </p>
      <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Nota del equipo
      </p>
      <p style="margin:0 0 16px 0;white-space:pre-line;">${escapeText(input.reason)}</p>
      <p style="margin:0;">
        Si querés volver a presentar el proyecto con cambios, podés crear uno nuevo desde tu
        cuenta. Cualquier duda, contestá este email.
      </p>
    `,
  });
  return { subject, html };
}
