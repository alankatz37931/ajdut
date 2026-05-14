import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./config";
import { validateCredentials } from "./credentials";

// Re-exportamos para que los consumidores existentes (`@/lib/auth`) sigan funcionando.
export { validateCredentials } from "./credentials";
export type { ValidatedUser } from "./credentials";

/**
 * Config completa, runtime Node.js.
 *
 * Login simple para una app de invitación cerrada:
 *  - Email + password.
 *  - El primer acceso de un usuario aprobado ocurre por link único en email
 *    (ver flujo de PasswordSetupToken).
 */
export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      authorize: (rawCredentials) => validateCredentials(rawCredentials),
    }),
  ],
});
