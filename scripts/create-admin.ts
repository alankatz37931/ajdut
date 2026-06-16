/**
 * Crea o resetea un usuario ADMIN — SEGURO para producción (no borra nada).
 *
 * A diferencia del seed (prisma/seed.ts), que limpia TODAS las tablas y solo
 * sirve en una DB vacía, este script hace un upsert por email: si el admin no
 * existe lo crea, y si ya existe le resetea la contraseña y lo deja activo como
 * ADMIN. No toca ningún otro dato.
 *
 * Uso:
 *   npx tsx scripts/create-admin.ts <email> <password> ["Nombre completo"]
 *
 * Ejemplo:
 *   npx tsx scripts/create-admin.ts alan@ajdut.com "una-clave-larga" "Alan Katz"
 *
 * Corre contra la DB de DATABASE_URL del entorno (.env). Para tocar producción,
 * asegurate de que DATABASE_URL apunte a la base de prod.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [emailArg, password, nameArg] = process.argv.slice(2);

  if (!emailArg || !password) {
    console.error(
      "Uso: npx tsx scripts/create-admin.ts <email> <password> [\"Nombre completo\"]"
    );
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Email inválido: ${email}`);
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email } });
  const fullName = nameArg?.trim() || existing?.fullName || "Admin AJDUT";

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, fullName, role: "ADMIN", passwordHash, isActive: true },
    update: { role: "ADMIN", passwordHash, isActive: true },
    select: { id: true, email: true, fullName: true, role: true },
  });

  console.log(
    existing
      ? `Admin actualizado (contraseña reseteada): ${user.email} — ${user.fullName}`
      : `Admin creado: ${user.email} — ${user.fullName}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
