import { renderEmail, escapeText } from "../layout";

export type ResaleApprovedInput = {
  projectName: string;
  sellerName: string;
  buyerName: string;
  shareCount: number;
  projectUrl: string;
};

function fmtInt(n: number) {
  return n.toLocaleString("es-MX");
}

export function resaleApprovedEmail(input: ResaleApprovedInput) {
  const subject = `Traspaso de acciones aprobado — ${input.projectName}`;

  const html = renderEmail({
    preview: `El traspaso de ${fmtInt(input.shareCount)} acciones de ${input.projectName} fue aprobado.`,
    eyebrow: "Traspaso aprobado",
    heading: `El traspaso de ${input.projectName} quedó firme.`,
    bodyHtml: `
      <p style="margin:0 0 24px 0;">
        El equipo de AJDUT aprobó el traspaso de
        <strong>${fmtInt(input.shareCount)} acciones</strong> de
        <strong>${escapeText(input.projectName)}</strong> de
        <strong>${escapeText(input.sellerName)}</strong> a
        <strong>${escapeText(input.buyerName)}</strong>.
      </p>
      <p style="margin:0 0 16px 0;">
        El cambio de titularidad ya quedó registrado en la cadena de propiedad.
        Las acciones figuran a nombre del comprador.
      </p>
    `,
    ctaLabel: "Ver el proyecto →",
    ctaUrl: input.projectUrl,
  });

  return { subject, html };
}
