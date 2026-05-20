import { renderEmail, escapeText } from "../layout";

export type NewProjectPendingAdminInput = {
  projectName: string;
  founderName: string;
  founderEmail: string;
  sector: string;
  stage: string;
  valuationFormatted: string;
  pricePerShareFormatted: string;
  totalSharesFormatted: string;
  oneLiner: string;
  reviewUrl: string;
};

const STAGE_LABEL: Record<string, string> = {
  IDEA: "Idea",
  PRE_SEED: "Pre-seed",
  SEED: "Seed",
  EARLY_REVENUE: "Early revenue",
  GROWTH: "Growth",
  SCALE: "Scale",
};

export function newProjectPendingAdminEmail(input: NewProjectPendingAdminInput) {
  const subject = `[AJDUT] Nuevo proyecto pendiente: ${input.projectName}`;
  const stageLabel = STAGE_LABEL[input.stage] ?? input.stage;

  const html = renderEmail({
    preview: `${input.founderName} subió ${input.projectName} y espera aprobación.`,
    eyebrow: "Nuevo proyecto pendiente",
    heading: `${input.founderName} subió un proyecto nuevo.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        Hay un proyecto esperando tu revisión. Datos enviados:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:140px;">Nombre</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.projectName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">One-liner</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.oneLiner)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Sector · Stage</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.sector)} · ${escapeText(stageLabel)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Founder</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.founderName)} · ${escapeText(input.founderEmail)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Valoración</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.valuationFormatted)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Precio / acción</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.pricePerShareFormatted)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Acciones totales</td>
          <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.totalSharesFormatted)}</td>
        </tr>
      </table>
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        Al aprobar, AJDUT emite automáticamente el 10% institucional y deja el resto como pool
        disponible para los miembros.
      </p>
    `,
    ctaLabel: "Revisar proyecto →",
    ctaUrl: input.reviewUrl,
  });

  return { subject, html };
}
