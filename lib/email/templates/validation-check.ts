import { renderEmail } from "../layout";

export type ValidationCheckInput = {
  fullName: string;
  confirmUrl: string;
  // Días que tiene el miembro para responder antes de marcar como MISSED.
  windowDays: number;
};

export function validationCheckEmail(input: ValidationCheckInput) {
  const subject = "¿Seguís todo en orden? — Verificación de vida AJDUT";
  const firstName = input.fullName.split(" ")[0] ?? input.fullName;

  const html = renderEmail({
    preview:
      "Tocá el botón para confirmar que seguís activo. Es solo una verificación periódica.",
    eyebrow: "Verificación de vida",
    heading: `Hola, ${firstName}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        Cada cierto tiempo te mandamos este mensaje para confirmar que seguís
        todo en orden. Si recibís este mail, solo tocá el botón para avisarnos
        que estás activo.
      </p>
      <p style="margin:0 0 16px 0;">
        Si no respondés en los próximos ${input.windowDays} días, vamos a contar
        esta verificación como sin respuesta. Después de tres consecutivas sin
        respuesta, nuestro equipo se va a poner en contacto con los herederos
        que cargaste en tu cuenta.
      </p>
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        — Equipo AJDUT
      </p>
    `,
    ctaLabel: "Sí, sigo activo →",
    ctaUrl: input.confirmUrl,
  });
  return { subject, html };
}
