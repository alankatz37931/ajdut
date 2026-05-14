import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { authConfig, type UserRoleLiteral } from "./config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

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
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user || !user.isActive || user.deletedAt) return null;
        if (user.role === "PLATFORM") return null;

        // Usuarios recién aprobados existen sin password hasta que completan
        // /establecer-contrasena. Hasta entonces no pueden loguear.
        if (!user.passwordHash) return null;

        const passwordOk = await bcrypt.compare(password, user.passwordHash);
        if (!passwordOk) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role as UserRoleLiteral,
        };
      },
    }),
  ],
});
