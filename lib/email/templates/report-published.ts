import { renderEmail, escapeText } from "../layout";

export type ReportPublishedInput = {
  projectName: string;
  reportTitle: string;
  period: string;        // ya humanizado: "Q1 2026" / "Anual 2026" / "Extraordinario 2026"
  kindLabel: string;     // "Trimestral" / "Update" / "Auditoría anual" / "Extraordinario"
  summary: string;
  url: string;           // link directo al archivo (storageKey)
};

export function reportPublishedEmail(input: ReportPublishedInput) {
  const subject = `Nuevo reporte ${input.period} · ${input.projectName}`;
  const html = renderEmail({
    preview: `${input.projectName} publicó un reporte ${input.period}.`,
    eyebrow: `Reporte · ${input.projectName}`,
    heading: escapeText(input.reportTitle),
    bodyHtml: `
      <p style="margin:0 0 16px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        ${escapeText(input.kindLabel)} · ${escapeText(input.period)}
      </p>
      <p style="margin:0 0 24px 0;white-space:pre-line;">${escapeText(input.summary)}</p>
    `,
    ctaLabel: "Abrir reporte →",
    ctaUrl: input.url,
  });
  return { subject, html };
}
