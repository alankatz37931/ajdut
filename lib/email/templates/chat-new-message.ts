import { renderEmail, escapeText } from "../layout";

export type ChatNewMessageInput = {
  projectName: string;
  authorName: string;     // ya resuelto a alias ?? fullName por el caller
  bodyPreview: string;    // primeros ~200 chars del body, o "(archivo adjunto)"
  attachmentUrl?: string | null;
  chatUrl: string;
};

/**
 * Plantilla del email que avisa a los miembros del canal que el founder o
 * un socio dejó un mensaje nuevo. Sin contenido del body extenso — el preview
 * y el link al chat. Si solo trae un archivo, lo señalizamos.
 */
export function chatNewMessageEmail(input: ChatNewMessageInput) {
  const subject = `Nuevo mensaje en el chat · ${input.projectName}`;
  const attachmentLine = input.attachmentUrl
    ? `
      <p style="margin:0 0 16px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        ↗ Adjunto: <a href="${escapeText(input.attachmentUrl)}" style="color:#1A1A2E;">${escapeText(input.attachmentUrl.replace(/^https?:\/\//, "").slice(0, 80))}</a>
      </p>
    `
    : "";
  const html = renderEmail({
    preview: `${input.authorName} escribió en ${input.projectName}.`,
    eyebrow: `Chat · ${input.projectName}`,
    heading: `${input.authorName} escribió`,
    bodyHtml: `
      ${attachmentLine}
      <p style="margin:0 0 24px 0;white-space:pre-line;">${escapeText(input.bodyPreview)}</p>
    `,
    ctaLabel: "Abrir chat →",
    ctaUrl: input.chatUrl,
  });
  return { subject, html };
}
