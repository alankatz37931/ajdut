import { renderEmail, escapeText } from "../layout";

export type ApplicationReceivedInput = {
  fullName: string;
  applicationId: string;
};

/** Email al aplicante: "recibimos tu aplicación". */
export function applicationReceivedEmail(input: ApplicationReceivedInput) {
  const subject = "Recibimos tu aplicación · AJDUT";
  const html = renderEmail({
    preview: "Tu aplicación a AJDUT quedó registrada y entrará a revisión manual.",
    eyebrow: "— Aplicación recibida",
    heading: `Hola, ${input.fullName.split(" ")[0] ?? input.fullName}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        Tu solicitud para formar parte de AJDUT quedó registrada. Te contactaremos por este
        mismo medio en cuanto el equipo complete la evaluación manual.
      </p>
      <p style="margin:0 0 16px 0;">
        AJDUT es una comunidad cerrada. No hay registro automático: cada acceso se otorga tras
        revisión individual.
      </p>
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Referencia: ${escapeText(input.applicationId)}
      </p>
    `,
  });
  return { subject, html };
}
