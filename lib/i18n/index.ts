/**
 * i18n "casero": cookie + diccionarios cargados server-side.
 *
 * No usamos `next-intl` ni routing-based locale — la preferencia vive en
 * cookie (`ajdut-lang`, ver lib/preferences.ts) y la respetamos en SSR
 * cargando el diccionario correspondiente.
 *
 * Uso típico en server component:
 *   const dict = await getDict();
 *   return <h1>{dict.home.titleLine1}</h1>;
 *
 * Para client components, el server component padre carga el sub-dict y se lo
 * pasa como prop (type-safe — el cliente recibe `Dict["login"]`, no un string
 * libre).
 */
import { getUserPreferences } from "@/lib/preferences";
import { dict as esDict, type Dict } from "./dictionaries/es";
import { dict as enDict } from "./dictionaries/en";

export type Language = "es" | "en";
export type { Dict } from "./dictionaries/es";

/** Lee la cookie de idioma. Default "es". */
export async function getLanguage(): Promise<Language> {
  const prefs = await getUserPreferences();
  return prefs.language;
}

/**
 * Devuelve el diccionario para el idioma activo. Tipado como `Dict` (español
 * es la source of truth), por lo que el autocomplete funciona igual para ES y
 * EN.
 */
export async function getDict(): Promise<Dict> {
  const lang = await getLanguage();
  return lang === "en" ? enDict : esDict;
}

/**
 * Devuelve el locale BCP-47 para Intl.NumberFormat / DateTimeFormat según la
 * preferencia activa. Útil para formateo coherente con el idioma del UI.
 */
export async function getLocale(): Promise<string> {
  const lang = await getLanguage();
  return lang === "en" ? "en-US" : "es-MX";
}

/** Mapeo síncrono language → locale (cuando ya tenés el language a mano). */
export function localeFor(lang: Language): string {
  return lang === "en" ? "en-US" : "es-MX";
}
