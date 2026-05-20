import { renderEmail, escapeText } from "../layout";

export type FounderInviteInput = {
  inviteeFirstName: string;
  founderName: string;
  projectName: string;
  shareCount: number;
  /** Mensaje opcional del founder al invitado. */
  message?: string | null;
  /**
   * Link para establecer contraseña por primera vez. Solo presente cuando
   * el usuario es nuevo (recién creado por la acción de invitación).
   */
  setupUrl?: string | null;
  /** Vencimiento del setupUrl. Solo relevante si setupUrl está presente. */
  expiresAt?: Date | null;
  /** Link de login, usado cuando el usuario ya existía. */
  loginUrl: string;
  /** True cuando el User fue creado por esta invitación. */
  isNew: boolean;
};

function fmtInt(n: number): string {
  return n.toLocaleString("es-MX");
}

function fmtExpiry(d: Date): string {
  // Formato corto en español, ej. "15 mar, 18:30"
  return d.toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function founderInviteEmail(input: FounderInviteInput) {
  const subject = input.isNew
    ? `${input.founderName} te invitó a ${input.projectName}`
    : `Tenés ${fmtInt(input.shareCount)} acciones nuevas en ${input.projectName}`;

  const messageBlock = input.message
    ? `
      <div style="margin:24px 0;padding:16px 20px;background:#F5F3EE;border-left:2px solid #C8A96E;">
        <p style="margin:0 0 6px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
          Mensaje de ${escapeText(input.founderName)}
        </p>
        <p style="margin:0;white-space:pre-line;color:#1A1A2E;">${escapeText(input.message)}</p>
      </div>
    `
    : "";

  const summaryTable = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border-top:0.5px solid #E8E3D9;border-bottom:0.5px solid #E8E3D9;">
      <tr>
        <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;width:160px;">Proyecto</td>
        <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.projectName)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Acciones asignadas</td>
        <td style="padding:8px 0;color:#1A1A2E;">${fmtInt(input.shareCount)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">Founder</td>
        <td style="padding:8px 0;color:#1A1A2E;">${escapeText(input.founderName)}</td>
      </tr>
    </table>
  `;

  if (input.isNew && input.setupUrl) {
    const expiryNote = input.expiresAt
      ? `<p style="margin:16px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">El link vence el ${escapeText(fmtExpiry(input.expiresAt))}.</p>`
      : "";

    const html = renderEmail({
      preview: `${input.founderName} te asignó ${fmtInt(input.shareCount)} acciones en ${input.projectName}.`,
      eyebrow: "Invitación a AJDUT",
      heading: `Bienvenida/o, ${escapeText(input.inviteeFirstName)}.`,
      bodyHtml: `
        <p style="margin:0 0 16px 0;">
          <strong>${escapeText(input.founderName)}</strong> te invitó a ser parte de
          <strong>${escapeText(input.projectName)}</strong> y ya quedaron registradas a tu nombre
          <strong>${fmtInt(input.shareCount)}</strong> acciones del proyecto.
        </p>
        <p style="margin:0 0 16px 0;">
          Para acceder a tu cuenta en AJDUT y ver tus participaciones, primero establecé tu
          contraseña.
        </p>
        ${summaryTable}
        ${messageBlock}
        ${expiryNote}
        <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
          AJDUT no procesa pagos. El cierre económico se acuerda directamente con el founder.
        </p>
      `,
      ctaLabel: "Establecer contraseña →",
      ctaUrl: input.setupUrl,
    });
    return { subject, html };
  }

  // Usuario ya existía: notificación de nueva asignación + link a login
  const html = renderEmail({
    preview: `Tenés ${fmtInt(input.shareCount)} acciones nuevas en ${input.projectName}.`,
    eyebrow: "Nueva asignación",
    heading: `Hola, ${escapeText(input.inviteeFirstName)}.`,
    bodyHtml: `
      <p style="margin:0 0 16px 0;">
        <strong>${escapeText(input.founderName)}</strong> te asignó
        <strong>${fmtInt(input.shareCount)}</strong> acciones de
        <strong>${escapeText(input.projectName)}</strong>. Ya quedaron registradas a tu nombre.
      </p>
      ${summaryTable}
      ${messageBlock}
      <p style="margin:24px 0 0 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
        AJDUT no procesa pagos. El cierre económico se acuerda directamente con el founder.
      </p>
    `,
    ctaLabel: "Ver mi portafolio →",
    ctaUrl: input.loginUrl,
  });
  return { subject, html };
}
