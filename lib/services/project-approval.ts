import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { computeBlockHash } from "@/lib/crypto/ownership-chain";
import { PLATFORM_USER_EMAIL } from "@/lib/constants/platform";
import { ForbiddenError, InvariantViolation, NotFoundError } from "./errors";

type Tx = Prisma.TransactionClient;

async function assertAdmin(tx: Tx, userId: string): Promise<void> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!u || u.role !== "ADMIN" || !u.isActive) {
    throw new ForbiddenError("Solo un ADMIN activo puede aprobar proyectos.");
  }
}

export type ApproveProjectInput = {
  projectId: string;
  adminId: string;
  /** Co-firma opcional para mayor trazabilidad. No es obligatoria en v1. */
  coAdminId?: string | null;
};

/**
 * Aprueba un proyecto: PENDING_APPROVAL → ACTIVE.
 *
 * Para proyectos STARTUP, materializa el cap table inicial:
 *  - Emite la Participation institucional de AJDUT (10% del total) — locked.
 *  - Crea un Pool AVAILABLE con el resto de las acciones.
 *  - Registra OwnershipHistory inmutable de la emisión.
 *  - Crea el canal de chat del proyecto.
 */
export async function approveProject(input: ApproveProjectInput) {
  return prisma.$transaction(async (tx) => {
    await assertAdmin(tx, input.adminId);
    if (input.coAdminId && input.coAdminId !== input.adminId) {
      await assertAdmin(tx, input.coAdminId);
    }

    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      include: { startupProfile: true },
    });
    if (!project) throw new NotFoundError("Project", input.projectId);
    if (project.status !== "PENDING_APPROVAL") {
      throw new InvariantViolation(
        "PR_01_INVALID_STATUS",
        `Solo proyectos en PENDING_APPROVAL se pueden aprobar. Estado actual: ${project.status}.`
      );
    }

    // Materializar cap table inicial para STARTUP
    if (project.kind === "STARTUP" && project.startupProfile) {
      const platformUser = await tx.user.findUnique({ where: { email: PLATFORM_USER_EMAIL } });
      if (!platformUser) {
        throw new InvariantViolation(
          "P_00_PLATFORM_USER_MISSING",
          "Usuario institucional PLATFORM no existe."
        );
      }

      const pct = new Prisma.Decimal(project.startupProfile.platformEquityPercent);
      const platformShares = new Prisma.Decimal(project.totalShares).mul(pct).div(100).floor().toNumber();
      if (platformShares <= 0) {
        throw new InvariantViolation(
          "PR_03_PLATFORM_SHARES_ZERO",
          "El cálculo de shares institucionales resultó en cero."
        );
      }

      const now = new Date();

      // 1. Participation institucional (10% de AJDUT)
      const platformParticipation = await tx.participation.create({
        data: {
          projectId: project.id,
          serialCode: `AJDUT-${project.slug.toUpperCase()}-PLATFORM`,
          shareCount: platformShares,
          status: "ASSIGNED",
          currentOwnerId: platformUser.id,
          isPlatformStake: true,
          acquiredAt: now,
        },
      });

      const payload = {
        participationId: platformParticipation.id,
        fromUserId: null,
        toUserId: platformUser.id,
        authorizedById: input.adminId,
        coAuthorizedById: input.coAdminId ?? null,
        reason: `Platform equity stake: ${pct.toString()}% (${platformShares} shares) — auto-emisión al activar el proyecto.`,
        resaleListingId: null,
        effectiveAt: now.toISOString(),
      };
      const blockHash = computeBlockHash(payload, null);

      await tx.ownershipHistory.create({
        data: {
          participationId: platformParticipation.id,
          fromUserId: null,
          toUserId: platformUser.id,
          authorizedById: input.adminId,
          coAuthorizedById: input.coAdminId ?? null,
          reason: payload.reason,
          resaleListingId: null,
          effectiveAt: now,
          blockHash,
          prevHash: null,
        },
      });

      // 2. Pool AVAILABLE con el resto de las acciones (founder decide
      //    cuántas vender después editando la cantidad disponible).
      const poolShares = project.totalShares - platformShares;
      if (poolShares > 0) {
        await tx.participation.create({
          data: {
            projectId: project.id,
            serialCode: `AJDUT-${project.slug.toUpperCase()}-POOL`,
            shareCount: poolShares,
            status: "AVAILABLE",
            isPlatformStake: false,
          },
        });
      }

      await recordAudit(tx, {
        actorId: input.adminId,
        projectId: project.id,
        action: "PARTICIPATION.CREATED",
        entityType: "Participation",
        entityId: platformParticipation.id,
        payload: {
          isPlatformStake: true,
          shares: platformShares,
          coAdminId: input.coAdminId ?? null,
        },
      });
    }

    // 3. Canal de chat
    const existingChannel = await tx.chatChannel.findUnique({ where: { projectId: project.id } });
    if (!existingChannel) {
      await tx.chatChannel.create({ data: { projectId: project.id } });
    }

    // 4. Activar
    await tx.project.update({
      where: { id: project.id },
      data: {
        status: "ACTIVE",
        approvedAt: new Date(),
        approvedById: input.adminId,
      },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: project.id,
      action: "PROJECT.APPROVED",
      entityType: "Project",
      entityId: project.id,
      payload: { coAdminId: input.coAdminId ?? null },
    });
  });
}
