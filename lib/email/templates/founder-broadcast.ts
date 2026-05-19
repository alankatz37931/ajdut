import { renderEmail, escapeText } from "../layout";

export type FounderBroadcastInput = {
  projectName: string;
  founderName: string;
  subject: string;
  body: string;
};

export function founderBroadcastEmail(input: FounderBroadcastInput) {
  const subject = input.subject;
  const html = renderEmail({
    preview: `${input.founderName} te escribió sobre ${input.projectName}.`,
    eyebrow: `Aviso · ${input.projectName}`,
    heading: escapeText(input.subject),
    bodyHtml: `
      <p style="margin:0 0 24px 0;white-space:pre-line;">${escapeText(input.body)}</p>
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        ${escapeText(input.founderName)} · ${escapeText(input.projectName)}
      </p>
    `,
  });
  return { subject, html };
}
