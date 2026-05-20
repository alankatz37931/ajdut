import { renderEmail } from "../layout";

export type ApplicationApprovedInput = {
  fullName: string;
  role: "PARTNER" | "PROJECT_OWNER" | "CO_ADMIN";
  setupUrl: string;
  expiresAt: Date;
};

const ROLE_LABEL: Record<ApplicationApprovedInput["role"], string> = {
  PARTNER: "Miembro",
  PROJECT_OWNER: "Project owner",
  CO_ADMIN: "Co-Admin",
};

export function applicationApprovedEmail(input: ApplicationApprovedInput) {
  const subject = "Tu acceso a AJDUT fue aprobado";
  const ttlHours = Math.max(
    1,
    Math.round((input.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000))
  );

  const html = renderEmail({
    preview: "Tu aplicación fue aprobada. Establecé tu contraseña con el link de un solo uso.",
    eyebrow: "Acceso aprobado",
    heading: `Bienvenido, ${input.fullName.split(" ")[0] ?? input.fullName}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        El equipo aprobó tu aplicación. Te asignamos el rol de
        <strong>${ROLE_LABEL[input.role]}</strong>.
      </p>
      <p style="margin:0 0 16px 0;">
        Establecé tu contraseña con este link de un solo uso. Es válido por
        ${ttlHours} horas y solo podés usarlo una vez. Al confirmar la contraseña entrás directamente al sistema.
      </p>
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Si el botón no funciona, copiá el link y pegalo en tu navegador.
      </p>
    `,
    ctaLabel: "Establecer mi contraseña →",
    ctaUrl: input.setupUrl,
  });
  return { subject, html };
}
