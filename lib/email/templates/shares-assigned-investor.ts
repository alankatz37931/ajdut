import { renderEmail, escapeText } from "../layout";

export type SharesAssignedInvestorInput = {
  investorFirstName: string;
  projectName: string;
  shareCount: number;
  amountFormatted: string | null;
  pricePerShareFormatted: string | null;
  serial: string;
  certificateSerial: string;
  portfolioUrl: string;
};

function fmtInt(n: number) {
  return n.toLocaleString("es-MX");
}

export function sharesAssignedInvestorEmail(input: SharesAssignedInvestorInput) {
  const subject = `Ya sos accionista de ${input.projectName}`;

  const amountRow = input.amountFormatted
    ? `<tr>
        <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:160px;">Valor de tu participación</td>
        <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.amountFormatted)}</td>
      </tr>`
    : "";

  const priceRow = input.pricePerShareFormatted
    ? `<tr>
        <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Precio por acción</td>
        <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.pricePerShareFormatted)}</td>
      </tr>`
    : "";

  const html = renderEmail({
    preview: `${fmtInt(input.shareCount)} acciones de ${input.projectName} ya están registradas a tu nombre.`,
    eyebrow: "Asignación confirmada",
    heading: `Felicitaciones, ${escapeText(input.investorFirstName)}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        El project owner de <strong>${escapeText(input.projectName)}</strong> confirmó la asignación
        de tus acciones. Ya quedaron registradas a tu nombre en AJDUT con trazabilidad
        inmutable.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:160px;">Acciones</td>
          <td style="padding:8px 0;color:#1A1A2E;">${fmtInt(input.shareCount)}</td>
        </tr>
        ${amountRow}
        ${priceRow}
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Código serial</td>
          <td style="padding:8px 0;color:#1A1A2E;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;">${escapeText(input.serial)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Certificado</td>
          <td style="padding:8px 0;color:#1A1A2E;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;">${escapeText(input.certificateSerial)}</td>
        </tr>
      </table>

      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        AJDUT no procesa pagos. El cierre económico se realiza por fuera de la plataforma según
        los términos acordados con el project owner.
      </p>
    `,
    ctaLabel: "Ver mi portafolio →",
    ctaUrl: input.portfolioUrl,
  });
  return { subject, html };
}
