import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";

export type CreateInfoRequestInput = {
  projectId: string;
  requesterId: string;
  message?: string;
};

/**
 * Crea (o reusa) una InfoRequest del usuario sobre un proyecto.
 *
 * Si ya existe una InfoRequest del mismo requester:
 *  - PENDING / APPROVED → devolvemos la existente (idempotente).
 *  - REJECTED → la reseteamos a PENDING con el nuevo mensaje (el usuario
 *    puede insistir; el founder vuelve a decidir).
 */
export async function createInfoRequest(input: CreateInfoRequestInput) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, status: true, ownerId: true },
  });
  if (!project) throw new NotFoundError("Project", input.projectId);
  if (project.status !== "ACTIVE") {
    throw new ValidationError(
      "projectId",
      "Solo se puede pedir información de proyectos activos."
    );
  }
  if (project.ownerId === input.requesterId) {
    throw new ForbiddenError("No podés pedir información de tu propio proyecto.");
  }

  const requester = await prisma.user.findUnique({
    where: { id: input.requesterId },
    select: { role: true, isActive: true, deletedAt: true },
  });
  if (!requester || !requester.isActive || requester.deletedAt) {
    throw new ForbiddenError("Sesión inválida.");
  }
  if (requester.role === "PLATFORM") {
    throw new ForbiddenError("El usuario institucional no participa.");
  }

  const message = (input.message ?? "").trim();
  if (message.length > 2000) {
    throw new ValidationError("message", "El mensaje no puede superar los 2000 caracteres.");
  }

  // Existente: idempotencia
  const existing = await prisma.infoRequest.findUnique({
    where: {
      projectId_requesterId: {
        projectId: project.id,
        requesterId: input.requesterId,
      },
    },
  });

  if (existing) {
    if (existing.status === "REJECTED") {
      // Permitimos re-pedir tras rechazo: reseteamos a PENDING.
      const updated = await prisma.infoRequest.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          message: message || null,
          reviewedAt: null,
          reviewedById: null,
          reviewNote: null,
        },
      });
      await recordAudit(prisma, {
        actorId: input.requesterId,
        projectId: project.id,
        action: "INFO_REQUEST.CREATED",
        entityType: "InfoRequest",
        entityId: updated.id,
        payload: { resetFromRejected: true },
      });
      return updated;
    }
    // PENDING o APPROVED ya existe — no creamos otro.
    return existing;
  }

  const created = await prisma.infoRequest.create({
    data: {
      projectId: project.id,
      requesterId: input.requesterId,
      message: message || null,
    },
  });

  await recordAudit(prisma, {
    actorId: input.requesterId,
    projectId: project.id,
    action: "INFO_REQUEST.CREATED",
    entityType: "InfoRequest",
    entityId: created.id,
    payload: {},
  });

  return created;
}

export async function approveInfoRequest(id: string, reviewerId: string, note?: string) {
  return reviewInfoRequest(id, reviewerId, "APPROVED", note);
}

export async function rejectInfoRequest(id: string, reviewerId: string, note?: string) {
  return reviewInfoRequest(id, reviewerId, "REJECTED", note);
}

async function reviewInfoRequest(
  id: string,
  reviewerId: string,
  decision: "APPROVED" | "REJECTED",
  note?: string
) {
  const req = await prisma.infoRequest.findUnique({
    where: { id },
    include: { project: { select: { ownerId: true } } },
  });
  if (!req) throw new NotFoundError("InfoRequest", id);
  // Solo el owner del proyecto puede aprobar/rechazar.
  if (req.project.ownerId !== reviewerId) {
    throw new ForbiddenError(
      "Solo el project owner del proyecto puede aprobar o rechazar solicitudes de información."
    );
  }
  if (req.status !== "PENDING") {
    throw new ValidationError(
      "status",
      `Esta solicitud ya está ${req.status === "APPROVED" ? "aprobada" : "rechazada"}.`
    );
  }

  const trimmed = (note ?? "").trim();
  if (trimmed.length > 2000) {
    throw new ValidationError("note", "La nota no puede superar los 2000 caracteres.");
  }

  const updated = await prisma.infoRequest.update({
    where: { id: req.id },
    data: {
      status: decision,
      reviewedAt: new Date(),
      reviewedById: reviewerId,
      reviewNote: trimmed || null,
    },
  });

  await recordAudit(prisma, {
    actorId: reviewerId,
    projectId: req.projectId,
    action: decision === "APPROVED" ? "INFO_REQUEST.APPROVED" : "INFO_REQUEST.REJECTED",
    entityType: "InfoRequest",
    entityId: req.id,
    payload: {},
  });

  return updated;
}

export async function getInfoRequest(projectId: string, requesterId: string) {
  return prisma.infoRequest.findUnique({
    where: {
      projectId_requesterId: { projectId, requesterId },
    },
  });
}
