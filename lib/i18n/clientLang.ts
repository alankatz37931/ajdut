/**
 * Cliente: lee la cookie `ajdut-lang` del documento y devuelve sub-dicts.
 *
 * Necesario para error boundaries (`error.tsx`, `global-error.tsx`) que son
 * client components forzosos y por lo tanto no pueden recibir un dict pre-
 * cargado desde un server component padre. Tampoco corremos `getDict()` acá
 * porque depende de `next/headers` (server-only).
 *
 * Estos sub-dicts son chicos (errorBoundary, loading) — replicarlos en el
 * bundle del cliente es trivial vs. exportar todo el `dict` completo.
 */
import { dict as esDict } from "./dictionaries/es";
import { dict as enDict } from "./dictionaries/en";
import type { Dict } from "./dictionaries/es";

const LANG_COOKIE = "ajdut-lang";

function readLangFromCookie(): "es" | "en" {
  if (typeof document === "undefined") return "es";
  const raw = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LANG_COOKIE}=`));
  if (!raw) return "es";
  const value = raw.slice(LANG_COOKIE.length + 1);
  return value === "en" ? "en" : "es";
}

export function getErrorBoundaryDict(): Dict["errorBoundary"] {
  return readLangFromCookie() === "en"
    ? enDict.errorBoundary
    : esDict.errorBoundary;
}

export function getLoadingDict(): Dict["loading"] {
  return readLangFromCookie() === "en" ? enDict.loading : esDict.loading;
}
