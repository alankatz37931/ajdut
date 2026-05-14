import { Prisma, type PasswordSetupTokenKind } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";

type Tx = Prisma.TransactionClient;

const TOKEN_BYTES = 32;
const DEFAULT_TTL_HOURS: Record<PasswordSetupTokenKind, number> = {
  INITIAL_SETUP: 72,
  RESET: 1,
  BOOTSTRAP: 168,
};

const MIN_PASSWORD_LENGTH = 10;

function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

/**
 * Crea un token de seteo de contraseña y devuelve el plain.
 * El plain solo viaja en el link enviado al usuario. La DB almacena SHA-256.
 */
export async function createPasswordSetupToken(
  tx: Tx,
  userId: string,
  kind: PasswordSetupTokenKind
): Promise<{ token: string; expiresAt: Date }> {
  const ttlHours = DEFAULT_TTL_HOURS[kind];
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const plain = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(plain);

  await tx.passwordSetupToken.create({
    data: { userId, tokenHash, kind, expiresAt },
  });

  return { token: plain, expiresAt };
}

/**
 * Inspecciona un token sin consumirlo.
 * Útil para que la página de seteo decida si mostrar form o vista de error.
 */
export async function inspectToken(plainToken: string) {
  const tokenHash = hashToken(plainToken);
  const record = await prisma.passwordSetupToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, fullName: true, role: true } } },
  });
  if (!record) return { ok: false as const, error: "TOKEN_NOT_FOUND" as const };
  if (record.usedAt) return { ok: false as const, error: "TOKEN_USED" as const };
  if (record.expiresAt.getTime() < Date.now())
    return { ok: false as const, error: "TOKEN_EXPIRED" as const };

  return {
    ok: true as const,
    kind: record.kind,
    user: record.user,
    expiresAt: record.expiresAt,
  };
}

/**
 * Consume el token y setea la contraseña. Atómico.
 */
export async function setPasswordFromToken(args: {
  plainToken: string;
  newPassword: string;
}): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; error: string; code: string }
> {
  if (args.newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      code: "PASSWORD_TOO_SHORT",
    };
  }

  return prisma.$transaction(async (tx) => {
    const tokenHash = hashToken(args.plainToken);
    const record = await tx.passwordSetupToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record) return { ok: false as const, error: "Token no válido.", code: "TOKEN_NOT_FOUND" };
    if (record.usedAt) return { ok: false as const, error: "Este link ya fue usado.", code: "TOKEN_USED" };
    if (record.expiresAt.getTime() < Date.now())
      return { ok: false as const, error: "Este link expiró. Pedí uno nuevo al equipo.", code: "TOKEN_EXPIRED" };

    const passwordHash = await bcrypt.hash(args.newPassword, 10);

    await tx.user.update({
      where: { id: record.user.id },
      data: { passwordHash },
    });

    await tx.passwordSetupToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    // Invalidar otros tokens activos del mismo usuario (defense in depth)
    await tx.passwordSetupToken.updateMany({
      where: {
        userId: record.user.id,
        id: { not: record.id },
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    await recordAudit(tx, {
      actorId: record.user.id,
      action: "USER.CREATED",
      entityType: "User",
      entityId: record.user.id,
      payload: { event: "PASSWORD_SET", kind: record.kind },
    });

    return { ok: true as const, userId: record.user.id, email: record.user.email };
  });
}
