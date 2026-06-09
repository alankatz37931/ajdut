"use server";

import { revalidatePath } from "next/cache";
import { confirmTargetAcceptance } from "@/lib/services/pending-assignment";
import { DomainError } from "@/lib/services/errors";

export type ConfirmAsignacionResult =
  | { ok: true; bothPartiesConfirmed: boolean }
  | { ok: false; error: string; code?: string };

/**
 * Endpoint público (sin login). El plain token vive en la URL del link que
 * llegó por email; el server resuelve por hash y consume el token (single-use).
 */
export async function confirmAsignacionAction(
  token: string
): Promise<ConfirmAsignacionResult> {
  try {
    const result = await confirmTargetAcceptance(token);
    revalidatePath("/admin/asignaciones");
    return {
      ok: true,
      bothPartiesConfirmed: result.bothPartiesConfirmed,
    };
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error("confirmAsignacionAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }
}
