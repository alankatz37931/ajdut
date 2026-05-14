import { FROM_EMAIL, getResend } from "./client";
import { prisma } from "@/lib/db/client";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  /**
   * Si true, NO hace throw cuando el envío falla — solo loggea.
   * Útil para no romper el flujo de aplicar/aprobar si Resend está caído.
   */
  fireAndForget?: boolean;
  /**
   * Etiqueta opcional del tipo de email (ej. "interest.founder", "application.approved")
   * para identificar la falla en el AuditLog.
   */
  kind?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null; via: "resend" | "console" }
  | { ok: false; error: string; via: "resend" | "console" };

/**
 * Persiste un fallo de envío en AuditLog para que sea visible (vía /admin
 * en el futuro, o vía Prisma Studio hoy).
 */
async function recordEmailFailure(args: {
  to: string[];
  subject: string;
  kind: string | undefined;
  error: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        action: "EMAIL.FAILED",
        entityType: "Email",
        entityId: args.kind ?? "unknown",
        payload: {
          to: args.to,
          subject: args.subject,
          kind: args.kind ?? null,
          error: args.error,
        },
      },
    });
  } catch {
    // Si ni siquiera podemos escribir al audit log, no hay mucho que hacer.
    // El error ya quedó en console.error.
  }
}

/**
 * Envía un email vía Resend si RESEND_API_KEY está configurada.
 * Si no, loggea a consola en formato legible para que el dev pueda
 * inspeccionar el contenido sin servicio externo.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getResend();
  const recipients = Array.isArray(input.to) ? input.to : [input.to];

  if (!client) {
    console.log(
      [
        "",
        "═════════════════════════════════════════════════════════════════",
        "  📧 EMAIL (fallback consola — RESEND_API_KEY no configurada)",
        "═════════════════════════════════════════════════════════════════",
        `  From:    ${FROM_EMAIL}`,
        `  To:      ${recipients.join(", ")}`,
        `  Subject: ${input.subject}`,
        "─────────────────────────────────────────────────────────────────",
        `  HTML:    ${input.html.length} chars (no se imprime; activa Resend para ver renderizado)`,
        "═════════════════════════════════════════════════════════════════",
        "",
      ].join("\n")
    );
    return { ok: true, id: null, via: "console" };
  }

  try {
    const { data, error } = await client.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject: input.subject,
      html: input.html,
    });
    if (error) {
      const msg = `Resend error: ${error.name ?? "unknown"} — ${error.message ?? ""}`;
      console.error("[email]", msg, { to: recipients, subject: input.subject, kind: input.kind });
      await recordEmailFailure({
        to: recipients,
        subject: input.subject,
        kind: input.kind,
        error: msg,
      });
      return { ok: false, error: msg, via: "resend" };
    }
    return { ok: true, id: data?.id ?? null, via: "resend" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send failed";
    console.error("[email] send threw:", msg, {
      to: recipients,
      subject: input.subject,
      kind: input.kind,
    });
    await recordEmailFailure({
      to: recipients,
      subject: input.subject,
      kind: input.kind,
      error: msg,
    });
    return { ok: false, error: msg, via: "resend" };
  }
}
