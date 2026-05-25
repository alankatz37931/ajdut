"use server";

import { after } from "next/server";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { createPasswordSetupToken } from "@/lib/services/password-setup";
import { notifyPasswordReset } from "@/lib/email/notifications";

export type RecoveryResult =
  | { ok: true }
  | { ok: false; error: string };

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
  if (!email || !email.includes("@")) {
    const dict = await getDict();
    return { ok: false, error: dict.recoveryPassword.errEmailInvalid };
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
