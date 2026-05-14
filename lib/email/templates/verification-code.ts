import { renderEmail } from "../layout";

export type VerificationCodeInput = {
  fullName: string;
  code: string;
  expiresAt: Date;
};

export function verificationCodeEmail(input: VerificationCodeInput) {
  const subject = `${input.code} · Tu código de verificación AJDUT`;
  const ttlMin = Math.max(
    1,
    Math.round((input.expiresAt.getTime() - Date.now()) / (60 * 1000))
  );

  const html = renderEmail({
    preview: `Tu código de verificación es ${input.code}. Válido por ${ttlMin} minutos.`,
    eyebrow: "Verificación de email",
    heading: `Hola, ${input.fullName.split(" ")[0] ?? input.fullName}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        Estás aplicando para acceder a AJDUT. Necesitamos verificar que este email es tuyo
        antes de registrar tu aplicación.
      </p>
      <p style="margin:0 0 24px 0;">Ingresá este código en la pantalla de aplicación:</p>
      <p style="margin:0 0 24px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:32px;letter-spacing:0.4em;color:#1A1A2E;background:#F5F3EE;padding:16px 24px;border:1px solid #1A1A2E;display:inline-block;">${input.code}</p>
      <p style="margin:0 0 16px 0;">Válido por ${ttlMin} minuto${ttlMin === 1 ? "" : "s"}.</p>
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Si no aplicaste a AJDUT, ignorá este email. No vamos a contactarte sin razón.
      </p>
    `,
  });
  return { subject, html };
}
