"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import {
  saveUserPreferences,
  type Language,
  type PreferredCurrency,
  type Theme,
} from "@/lib/preferences";
import {
  ALLOWED_FREQUENCIES,
  addHeir,
  removeHeir,
  setValidationFrequency,
  updateHeir,
  type AllowedFrequency,
} from "@/lib/services/heirs";
import { DomainError } from "@/lib/services/errors";

export type SaveResult =
  | { ok: true }
  | { ok: false; error: string };

export type HeirActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: string };

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

// ─── Herederos (Ola 7b) ────────────────────────────────────────────

function shareFromFd(fd: FormData): number {
  const raw = String(fd.get("sharePercent") ?? "0").replace(",", ".");
  return Number.parseFloat(raw);
}

function toDomainError(e: unknown): HeirActionResult {
  if (e instanceof DomainError) {
    const field = (e.details as { field?: string } | undefined)?.field;
    return { ok: false, error: e.message, field };
  }
  const err = e as { message?: string };
  return { ok: false, error: err?.message ?? "Error inesperado." };
}

export async function addHeirAction(fd: FormData): Promise<HeirActionResult> {
  const user = await requireSession();
  try {
    await addHeir({
      userId: user.id,
      fullName: String(fd.get("fullName") ?? ""),
      email: String(fd.get("email") ?? ""),
      relationship: String(fd.get("relationship") ?? ""),
      sharePercent: shareFromFd(fd),
    });
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (e) {
    return toDomainError(e);
  }
}

export async function updateHeirAction(
  heirId: string,
  fd: FormData
): Promise<HeirActionResult> {
  const user = await requireSession();
  try {
    await updateHeir({
      heirId,
      actorId: user.id,
      fullName: String(fd.get("fullName") ?? ""),
      email: String(fd.get("email") ?? ""),
      relationship: String(fd.get("relationship") ?? ""),
      sharePercent: shareFromFd(fd),
    });
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (e) {
    return toDomainError(e);
  }
}

export async function removeHeirAction(heirId: string): Promise<HeirActionResult> {
  const user = await requireSession();
  try {
    await removeHeir({ heirId, actorId: user.id });
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (e) {
    return toDomainError(e);
  }
}

export async function setValidationFrequencyAction(
  months: number
): Promise<HeirActionResult> {
  const user = await requireSession();
  if (!ALLOWED_FREQUENCIES.includes(months as AllowedFrequency)) {
    return { ok: false, error: "Frecuencia inválida." };
  }
  try {
    await setValidationFrequency({ userId: user.id, months });
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (e) {
    return toDomainError(e);
  }
}
