import { renderEmail, escapeText } from "../layout";

export type ProjectApprovedFounderInput = {
  founderFirstName: string;
  projectName: string;
  projectUrl: string;
};

export function projectApprovedFounderEmail(input: ProjectApprovedFounderInput) {
  const subject = `${input.projectName} ya está activo en AJDUT`;
  const html = renderEmail({
    preview: `Tu proyecto ${input.projectName} fue aprobado y ya está visible para inversores.`,
    eyebrow: "Proyecto activo",
    heading: `${escapeText(input.projectName)} ya está activo.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        Hola ${escapeText(input.founderFirstName)} — el equipo de AJDUT aprobó tu proyecto.
        Ya está visible para inversores que pueden manifestar interés en comprar acciones.
      </p>
      <p style="margin:0 0 16px 0;">
        El cap table inicial quedó armado: AJDUT mantiene el 10% institucional y el resto está
        disponible como pool. Podés ajustar cuántas acciones querés poner a la venta desde la
        página de edición del proyecto.
      </p>
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Te avisaremos por email cada vez que un inversor manifieste interés.
      </p>
    `,
    ctaLabel: "Ver mi proyecto →",
    ctaUrl: input.projectUrl,
  });
  return { subject, html };
}
