"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import {
  saveUserPreferences,
  type Language,
  type PreferredCurrency,
  type Theme,
} from "@/lib/preferences";

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

  const themeRaw = String(formData.get("theme") ?? "light");
  const theme: Theme = themeRaw === "dark" ? "dark" : "light";

  await saveUserPreferences({ language, currency, theme });
  revalidatePath("/configuracion");
  // El tema lo aplica el RootLayout (clase en <html>) en el próximo render.
  revalidatePath("/", "layout");
  return { ok: true };
}
