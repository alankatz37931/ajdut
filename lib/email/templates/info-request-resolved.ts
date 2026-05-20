import { renderEmail, escapeText } from "../layout";

export type InfoRequestResolvedInput = {
  requesterFirstName: string;
  projectName: string;
  founderName: string;
  decision: "APPROVED" | "REJECTED";
  note: string; // puede ser ""
  projectUrl: string;
};

export function infoRequestResolvedEmail(input: InfoRequestResolvedInput) {
  const approved = input.decision === "APPROVED";
  const subject = approved
    ? `Tu solicitud sobre ${input.projectName} fue aprobada`
    : `Tu solicitud sobre ${input.projectName} no fue aprobada`;

  const eyebrow = approved ? "Solicitud aprobada" : "Solicitud no aprobada";
  const heading = approved
    ? `Acceso desbloqueado a ${input.projectName}.`
    : `Tu solicitud sobre ${input.projectName} no avanza por ahora.`;

  const noteBlock =
    input.note.trim().length > 0
      ? `
        <p style="margin:24px 0 8px 0;font-family:'DM Mono',Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#4B4B5E;">
          Nota del founder
        </p>
        <p style="margin:0 0 16px 0;white-space:pre-line;">${escapeText(input.note)}</p>
      `
      : "";

  const body = approved
    ? `
      <p style="margin:0 0 16px 0;">
        Hola ${escapeText(input.requesterFirstName)} — ${escapeText(input.founderName)} aprobó tu
        solicitud sobre <strong>${escapeText(input.projectName)}</strong>. Ya podés ver los
        documentos y reportes del proyecto. Si querés avanzar, vas a ver el botón
        “Me interesa participar” para indicar un monto.
      </p>
      ${noteBlock}
    `
    : `
      <p style="margin:0 0 16px 0;">
        Hola ${escapeText(input.requesterFirstName)} — ${escapeText(input.founderName)} revisó tu
        solicitud sobre <strong>${escapeText(input.projectName)}</strong> y por ahora no avanza.
      </p>
      ${noteBlock}
    `;

  const html = renderEmail({
    preview: approved
      ? `Tu solicitud sobre ${input.projectName} fue aprobada.`
      : `Tu solicitud sobre ${input.projectName} no fue aprobada.`,
    eyebrow,
    heading,
    bodyHtml: body,
    ctaLabel: "Ver el proyecto",
    ctaUrl: input.projectUrl,
  });

  return { subject, html };
}
