import { cookies } from "next/headers";

export type Language = "es" | "en";
export type PreferredCurrency = "USD" | "MXN";

export type UserPreferences = {
  language: Language;
  currency: PreferredCurrency;
};

const LANG_COOKIE = "ajdut-lang";
const CURRENCY_COOKIE = "ajdut-currency";

const DEFAULTS: UserPreferences = {
  language: "es",
  currency: "USD",
};

/**
 * Lee las preferencias del usuario desde cookies (server-side).
 * Si no están seteadas, devuelve los defaults (es / USD).
 */
export async function getUserPreferences(): Promise<UserPreferences> {
  const store = await cookies();
  const rawLang = store.get(LANG_COOKIE)?.value;
  const rawCurrency = store.get(CURRENCY_COOKIE)?.value;

  const language: Language = rawLang === "en" ? "en" : "es";
  const currency: PreferredCurrency = rawCurrency === "MXN" ? "MXN" : "USD";

  return { language, currency };
}

/**
 * Guarda las preferencias en cookies. Llamar desde una server action.
 */
export async function saveUserPreferences(prefs: Partial<UserPreferences>): Promise<void> {
  const store = await cookies();
  const oneYearSeconds = 60 * 60 * 24 * 365;

  if (prefs.language !== undefined) {
    store.set(LANG_COOKIE, prefs.language, {
      maxAge: oneYearSeconds,
      sameSite: "lax",
      path: "/",
    });
  }
  if (prefs.currency !== undefined) {
    store.set(CURRENCY_COOKIE, prefs.currency, {
      maxAge: oneYearSeconds,
      sameSite: "lax",
      path: "/",
    });
  }
}

export { DEFAULTS as DEFAULT_PREFERENCES };
