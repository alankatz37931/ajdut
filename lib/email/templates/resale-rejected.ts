import { renderEmail, escapeText } from "../layout";

export type ResaleRejectedInput = {
  projectName: string;
  shareCount: number;
  note: string;
  resaleUrl: string;
};

function fmtInt(n: number) {
  return n.toLocaleString("es-MX");
}

export function resaleRejectedEmail(input: ResaleRejectedInput) {
  const subject = `Traspaso de acciones rechazado — ${input.projectName}`;

  const html = renderEmail({
    preview: `El traspaso de ${fmtInt(input.shareCount)} acciones de ${input.projectName} fue rechazado.`,
    eyebrow: "Traspaso rechazado",
    heading: `El traspaso de ${input.projectName} no se ejecutó.`,
    bodyHtml: `
      <p style="margin:0 0 24px 0;">
        El equipo de AJDUT revisó el traspaso de
        <strong>${fmtInt(input.shareCount)} acciones</strong> de
        <strong>${escapeText(input.projectName)}</strong> y no lo aprobó. Tu
        reventa volvió al tablón para que puedas corregirla o designar otro
        comprador.
      </p>
      <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Nota del equipo
      </p>
      <p style="margin:0 0 16px 0;white-space:pre-line;">${escapeText(input.note)}</p>
    `,
    ctaLabel: "Ver la reventa →",
    ctaUrl: input.resaleUrl,
  });

  return { subject, html };
}
