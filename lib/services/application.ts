import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { createPasswordSetupToken } from "./password-setup";
import {
  ForbiddenError,
  IllegalTransition,
  NotFoundError,
  ValidationError,
} from "./errors";

type Tx = Prisma.TransactionClient;

async function assertAdmin(tx: Tx, userId: string): Promise<void> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!u || u.role !== "ADMIN" || !u.isActive) {
    throw new ForbiddenError("Solo un ADMIN activo puede revisar aplicaciones.");
  }
}

export type ApproveApplicationInput = {
  applicationId: string;
  adminId: string;
  role: "PARTNER" | "PROJECT_OWNER" | "CO_ADMIN";
};

/**
 * Aprueba una Application y crea un User vinculado SIN contraseña.
 *
 * Junto con el usuario, genera un `PasswordSetupToken` de un solo uso
 * (válido 72h) y devuelve el token plano. El email de aprobación contiene
 * un link con ese token; al hacer click, el usuario:
 *   1. Elige su propia contraseña (la admin nunca la ve).
 *   2. Si su rol exige TOTP (ADMIN, PROJECT_OWNER), enrola 2FA en ese mismo paso.
 *
 * El token plano solo viaja en el email + queda en memoria un instante; en DB
 * almacenamos solo SHA-256(token).
 */
export async function approveApplication(input: ApproveApplicationInput): Promise<{
  userId: string;
  setupToken: string;
  expiresAt: Date;
}> {
  return prisma.$transaction(async (tx) => {
    await assertAdmin(tx, input.adminId);
    const app = await tx.application.findUnique({ where: { id: input.applicationId } });
    if (!app) throw new NotFoundError("Application", input.applicationId);
    if (app.status !== "PENDING" && app.status !== "UNDER_REVIEW") {
      throw new IllegalTransition(app.status, "APPROVE");
    }

    const existing = await tx.user.findUnique({ where: { email: app.email } });
    if (existing) {
      throw new ValidationError("email", `Ya existe un usuario con email ${app.email}.`);
    }

    const user = await tx.user.create({
      data: {
        email: app.email,
        fullName: app.fullName,
        role: input.role,
        passwordHash: null,
        applicationId: app.id,
      },
    });

    const { token, expiresAt } = await createPasswordSetupToken(tx, user.id, "INITIAL_SETUP");

    await tx.application.update({
      where: { id: app.id },
      data: { status: "APPROVED", reviewedById: input.adminId, reviewedAt: new Date() },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      action: "APPLICATION.APPROVED",
      entityType: "Application",
      entityId: app.id,
      payload: { userId: user.id, role: input.role },
    });
    await recordAudit(tx, {
      actorId: input.adminId,
      action: "USER.CREATED",
      entityType: "User",
      entityId: user.id,
      payload: { fromApplicationId: app.id, role: input.role, awaitingPasswordSetup: true },
    });

    return { userId: user.id, setupToken: token, expiresAt };
  });
}

export type RejectApplicationInput = {
  applicationId: string;
  adminId: string;
  rejectionNote: string;
};

export async function rejectApplication(input: RejectApplicationInput) {
  return prisma.$transaction(async (tx) => {
    await assertAdmin(tx, input.adminId);
    const app = await tx.application.findUnique({ where: { id: input.applicationId } });
    if (!app) throw new NotFoundError("Application", input.applicationId);
    if (app.status !== "PENDING" && app.status !== "UNDER_REVIEW") {
      throw new IllegalTransition(app.status, "REJECT");
    }
    if (input.rejectionNote.trim().length < 10) {
      throw new ValidationError("rejectionNote", "La nota de rechazo debe tener al menos 10 caracteres.");
    }

    await tx.application.update({
      where: { id: app.id },
      data: {
        status: "REJECTED",
        reviewedById: input.adminId,
        reviewedAt: new Date(),
        rejectionNote: input.rejectionNote,
      },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      action: "APPLICATION.REJECTED",
      entityType: "Application",
      entityId: app.id,
      payload: { rejectionNote: input.rejectionNote },
    });
  });
}
