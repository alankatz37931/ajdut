import { renderEmail, escapeText } from "../layout";

export type AdminBroadcastInput = {
  subject: string;
  body: string;
};

/**
 * Email enviado por el equipo de AJDUT (no por un founder) a un grupo de
 * usuarios filtrado por rol / actividad / proyecto. El layout marca
 * explícitamente que la fuente es el equipo de AJDUT para que el destinatario
 * no lo confunda con un aviso de founder.
 */
export function adminBroadcastEmail(input: AdminBroadcastInput) {
  const subject = input.subject;
  const html = renderEmail({
    preview: `El equipo de AJDUT te escribió: ${input.subject}`,
    eyebrow: "Aviso · Equipo AJDUT",
    heading: escapeText(input.subject),
    bodyHtml: `
      <p style="margin:0 0 24px 0;white-space:pre-line;">${escapeText(input.body)}</p>
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Equipo AJDUT
      </p>
    `,
  });
  return { subject, html };
}
