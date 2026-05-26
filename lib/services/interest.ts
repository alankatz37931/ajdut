import { prisma } from "@/lib/db/client";
import type { LeadSupportKind } from "@prisma/client";
import { recordAudit } from "./audit";
import { getAvailableSharesForProposal } from "./pending-assignment";
import { LEAD_EXPIRATION_DAYS } from "@/lib/constants/platform";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";

export type CreateInterestInput = {
  projectId: string;
  userId: string;            // Cualquier usuario autenticado que quiere invertir
  shareCountRequested: number;
  message: string;           // Opcional — string vacío si el usuario no quiso dejar mensaje
  supportKind?: LeadSupportKind; // Opcional: tipo de apoyo (Capital, Sponsor, etc.)
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
  // Validaciones que no tocan DB: barato hacerlas antes de abrir tx.
  if (input.shareCountRequested < 1) {
    throw new ValidationError("shareCountRequested", "Cantidad mínima: 1 acción.");
  }
  if (input.message.length > 2000) {
    throw new ValidationError("message", "El mensaje no puede superar los 2000 caracteres.");
  }

  // Toda la lectura del proyecto + check de availability + create del Lead
  // va dentro de una transacción para que dos formularios concurrentes no
  // ambos vean "100 disponibles" y ambos creen leads. `getAvailableSharesForProposal`
  // descuenta también PendingAssignments pendientes, así el check es más fiel.
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, status: true, ownerId: true },
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

    const user = await tx.user.findUnique({
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

    const available = await getAvailableSharesForProposal(project.id, tx);
    if (input.shareCountRequested > available) {
      throw new ValidationError(
        "shareCountRequested",
        `Solo hay ${available} acciones disponibles en este proyecto.`
      );
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + LEAD_EXPIRATION_DAYS);

    const lead = await tx.lead.create({
      data: {
        projectId: project.id,
        participationId: null,
        userId: input.userId,
        message: input.message.trim(), // puede ser ""
        shareCountRequested: input.shareCountRequested,
        supportKind: input.supportKind ?? null,
        status: "OPEN",
        expiresAt,
      },
    });

    await recordAudit(tx, {
      actorId: input.userId,
      projectId: project.id,
      action: "PARTICIPATION.LEAD_CREATED",
      entityType: "Lead",
      entityId: lead.id,
      payload: {
        shareCountRequested: input.shareCountRequested,
        kind: "INTEREST_PROJECT_LEVEL",
        supportKind: input.supportKind ?? null,
      },
    });

    return lead;
  });
}
