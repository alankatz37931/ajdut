import type { NextAuthConfig } from "next-auth";

/**
 * Config base de Auth.js — Edge-safe.
 *
 * Esta config NO incluye el provider de Credentials porque éste depende de
 * bcryptjs y otplib (APIs de Node.js no soportadas en Edge Runtime). El
 * middleware importa solo esta config; los handlers de la API y los server
 * actions usan la config extendida en `lib/auth/index.ts`.
 */
export type UserRoleLiteral = "ADMIN" | "PROJECT_OWNER" | "CO_ADMIN" | "PARTNER" | "PLATFORM";

export const authConfig: NextAuthConfig = {
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
      const isLoggedIn = !!auth?.user;
      const isProtected =
        nextUrl.pathname.startsWith("/founder") ||
        nextUrl.pathname.startsWith("/partner") ||
        nextUrl.pathname.startsWith("/admin");

      if (isProtected && !isLoggedIn) {
        return Response.redirect(new URL("/acceder", nextUrl));
      }
      return true;
    },
  },
};
