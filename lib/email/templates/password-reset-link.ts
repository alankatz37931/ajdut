import { renderEmail } from "../layout";

export type PasswordResetLinkInput = {
  fullName: string;
  resetUrl: string;
  expiresAt: Date;
};

export function passwordResetLinkEmail(input: PasswordResetLinkInput) {
  const subject = "Restablecer tu contraseña · AJDUT";
  const ttlHours = Math.max(
    1,
    Math.round((input.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000))
  );

  const html = renderEmail({
    preview: "Solicitaste restablecer tu contraseña de AJDUT.",
    eyebrow: "Restablecer contraseña",
    heading: `Hola, ${input.fullName.split(" ")[0] ?? input.fullName}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        Recibimos una solicitud para restablecer tu contraseña en AJDUT.
      </p>
      <p style="margin:0 0 16px 0;">
        Si fuiste vos, usá este link de un solo uso. Es válido por ${ttlHours} hora${ttlHours === 1 ? "" : "s"}.
      </p>
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Si no fuiste vos, ignorá este email. Tu contraseña actual sigue funcionando.
      </p>
    `,
    ctaLabel: "Restablecer contraseña →",
    ctaUrl: input.resetUrl,
  });
  return { subject, html };
}
