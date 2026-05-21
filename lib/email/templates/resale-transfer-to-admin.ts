import { renderEmail, escapeText } from "../layout";

export type ResaleTransferToAdminInput = {
  projectName: string;
  sellerName: string;
  buyerName: string;
  shareCount: number;
  intentNote: string;
  reviewUrl: string;
};

function fmtInt(n: number) {
  return n.toLocaleString("es-MX");
}

export function resaleTransferToAdminEmail(input: ResaleTransferToAdminInput) {
  const subject = `Reventa para aprobar — ${input.projectName}`;

  const noteBlock =
    input.intentNote.trim().length > 0
      ? `
        <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
          Nota del vendedor
        </p>
        <p style="margin:0 0 16px 0;white-space:pre-line;">${escapeText(input.intentNote)}</p>
      `
      : "";

  const html = renderEmail({
    preview: `${input.sellerName} acordó vender ${fmtInt(input.shareCount)} acciones de ${input.projectName} a ${input.buyerName}.`,
    eyebrow: "Validación requerida",
    heading: `Traspaso de reventa pendiente en ${input.projectName}.`,
    bodyHtml: `
      <p style="margin:0 0 24px 0;">
        Un miembro acordó revender sus acciones y designó al comprador. El
        traspaso necesita la aprobación del equipo de AJDUT antes de ejecutarse
        y registrarse en la cadena de propiedad.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:160px;">Vendedor</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.sellerName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Comprador</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.buyerName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Acciones</td>
          <td style="padding:8px 0;color:#1A1A2E;">${fmtInt(input.shareCount)}</td>
        </tr>
      </table>
      ${noteBlock}
    `,
    ctaLabel: "Revisar el traspaso →",
    ctaUrl: input.reviewUrl,
  });

  return { subject, html };
}
