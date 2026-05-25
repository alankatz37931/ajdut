"use server";

import { revalidatePath } from "next/cache";
import { getDict } from "@/lib/i18n";
import { markValidationConfirmed } from "@/lib/services/heirs";

export type ConfirmActionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Confirma una ValidationCheck usando su id como token (no requiere login).
 * El id es un cuid de longitud >= 20 — suficientemente difícil de adivinar.
 * El servicio devuelve mensajes neutros para no filtrar info si el id no
 * existe o el check ya fue respondido.
 */
export async function confirmValidationAction(
  checkId: string
): Promise<ConfirmActionResult> {
  const result = await markValidationConfirmed(checkId);
  if (result.ok) {
    revalidatePath(`/confirmar-vida/${checkId}`);
    return { ok: true };
  }
  const dict = await getDict();
  if (result.reason === "ALREADY_RESPONDED") {
    return { ok: false, error: dict.confirmarVida.errAlreadyResponded };
  }
  return { ok: false, error: dict.confirmarVida.errInvalidLink };
}
