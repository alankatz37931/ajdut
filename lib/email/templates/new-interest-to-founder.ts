import { renderEmail, escapeText } from "../layout";

export type NewInterestToFounderInput = {
  founderFirstName: string;
  projectName: string;
  investorName: string;
  investorEmail: string;
  sharesRequested: number;
  amountFormatted: string | null; // ej. "USD 5,000.00", null si no hay precio
  pricePerShareFormatted: string | null;
  message: string; // puede ser ""
  leadsUrl: string;
};

function fmtInt(n: number): string {
  return n.toLocaleString("es-MX");
}

export function newInterestToFounderEmail(input: NewInterestToFounderInput) {
  const subject = `Nuevo interés en ${input.projectName}`;

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

  const amountRow = input.amountFormatted
    ? `<tr>
        <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:140px;">Equivalente</td>
        <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.amountFormatted)}</td>
      </tr>`
    : "";

  const priceRow = input.pricePerShareFormatted
    ? `<tr>
        <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Precio / acción</td>
        <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.pricePerShareFormatted)}</td>
      </tr>`
    : "";

  const html = renderEmail({
    preview: `${input.investorName} quiere participar con ${fmtInt(input.sharesRequested)} acciones de ${input.projectName}.`,
    eyebrow: "Nuevo interés",
    heading: `${input.investorName} se interesó en ${input.projectName}.`,
    bodyHtml: `
      <p style="margin:0 0 24px 0;">
        Hola ${escapeText(input.founderFirstName)} — recibimos un nuevo interés de participación.
        Revisá los detalles y contactalo cuando puedas.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:140px;">Quién</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.investorName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Email</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.investorEmail)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Acciones</td>
          <td style="padding:8px 0;color:#1A1A2E;">${fmtInt(input.sharesRequested)}</td>
        </tr>
        ${amountRow}
        ${priceRow}
      </table>
      ${messageBlock}
    `,
    ctaLabel: "Ver todos los leads →",
    ctaUrl: input.leadsUrl,
  });

  return { subject, html };
}
