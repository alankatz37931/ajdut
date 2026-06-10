/**
 * Base URL absoluta de la app, para links en emails y redirects server-side.
 *
 * Prioridad:
 *   1. `NEXT_PUBLIC_APP_URL` / `AUTH_URL` explícitas (si NO son localhost en prod).
 *   2. En desarrollo: la env explícita o `http://localhost:3000`.
 *   3. En producción: el dominio conocido (single-tenant) como red de seguridad.
 *
 * Clave: en producción IGNORA valores localhost mal configurados — antes el
 * fallback era `http://localhost:3001`, lo que mandaba los links de mail y el
 * logout a localhost si la env de Vercel faltaba o quedaba en localhost.
 */
const PROD_URL = "https://www.ajdut.com";

function isLocalhost(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
}

export function appUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "")
    .trim()
    .replace(/\/+$/, "");

  if (process.env.NODE_ENV === "development") {
    return explicit || "http://localhost:3000";
  }

  // Producción: solo aceptamos la env si apunta a un dominio real.
  if (explicit && !isLocalhost(explicit)) return explicit;
  return PROD_URL;
}
