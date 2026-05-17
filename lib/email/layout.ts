/**
 * Layout HTML compartido para todos los emails de AJDUT.
 * Mantiene la identidad visual (paper, navy, gold, hairline, DM Mono en cifras).
 * Sin imágenes, sin CSS externo — todo inline.
 */

export type EmailLayoutInput = {
  preview: string;       // Texto que se muestra en el preview del cliente de email
  eyebrow: string;       // p.ej. "— Aplicación recibida"
  heading: string;       // título principal
  bodyHtml: string;      // contenido principal en HTML
  ctaLabel?: string;
  ctaUrl?: string;
};

const PAPER = "#F5F3EE";
const NAVY = "#1A1A2E";
const NAVY_MUTED = "#4B4B5E";
const GOLD = "#C8A96E";
const LINE = "#E8E3D9";

export function renderEmail(input: EmailLayoutInput): string {
  const cta = input.ctaUrl && input.ctaLabel
    ? `
      <tr><td style="padding-top:24px;">
        <a href="${escapeAttr(input.ctaUrl)}"
           style="display:inline-block;background:${NAVY};color:${PAPER};
                  padding:14px 24px;text-decoration:none;font-family:Inter,Arial,sans-serif;
                  font-size:15px;letter-spacing:0.02em;">
          ${escapeText(input.ctaLabel)}
        </a>
      </td></tr>
    `
    : "";

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AJDUT</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
  <span style="display:none;visibility:hidden;opacity:0;font-size:0;line-height:0;max-height:0;max-width:0;">
    ${escapeText(input.preview)}
  </span>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${PAPER};">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:${PAPER};">

        <tr><td style="padding:0 0 32px 0;border-bottom:0.5px solid ${LINE};">
          <span style="font-family:Inter,Arial,sans-serif;font-size:24px;color:${NAVY};letter-spacing:-0.01em;">
            AJD<span style="display:inline-block;position:relative;">U<span style="position:absolute;left:10%;right:10%;bottom:1px;height:2px;background:${GOLD};"></span></span>T
          </span>
        </td></tr>

        <tr><td style="padding:32px 0 0 0;">
          <p style="margin:0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${NAVY_MUTED};">
            ${escapeText(input.eyebrow)}
          </p>
        </td></tr>

        <tr><td style="padding:16px 0 0 0;">
          <h1 style="margin:0;font-family:Inter,Arial,sans-serif;font-size:32px;line-height:1.15;letter-spacing:-0.01em;color:${NAVY};font-weight:400;">
            ${escapeText(input.heading)}
          </h1>
        </td></tr>

        <tr><td style="padding:24px 0 0 0;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:${NAVY};">
          ${input.bodyHtml}
        </td></tr>

        ${cta}

        <tr><td style="padding:48px 0 24px 0;border-top:0.5px solid ${LINE};font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${NAVY_MUTED};">
          AJDUT · v1.0<br>
          Este email se generó automáticamente. AJDUT no procesa pagos ni custodia fondos.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

export { escapeText, escapeAttr };
