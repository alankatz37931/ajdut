"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { prisma } from "@/lib/db/client";
import { createPasswordSetupToken } from "@/lib/services/password-setup";
import { notifyPasswordReset } from "@/lib/email/notifications";
import { consumeRateLimit } from "@/lib/utils/rate-limit";

export type RecoveryResult =
  | { ok: true }
  | { ok: false; error: string };

// Password reset: 3 por email/hora + 10 por IP/hora.
// Cuando se excede el límite NO se lo decimos al cliente: devolvemos
// `ok:true` igual que el camino feliz. Así un atacante no puede usar el
// endpoint para enumerar emails ni para calibrar su ritmo.
const PWRESET_EMAIL_LIMIT = 3;
const PWRESET_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const PWRESET_IP_LIMIT = 10;
const PWRESET_IP_WINDOW_MS = 60 * 60 * 1000;

async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xRealIp = h.get("x-real-ip");
  if (xRealIp) return xRealIp;
  return "unknown";
}

/**
 * Inicia el flujo de recuperación de contraseña.
 *
 * Importante (seguridad): SIEMPRE devuelve `ok: true` haya o no usuario con
 * ese email. Esto evita revelar qué emails tienen cuenta en AJDUT (enumeration
 * attack). El email real solo sale si encontramos al usuario.
 */
export async function requestPasswordResetAction(
  formData: FormData
): Promise<RecoveryResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  // Formato inválido (vacío o sin "@"): devolvemos ok:true sin hacer nada.
  // Antes respondíamos {ok:false, errEmailInvalid} y eso permitía enumerar:
  // el atacante mandaba un email válido y otro malformado y distinguía la
  // respuesta. Ahora la UX es idéntica venga lo que venga.
  if (!email || !email.includes("@")) {
    return { ok: true };
  }

  // Rate limits: si se exceden, devolvemos ok:true sin enviar nada.
  // No queremos revelar al atacante que está siendo throttled.
  const ip = await getClientIp();
  const ipCheck = consumeRateLimit(
    `pwreset:ip:${ip}`,
    PWRESET_IP_LIMIT,
    PWRESET_IP_WINDOW_MS
  );
  const emailCheck = consumeRateLimit(
    `pwreset:email:${email}`,
    PWRESET_EMAIL_LIMIT,
    PWRESET_EMAIL_WINDOW_MS
  );
  if (!ipCheck.ok || !emailCheck.ok) {
    return { ok: true };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, fullName: true, email: true, isActive: true, deletedAt: true, role: true },
  });

  // Si existe y está activo, generamos token y enviamos email (fire-and-forget)
  if (user && user.isActive && !user.deletedAt && user.role !== "PLATFORM") {
    let token: string;
    let expiresAt: Date;
    try {
      const created = await prisma.$transaction(async (tx) => {
        return createPasswordSetupToken(tx, user.id, "RESET");
      });
      token = created.token;
      expiresAt = created.expiresAt;
    } catch (e) {
      console.error("[password-reset] failed to create token:", e);
      // Igual devolvemos ok para no revelar nada al cliente
      return { ok: true };
    }

    after(async () => {
      await notifyPasswordReset({
        to: user.email,
        fullName: user.fullName,
        resetToken: token,
        expiresAt,
      });
    });
  }

  return { ok: true };
}
