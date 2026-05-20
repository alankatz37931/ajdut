import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { LEAD_EXPIRATION_DAYS } from "@/lib/constants/platform";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";

export type CreateInterestInput = {
  projectId: string;
  userId: string;            // Cualquier usuario autenticado que quiere invertir
  shareCountRequested: number;
  message: string;           // Opcional — string vacío si el usuario no quiso dejar mensaje
};

/**
 * Crea un Lead "manifestación de interés" sobre un proyecto.
 *
 * A diferencia de createLead (que requiere una Participation específica y
 * dispara la máquina de estados), este flujo es informativo: el inversor
 * dice cuántas acciones quiere y por qué. El founder (y el admin) lo ve en
 * su dashboard y decide cómo proceder: contactar, asignar, rechazar.
 *
 * No cambia el estado de ninguna Participation. La asignación posterior
 * la hace el admin vía validateAssignment con la cadena inmutable.
 */
export async function createInterestLead(input: CreateInterestInput) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, status: true, ownerId: true, totalShares: true, participations: { select: { status: true, shareCount: true } } },
  });
  if (!project) throw new NotFoundError("Project", input.projectId);
  if (project.status !== "ACTIVE") {
    throw new ValidationError(
      "projectId",
      "Solo se puede manifestar interés en proyectos activos."
    );
  }
  if (project.ownerId === input.userId) {
    throw new ForbiddenError("No podés manifestar interés en tu propio proyecto.");
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { role: true, isActive: true, deletedAt: true },
  });
  if (!user || !user.isActive || user.deletedAt) {
    throw new ForbiddenError("Sesión inválida.");
  }
  // Cualquier usuario autenticado puede manifestar interés excepto el rol
  // institucional PLATFORM (que no es un humano real).
  if (user.role === "PLATFORM") {
    throw new ForbiddenError("El usuario institucional no puede participar en proyectos.");
  }

  if (input.shareCountRequested < 1) {
    throw new ValidationError("shareCountRequested", "Cantidad mínima: 1 acción.");
  }
  if (input.message.length > 2000) {
    throw new ValidationError("message", "El mensaje no puede superar los 2000 caracteres.");
  }
  const available = project.participations
    .filter((p) => p.status === "AVAILABLE")
    .reduce((s, p) => s + p.shareCount, 0);
  if (input.shareCountRequested > available) {
    throw new ValidationError(
      "shareCountRequested",
      `Solo hay ${available} acciones disponibles en este proyecto.`
    );
  }
  // message es opcional: si vino vacío lo dejamos así

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + LEAD_EXPIRATION_DAYS);

  const lead = await prisma.lead.create({
    data: {
      projectId: project.id,
      participationId: null,
      userId: input.userId,
      message: input.message.trim(), // puede ser ""
      shareCountRequested: input.shareCountRequested,
      status: "OPEN",
      expiresAt,
    },
  });

  await recordAudit(prisma, {
    actorId: input.userId,
    projectId: project.id,
    action: "PARTICIPATION.LEAD_CREATED",
    entityType: "Lead",
    entityId: lead.id,
    payload: {
      shareCountRequested: input.shareCountRequested,
      kind: "INTEREST_PROJECT_LEVEL",
    },
  });

  return lead;
}
