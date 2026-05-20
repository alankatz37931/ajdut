import { renderEmail, escapeText } from "../layout";

export type InterestReceivedConfirmationInput = {
  investorFirstName: string;
  projectName: string;
  founderName: string;
  sharesRequested: number;
  amountFormatted: string | null;
  pricePerShareFormatted: string | null;
  projectUrl: string;
};

function fmtInt(n: number): string {
  return n.toLocaleString("es-MX");
}

export function interestReceivedConfirmationEmail(input: InterestReceivedConfirmationInput) {
  const subject = `Recibimos tu interés en ${input.projectName}`;

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
    preview: `Tu interés en ${input.projectName} quedó registrado. ${input.founderName} te va a contactar.`,
    eyebrow: "Interés registrado",
    heading: `Gracias, ${escapeText(input.investorFirstName)}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        Registramos tu interés en <strong>${escapeText(input.projectName)}</strong>.
        ${escapeText(input.founderName)} revisa los pedidos personalmente y te va a contactar
        al email con el que estás registrado en AJDUT.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:140px;">Acciones</td>
          <td style="padding:8px 0;color:#1A1A2E;">${fmtInt(input.sharesRequested)}</td>
        </tr>
        ${amountRow}
        ${priceRow}
      </table>

      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        AJDUT no procesa pagos. El cierre se realiza por fuera de la plataforma según los términos
        que acuerdes con el project owner.
      </p>
    `,
    ctaLabel: "Ver el proyecto",
    ctaUrl: input.projectUrl,
  });

  return { subject, html };
}
