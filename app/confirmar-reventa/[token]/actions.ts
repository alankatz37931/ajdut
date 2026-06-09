"use server";

import { revalidatePath } from "next/cache";
import { confirmResaleBuyer } from "@/lib/services/participation";
import { DomainError } from "@/lib/services/errors";

export type ConfirmReventaResult =
  | { ok: true; bothPartiesConfirmed: boolean }
  | { ok: false; error: string; code?: string };

/**
 * Endpoint público (sin login). El plain token vive en la URL del link que
 * llegó por email; el server resuelve por hash y consume el token (single-use).
 */
export async function confirmReventaAction(
  token: string
): Promise<ConfirmReventaResult> {
  try {
    const result = await confirmResaleBuyer(token);
    revalidatePath("/admin/reventas");
    revalidatePath(`/proyectos/${result.projectSlug}/reventa`);
    return {
      ok: true,
      bothPartiesConfirmed: result.bothPartiesConfirmed,
    };
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error("confirmReventaAction", e);
    return { ok: false, error: "Error interno del servidor." };
  }
}
