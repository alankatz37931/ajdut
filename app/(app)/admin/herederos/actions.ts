"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { DomainError } from "@/lib/services/errors";
import {
  runValidationCronPass,
  type CronRunStats,
} from "@/lib/services/heirs";

export type CronActionResult =
  | { ok: true; stats: CronRunStats }
  | { ok: false; error: string; code?: string };

/**
 * Disparador manual del scheduler de verificación de vida. Solo ADMIN.
 * Útil para demo y para situaciones en que la infra de cron real (Vercel
 * cron / Render / etc.) todavía no está montada.
 */
export async function runValidationCronAction(): Promise<CronActionResult> {
  await requireRole(["ADMIN"]);
  try {
    const stats = await runValidationCronPass();
    revalidatePath("/admin/herederos");
    return { ok: true, stats };
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error("[admin:runValidationCronAction]", e);
    return { ok: false, error: "Error inesperado." };
  }
}
