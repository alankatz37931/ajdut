import type { NextAuthConfig } from "next-auth";

/**
 * Config base de Auth.js — Edge-safe.
 *
 * Esta config NO incluye el provider de Credentials porque éste depende de
 * bcryptjs (API de Node.js no soportada en Edge Runtime). El middleware
 * importa solo esta config; los handlers de la API y los server actions usan
 * la config extendida en `lib/auth/index.ts`.
 */
export type UserRoleLiteral = "ADMIN" | "PROJECT_OWNER" | "CO_ADMIN" | "PARTNER" | "PLATFORM";

/**
 * Rutas de pagina publicas — el resto requiere session activa via la
 * lógica default-deny de `authorized`. Coincide por igualdad exacta o
 * por prefijo `path.startsWith(p + "/")` (asi `/legal/terminos` queda
 * cubierto por `/legal`).
 *
 * Notas:
 *   - `/api/auth/*` y assets estaticos ya estan excluidos en el matcher
 *     de `middleware.ts`, no van aca.
 *   - `/establecer-contrasena/[token]` usa un token capability-based —
 *     no requiere session.
 */
const PUBLIC_PAGES = [
  "/nosotros",
  "/legal",
  "/acceder",
  "/aplicar",
  "/recuperar-contrasena",
  "/establecer-contrasena",
  // El comprador propuesto confirma una reventa via un token capability-based
  // (link de email de un solo uso). No requiere session.
  "/confirmar-reventa",
  // El receptor de una asignacion pendiente confirma via token capability-based
  // (link de email de un solo uso). No requiere session.
  "/confirmar-asignacion",
] as const;

export const authConfig: NextAuthConfig = {
  // Confía en el host de la request (dominio real del deploy) para resolver
  // callbacks/redirects de auth. Evita que el logout y los redirects de login
  // caigan a localhost cuando AUTH_URL no está seteada en el entorno.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/acceder",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: UserRoleLiteral }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRoleLiteral;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      // Default-deny: TODO route que no esta en `PUBLIC_PAGES` requiere
      // session activa. Antes era allowlist (solo /founder/, /partner/,
      // /admin/) lo que era frágil — cada nueva ruta protegida tenia que
      // acordarse de actualizar este array. Ahora al revés: cada ruta
      // PUBLICA explícita acá; lo nuevo queda protegido por defecto.
      //
      // El matcher de middleware.ts ya excluye /api, /_next y assets, asi
      // que esta función solo corre sobre rutas de pagina.
      const path = nextUrl.pathname;
      const isPublic =
        path === "/" ||
        PUBLIC_PAGES.some(
          (p) => path === p || path.startsWith(p + "/")
        );

      if (isPublic) return true;

      const isLoggedIn = !!auth?.user;
      if (!isLoggedIn) {
        return Response.redirect(new URL("/acceder", nextUrl));
      }
      return true;
    },
  },
};
