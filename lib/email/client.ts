import { Resend } from "resend";

/**
 * Cliente Resend opcional. Si RESEND_API_KEY no está configurada, devuelve null
 * y el sender hace fallback a console.log con formato legible. Esto permite
 * desarrollar y demostrar la app sin depender del servicio externo.
 */
function buildClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.trim().length === 0 || key.startsWith("re_test_placeholder")) {
    return null;
  }
  return new Resend(key);
}

let _client: Resend | null | undefined;
export function getResend(): Resend | null {
  if (_client === undefined) {
    _client = buildClient();
  }
  return _client;
}

export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "AJDUT <onboarding@resend.dev>";

/**
 * Lista de admins que reciben notificaciones operativas (nuevas aplicaciones,
 * disputas, etc.). Soporta múltiples emails separados por coma.
 */
export function getAdminNotifyEmails(): string[] {
  const raw = process.env.ADMIN_NOTIFY_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
