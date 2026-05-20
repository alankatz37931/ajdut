import { renderEmail, escapeText } from "../layout";

export type InfoRequestToFounderInput = {
  founderFirstName: string;
  projectName: string;
  requesterName: string;
  requesterEmail: string;
  message: string; // puede ser ""
  reviewUrl: string;
};

export function infoRequestToFounderEmail(input: InfoRequestToFounderInput) {
  const subject = `Nueva solicitud de información sobre ${input.projectName}`;

  const messageBlock =
    input.message.trim().length > 0
      ? `
        <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
          Mensaje
        </p>
        <p style="margin:0 0 16px 0;white-space:pre-line;">${escapeText(input.message)}</p>
      `
      : `<p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
           Sin mensaje adicional.
         </p>`;

  const html = renderEmail({
    preview: `${input.requesterName} pide más información sobre ${input.projectName}.`,
    eyebrow: "Solicitud de información",
    heading: `${input.requesterName} quiere conocer más sobre ${input.projectName}.`,
    bodyHtml: `
      <p style="margin:0 0 24px 0;">
        Hola ${escapeText(input.founderFirstName)} — un miembro de AJDUT pidió desbloquear la
        información ampliada de tu proyecto. Si aprobás la solicitud, va a poder ver tus documentos
        y reportes, y podrá avanzar al siguiente paso (manifestar interés con un monto concreto).
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:140px;">Quién</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.requesterName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Email</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.requesterEmail)}</td>
        </tr>
      </table>
      ${messageBlock}
    `,
    ctaLabel: "Revisar solicitud →",
    ctaUrl: input.reviewUrl,
  });

  return { subject, html };
}
