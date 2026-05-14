"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { saveUserPreferences, type Language, type PreferredCurrency } from "@/lib/preferences";

export type SaveResult =
  | { ok: true }
  | { ok: false; error: string };

export async function savePreferencesAction(formData: FormData): Promise<SaveResult> {
  await requireSession();

  const langRaw = String(formData.get("language") ?? "es");
  const currencyRaw = String(formData.get("currency") ?? "USD");

  // El inglés todavía no está disponible — forzamos español si nos llega "en"
  const language: Language = "es";
  if (langRaw === "en") {
    // Ignoramos en silencio para no romper el form, pero no aceptamos inglés todavía
  }

  const currency: PreferredCurrency = currencyRaw === "MXN" ? "MXN" : "USD";

  await saveUserPreferences({ language, currency });
  revalidatePath("/configuracion");
  return { ok: true };
}
