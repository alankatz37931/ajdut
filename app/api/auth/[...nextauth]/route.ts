import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/utils/rate-limit";

// Login: 30 intentos por IP cada 10 minutos.
// Esta capa atrapa el escenario "atacante spray-eando muchos emails desde la
// misma IP" — el límite por email vive en `validateCredentials`.
const LOGIN_IP_LIMIT = 30;
const LOGIN_IP_WINDOW_MS = 10 * 60 * 1000;

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp) return xRealIp;
  return "unknown";
}

export const { GET } = handlers;

export async function POST(req: NextRequest): Promise<Response> {
  // Solo limitamos el POST al callback de credenciales (es el path que
  // sucede en cada intento de login). Otros POSTs de NextAuth (signout,
  // callback de OAuth) no son relevantes para brute-force.
  const url = new URL(req.url);
  if (url.pathname.endsWith("/callback/credentials")) {
    const ip = getClientIp(req);
    const rl = consumeRateLimit(
      `login:ip:${ip}`,
      LOGIN_IP_LIMIT,
      LOGIN_IP_WINDOW_MS
    );
    if (!rl.ok) {
      // Devolvemos redirect al signin con error genérico, igual al shape
      // que produce NextAuth ante credenciales inválidas. No exponemos
      // que estamos rate-limiteando.
      const signInUrl = new URL("/acceder", url.origin);
      signInUrl.searchParams.set("error", "CredentialsSignin");
      return Response.redirect(signInUrl, 302);
    }
  }
  return handlers.POST(req);
}
