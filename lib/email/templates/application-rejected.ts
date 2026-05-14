import { renderEmail, escapeText } from "../layout";

export type ApplicationRejectedInput = {
  fullName: string;
  rejectionNote: string;
};

export function applicationRejectedEmail(input: ApplicationRejectedInput) {
  const subject = "Sobre tu aplicación a AJDUT";
  const html = renderEmail({
    preview: "Tu aplicación no avanzó esta vez.",
    eyebrow: "— Resultado de tu aplicación",
    heading: `Hola, ${input.fullName.split(" ")[0] ?? input.fullName}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        Agradecemos tu interés en formar parte de AJDUT. Tras la revisión, decidimos no avanzar
        con tu aplicación en este momento.
      </p>
      <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        — Nota del equipo
      </p>
      <p style="margin:0 0 16px 0;white-space:pre-line;">${escapeText(input.rejectionNote)}</p>
      <p style="margin:0;">
        Puedes volver a aplicar en el futuro. Si tienes consultas adicionales, responde a este
        correo.
      </p>
    `,
  });
  return { subject, html };
}
