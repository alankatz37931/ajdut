"use server";

import { revalidatePath } from "next/cache";
import { getDict } from "@/lib/i18n";
import { markValidationConfirmed } from "@/lib/services/heirs";

export type ConfirmActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Confirma una ValidationCheck usando un token aleatorio (no requiere login).
 * El token plano viaja solo en el link del email; la DB guarda el SHA-256.
 * Tras consumirlo, el servicio setea tokenHash=null para invalidarlo
 * (single-use). Devuelve mensajes neutros para no filtrar info si el token
 * no existe, ya fue respondido o expiró.
 */
export async function confirmValidationAction(
  token: string
): Promise<ConfirmActionResult> {
  const result = await markValidationConfirmed(token);
  if (result.ok) {
    revalidatePath(`/confirmar-vida/${token}`);
    return { ok: true };
  }
  const dict = await getDict();
  if (result.reason === "ALREADY_RESPONDED") {
    return { ok: false, error: dict.confirmarVida.errAlreadyResponded };
  }
  if (result.reason === "EXPIRED") {
    // No tenemos string i18n específica para "expirado" en la action — usamos
    // el fallback de link inválido (la página principal ya tiene la vista
    // específica con alreadyExpiredBody). TODO Wave 4: agregar errExpired.
    return { ok: false, error: dict.confirmarVida.errInvalidLink };
  }
  return { ok: false, error: dict.confirmarVida.errInvalidLink };
}
