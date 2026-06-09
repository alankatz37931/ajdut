import { renderEmail, escapeText } from "../layout";

/**
 * Email al comprador propuesto de una reventa pidiéndole que confirme la
 * operación antes de que el founder y el admin la validen. Parte de la
 * validación TRIPARTITA (comprador + founder + admin). El `confirmToken` viaja
 * como path-param de `/confirmar-reventa/[token]` y es single-use.
 */
export type ResaleBuyerConfirmInput = {
  buyerFirstName: string;
  sellerName: string;
  projectName: string;
  shareCount: number;
  pricePerShareFormatted: string | null;
  totalFormatted: string | null;
  confirmUrl: string;
  expiresAt: Date;
};

function fmtInt(n: number) {
  return n.toLocaleString("es-MX");
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function resaleBuyerConfirmEmail(input: ResaleBuyerConfirmInput) {
  const subject = `Confirmá tu compra en ${input.projectName} — AJDUT`;

  const priceRow = input.pricePerShareFormatted
    ? `
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Precio/participación</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.pricePerShareFormatted)}</td>
        </tr>`
    : "";

  const totalRow = input.totalFormatted
    ? `
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Total</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.totalFormatted)}</td>
        </tr>`
    : "";

  const html = renderEmail({
    preview: `${input.sellerName} te quiere vender ${fmtInt(input.shareCount)} participaciones de ${input.projectName}.`,
    eyebrow: "Tu confirmación es necesaria",
    heading: `${escapeText(input.buyerFirstName)}, confirmá tu compra.`,
    bodyHtml: `
      <p style="margin:0 0 24px 0;">
        <strong>${escapeText(input.sellerName)}</strong> acordó venderte
        <strong>${fmtInt(input.shareCount)} participaciones</strong> de
        <strong>${escapeText(input.projectName)}</strong> en AJDUT.
      </p>
      <p style="margin:0 0 16px 0;">
        Antes de ejecutar el traspaso necesitamos tu confirmación. Después, el
        project owner y el equipo de AJDUT validan la operación. El link es de un
        solo uso y vence el ${escapeText(fmtDate(input.expiresAt))}.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:160px;">Proyecto</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.projectName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Vendedor</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.sellerName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Participaciones</td>
          <td style="padding:8px 0;color:#1A1A2E;">${fmtInt(input.shareCount)}</td>
        </tr>
        ${priceRow}
        ${totalRow}
      </table>
      <p style="margin:24px 0 0 0;color:#4B4B5E;font-size:14px;">
        Si no reconocés esta operación, simplemente ignorá este mail — el link
        vence solo y nada se ejecuta sin tu confirmación.
      </p>
    `,
    ctaLabel: "Revisar y confirmar →",
    ctaUrl: input.confirmUrl,
  });

  return { subject, html };
}
