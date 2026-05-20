"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import {
  runValidationCronPass,
  type CronRunStats,
} from "@/lib/services/heirs";

export type CronActionResult =
  | { ok: true; stats: CronRunStats }
  | { ok: false; error: string };

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
    const err = e as { message?: string };
    return { ok: false, error: err.message ?? "Error inesperado." };
  }
}
