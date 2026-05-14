import { renderEmail, escapeText } from "../layout";

export type NewApplicationAdminInput = {
  applicationId: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  motivation: string;
  referredBy: string | null;
  reviewUrl: string;
};

/** Email al equipo Admin: hay una nueva aplicación pendiente. */
export function newApplicationAdminEmail(input: NewApplicationAdminInput) {
  const subject = `Nueva aplicación · ${input.fullName}`;

  const referredByRow = input.referredBy
    ? `<tr><td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:120px;">Referido por</td>
       <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.referredBy)}</td></tr>`
    : "";

  const html = renderEmail({
    preview: `${input.fullName} aplicó para entrar a AJDUT.`,
    eyebrow: "— Nueva aplicación pendiente",
    heading: `${input.fullName} aplicó para entrar a AJDUT.`,
    bodyHtml: `
      <p style="margin:0 0 24px 0;">
        Revisa los datos de la aplicación y decide si la apruebas, rechazas o solicitas más
        información.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:120px;">Nombre</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.fullName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Email</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.email)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Teléfono</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.phone)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">País</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.country)}</td>
        </tr>
        ${referredByRow}
      </table>
      <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        — Motivación
      </p>
      <p style="margin:0 0 16px 0;white-space:pre-line;">${escapeText(input.motivation)}</p>
    `,
    ctaLabel: "Revisar aplicación →",
    ctaUrl: input.reviewUrl,
  });
  return { subject, html };
}
