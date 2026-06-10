import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { ForbiddenError, InvariantViolation, NotFoundError } from "./errors";
import { ensureProjectClasses } from "./shareholder-class";

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
 *  - Crea un Pool AVAILABLE con el 100% de las acciones (el founder decide
 *    cuántas poner a la venta desde la página de edición).
 *  - Crea el canal de chat del proyecto.
 *
 * Nota: ya no se emite automáticamente la Participation institucional de
 * AJDUT (10%). Si en el futuro AJDUT acuerda un stake con un founder
 * específico, se documenta y emite por fuera de este flujo.
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

    // Materializar pool AVAILABLE para STARTUP con la totalidad de las
    // acciones. El founder ajusta cuántas pone a la venta luego.
    if (project.kind === "STARTUP" && project.startupProfile) {
      if (project.totalShares > 0) {
        const pool = await tx.participation.create({
          data: {
            projectId: project.id,
            serialCode: `AJDUT-${project.slug.toUpperCase()}-POOL`,
            shareCount: project.totalShares,
            status: "AVAILABLE",
            isPlatformStake: false,
          },
        });

        await recordAudit(tx, {
          actorId: input.adminId,
          projectId: project.id,
          action: "PARTICIPATION.CREATED",
          entityType: "Participation",
          entityId: pool.id,
          payload: {
            isPlatformStake: false,
            shares: project.totalShares,
            coAdminId: input.coAdminId ?? null,
            event: "INITIAL_POOL_CREATED",
          },
        });
      }
    }

    // 3. Canal de chat
    const existingChannel = await tx.chatChannel.findUnique({ where: { projectId: project.id } });
    if (!existingChannel) {
      await tx.chatChannel.create({ data: { projectId: project.id } });
    }

    // 4. Asegurar las 4 clases de participación canónicas (fijas). Todo
    // proyecto arranca con ellas; el owner solo reasigna participantes entre
    // ellas desde la página de composición. Idempotente.
    await ensureProjectClasses(tx, project.id);

    // 5. Activar
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
