"use server";

import { revalidatePath } from "next/cache";
import { saveUserPreferences, type Language } from "@/lib/preferences";

/**
 * Setea el idioma en cookie sin requerir sesión — usado por el toggle EN|ES
 * del PublicNav (landing, /acceder, /aplicar, /nosotros, /legal). Para
 * usuarios logueados el switch sigue viviendo en /configuracion.
 */
export async function setLanguagePublicAction(lang: Language): Promise<void> {
  const safe: Language = lang === "en" ? "en" : "es";
  await saveUserPreferences({ language: safe });
  // Layout-level revalidate para que TODOS los server components
  // que cargaron el dict viejo se re-rendericen con el nuevo.
  revalidatePath("/", "layout");
}
