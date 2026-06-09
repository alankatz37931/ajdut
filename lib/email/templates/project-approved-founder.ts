import { renderEmail, escapeText } from "../layout";

export type ProjectApprovedFounderInput = {
  founderFirstName: string;
  projectName: string;
  projectUrl: string;
};

export function projectApprovedFounderEmail(input: ProjectApprovedFounderInput) {
  const subject = `${input.projectName} ya está activo en AJDUT`;
  const html = renderEmail({
    preview: `Tu proyecto ${input.projectName} fue aprobado y ya está visible para los miembros.`,
    eyebrow: "Proyecto activo",
    heading: `${escapeText(input.projectName)} ya está activo.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        Hola ${escapeText(input.founderFirstName)} — el equipo de AJDUT aprobó tu proyecto.
        Ya está visible para los miembros, que pueden decir “me interesa participar”.
      </p>
      <p style="margin:0 0 16px 0;">
        El cap table inicial quedó armado con la totalidad de las acciones como pool disponible.
        Podés ajustar cuántas acciones querés poner a la venta desde la página de edición del
        proyecto.
      </p>
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Te avisaremos por email cada vez que un miembro diga que le interesa participar.
      </p>
    `,
    ctaLabel: "Ver mi proyecto →",
    ctaUrl: input.projectUrl,
  });
  return { subject, html };
}
