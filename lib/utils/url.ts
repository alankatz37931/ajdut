/**
 * Validación de URLs aceptadas por el server. Filtra esquemas no-http(s)
 * (en particular `javascript:`, `data:`, `vbscript:`) que podrían ejecutar
 * código arbitrario al renderizar el link en la UI.
 *
 * - `normalizeOptionalUrl`: para campos opcionales. Devuelve `null` si el
 *   input está vacío, la URL trimmed si es http(s), o el sentinel `"INVALID"`
 *   si el formato/esquema no es válido. El caller decide el shape del error.
 *
 * - `normalizeRequiredUrl`: para campos obligatorios. Lanza
 *   `ValidationError(field, …)` si no es http(s) válida; si no, devuelve la
 *   URL trimmed.
 *
 * Límite duro de 2048 chars: previene tanto abuso de almacenamiento como
 * URLs absurdas que rompen layouts.
 */

import { ValidationError } from "@/lib/services/errors";

const MAX_URL_LENGTH = 2048;

export function normalizeOptionalUrl(raw: unknown): string | null | "INVALID" {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s.length === 0) return null;
  if (s.length > MAX_URL_LENGTH) return "INVALID";
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "INVALID";
    return s;
  } catch {
    return "INVALID";
  }
}

/**
 * Variante que arroja `ValidationError` en vez del sentinel — útil cuando
 * el caller ya tiene un try/catch que mapea DomainError a la respuesta.
 *
 * Empty/undefined se tratan como inválido: usar `normalizeOptionalUrl` si
 * el campo puede ser nulo.
 */
export function normalizeRequiredUrl(raw: unknown, field: string): string {
  const out = normalizeOptionalUrl(raw);
  if (out === null || out === "INVALID") {
    throw new ValidationError(field, "URL invalida — solo http/https");
  }
  return out;
}
