import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { consumeRateLimit } from "@/lib/utils/rate-limit";
import type { UserRoleLiteral } from "./config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type ValidatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRoleLiteral;
};

// Login: 10 intentos por email cada 10 minutos.
// El límite por IP se aplica aguas arriba en el handler de NextAuth
// (ver app/api/auth/[...nextauth]/route.ts) porque acá no tenemos
// contexto de request.
const LOGIN_EMAIL_LIMIT = 10;
const LOGIN_EMAIL_WINDOW_MS = 10 * 60 * 1000;

/**
 * Lógica de autenticación pura — extraída del callback de NextAuth para que sea
 * testeable. Devuelve el user en el formato del JWT o `null` si las credenciales
 * no son válidas. Importante: nunca revela CUÁL validación falló (anti-enum).
 *
 * Vive en su propio módulo (no en `index.ts`) para no arrastrar `next-auth`
 * en el entorno de tests, que falla resolviendo `next/server` fuera de Next.
 */
export async function validateCredentials(
  rawCredentials: unknown
): Promise<ValidatedUser | null> {
  const parsed = credentialsSchema.safeParse(rawCredentials);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  // Anti brute-force: si superó el cupo por email, fallamos exactamente
  // igual que credenciales inválidas. No revelamos al cliente que está
  // rate-limited (no queremos ayudar al atacante a calibrar el ritmo).
  const rl = consumeRateLimit(
    `login:email:${normalizedEmail}`,
    LOGIN_EMAIL_LIMIT,
    LOGIN_EMAIL_WINDOW_MS
  );
  if (!rl.ok) return null;

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
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
}
