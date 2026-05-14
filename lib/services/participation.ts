import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { computeBlockHash } from "@/lib/crypto/ownership-chain";
import { LEAD_EXPIRATION_DAYS, PLATFORM_USER_EMAIL } from "@/lib/constants/platform";
import {
  ForbiddenError,
  IllegalTransition,
  InvariantViolation,
  NotFoundError,
  ValidationError,
} from "./errors";
import { canTransition } from "@/lib/state-machine/participation";

type Tx = Prisma.TransactionClient;

/**
 * Carga una participación por ID con bloqueo optimista lógico.
 * Lanza NotFoundError si no existe.
 */
async function loadParticipation(tx: Tx, participationId: string) {
  const p = await tx.participation.findUnique({ where: { id: participationId } });
  if (!p) throw new NotFoundError("Participation", participationId);
  return p;
}

async function getPlatformUserId(tx: Tx): Promise<string> {
  const user = await tx.user.findUnique({ where: { email: PLATFORM_USER_EMAIL } });
  if (!user) {
    throw new InvariantViolation(
      "P_00_PLATFORM_USER_MISSING",
      `Usuario institucional ${PLATFORM_USER_EMAIL} no existe en el sistema.`
    );
  }
  return user.id;
}

async function assertAdmin(tx: Tx, userId: string): Promise<void> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!u || !u.isActive || u.role !== "ADMIN") {
    throw new ForbiddenError("Solo un ADMIN activo puede ejecutar esta acción.");
  }
}

async function assertActiveUser(tx: Tx, userId: string, label = "usuario"): Promise<void> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true, role: true, deletedAt: true } });
  if (!u || !u.isActive || u.deletedAt) {
    throw new ValidationError(label, `El ${label} no está activo.`);
  }
}

/**
 * Resuelve el último blockHash del historial de una participación (o de la cadena
 * global si quisiéramos hacerla global; aquí la mantenemos por-participation
 * para simplificar la verificación local).
 */
async function getPrevHash(tx: Tx, participationId: string): Promise<string | null> {
  const last = await tx.ownershipHistory.findFirst({
    where: { participationId },
    orderBy: { validatedAt: "desc" },
    select: { blockHash: true },
  });
  return last?.blockHash ?? null;
}

async function appendOwnershipBlock(
  tx: Tx,
  args: {
    participationId: string;
    fromUserId: string | null;
    toUserId: string;
    authorizedById: string;
    coAuthorizedById: string | null;
    reason: string;
    resaleListingId: string | null;
    effectiveAt: Date;
  }
): Promise<{ blockHash: string }> {
  const prevHash = await getPrevHash(tx, args.participationId);
  const payload = {
    participationId: args.participationId,
    fromUserId: args.fromUserId,
    toUserId: args.toUserId,
    authorizedById: args.authorizedById,
    coAuthorizedById: args.coAuthorizedById,
    reason: args.reason,
    resaleListingId: args.resaleListingId,
    effectiveAt: args.effectiveAt.toISOString(),
  };
  const blockHash = computeBlockHash(payload, prevHash);

  await tx.ownershipHistory.create({
    data: {
      participationId: args.participationId,
      fromUserId: args.fromUserId,
      toUserId: args.toUserId,
      authorizedById: args.authorizedById,
      coAuthorizedById: args.coAuthorizedById,
      reason: args.reason,
      resaleListingId: args.resaleListingId,
      effectiveAt: args.effectiveAt,
      blockHash,
      prevHash,
    },
  });

  return { blockHash };
}

// ─── Eventos públicos del servicio ─────────────────────────────────

export type CreateLeadInput = {
  participationId: string;
  userId: string;             // PARTNER que manifiesta interés
  message: string;
  shareCountRequested?: number;
};

export async function createLead(input: CreateLeadInput) {
  return prisma.$transaction(async (tx) => {
    const participation = await loadParticipation(tx, input.participationId);
    if (!canTransition(participation.status, "LEAD_CREATED")) {
      throw new IllegalTransition(participation.status, "LEAD_CREATED");
    }

    // I-4: PLATFORM jamás puede ser destinatario de un Lead
    const platformUserId = await getPlatformUserId(tx);
    if (participation.currentOwnerId === platformUserId) {
      throw new InvariantViolation(
        "P_04_NO_LEAD_ON_PLATFORM",
        "No se puede manifestar interés sobre el stake institucional de AJDUT."
      );
    }

    // El usuario que manifiesta interés debe ser un PARTNER activo
    const partner = await tx.user.findUnique({
      where: { id: input.userId },
      select: { role: true, isActive: true, deletedAt: true },
    });
    if (!partner || !partner.isActive || partner.deletedAt || partner.role !== "PARTNER") {
      throw new ForbiddenError("Solo socios activos pueden manifestar interés.");
    }

    const requested = input.shareCountRequested ?? 1;
    if (requested < 1 || requested > participation.shareCount) {
      throw new ValidationError(
        "shareCountRequested",
        `Cantidad solicitada inválida: ${requested} (disponible: ${participation.shareCount}).`
      );
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + LEAD_EXPIRATION_DAYS);

    const lead = await tx.lead.create({
      data: {
        projectId: participation.projectId,
        participationId: participation.id,
        userId: input.userId,
        message: input.message,
        shareCountRequested: requested,
        status: "OPEN",
        expiresAt,
      },
    });

    await tx.participation.update({
      where: { id: participation.id },
      data: { status: "IN_NEGOTIATION" },
    });

    await recordAudit(tx, {
      actorId: input.userId,
      projectId: participation.projectId,
      action: "PARTICIPATION.LEAD_CREATED",
      entityType: "Participation",
      entityId: participation.id,
      payload: { leadId: lead.id, shareCountRequested: requested },
    });

    return lead;
  });
}

export type DismissLeadInput = {
  leadId: string;
  actorId: string; // PROJECT_OWNER o ADMIN
  reason?: string;
};

export async function dismissLead(input: DismissLeadInput) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: input.leadId } });
    if (!lead) throw new NotFoundError("Lead", input.leadId);
    if (lead.status !== "OPEN") {
      throw new IllegalTransition(lead.status, "LEAD_DISMISSED");
    }

    if (!lead.participationId) {
      throw new InvariantViolation("L_01_LEAD_WITHOUT_PARTICIPATION", "Lead sin participación asociada.");
    }
    const participation = await loadParticipation(tx, lead.participationId);
    if (!canTransition(participation.status, "LEAD_DISMISSED")) {
      throw new IllegalTransition(participation.status, "LEAD_DISMISSED");
    }

    // Solo el owner del proyecto o un admin pueden descartar
    const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { role: true } });
    const project = await tx.project.findUnique({ where: { id: lead.projectId }, select: { ownerId: true } });
    if (!actor || !project) throw new ForbiddenError("Actor o proyecto inválido.");
    if (actor.role !== "ADMIN" && project.ownerId !== input.actorId) {
      throw new ForbiddenError("Solo el founder o un admin pueden descartar un lead.");
    }

    await tx.lead.update({
      where: { id: lead.id },
      data: { status: "DISMISSED", resolvedAt: new Date() },
    });
    await tx.participation.update({
      where: { id: participation.id },
      data: { status: "AVAILABLE" },
    });

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: lead.projectId,
      action: "PARTICIPATION.LEAD_DISMISSED",
      entityType: "Lead",
      entityId: lead.id,
      payload: { reason: input.reason ?? null },
    });
  });
}

export type ValidateAssignmentInput = {
  participationId: string;
  toUserId: string;
  adminId: string;
  coAdminId?: string | null; // Requerido si la participación es stake institucional
  reason: string;
  effectiveAt?: Date;
};

export async function validateAssignment(input: ValidateAssignmentInput) {
  return prisma.$transaction(async (tx) => {
    await assertAdmin(tx, input.adminId);
    if (input.coAdminId) {
      if (input.coAdminId === input.adminId) {
        throw new InvariantViolation("P_02_SAME_ADMIN_COSIGN", "El co-firmante no puede ser el mismo admin.");
      }
      await assertAdmin(tx, input.coAdminId);
    }

    const participation = await loadParticipation(tx, input.participationId);
    if (!canTransition(participation.status, "ASSIGNMENT_VALIDATED")) {
      throw new IllegalTransition(participation.status, "ASSIGNMENT_VALIDATED");
    }

    // Stake institucional requiere co-firma
    if (participation.isPlatformStake && !input.coAdminId) {
      throw new InvariantViolation(
        "P_02_COSIGN_REQUIRED",
        "La participación es stake institucional y exige co-firma de un segundo admin."
      );
    }

    await assertActiveUser(tx, input.toUserId, "destinatario");

    const effectiveAt = input.effectiveAt ?? new Date();

    await appendOwnershipBlock(tx, {
      participationId: participation.id,
      fromUserId: participation.currentOwnerId, // null en génesis o el anterior dueño
      toUserId: input.toUserId,
      authorizedById: input.adminId,
      coAuthorizedById: input.coAdminId ?? null,
      reason: input.reason,
      resaleListingId: null,
      effectiveAt,
    });

    await tx.participation.update({
      where: { id: participation.id },
      data: { status: "ASSIGNED", currentOwnerId: input.toUserId, acquiredAt: effectiveAt },
    });

    // Cerrar el Lead si existe uno OPEN
    await tx.lead.updateMany({
      where: { participationId: participation.id, status: "OPEN" },
      data: { status: "CONVERTED", resolvedAt: new Date() },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: participation.projectId,
      action: "PARTICIPATION.ASSIGNED",
      entityType: "Participation",
      entityId: participation.id,
      payload: { toUserId: input.toUserId, coAdminId: input.coAdminId ?? null, reason: input.reason },
    });
  });
}

export type ListResaleInput = {
  participationId: string;
  sellerId: string;            // currentOwner
  intentNote: string;
  contactChannel: string;
};

export async function listForResale(input: ListResaleInput) {
  return prisma.$transaction(async (tx) => {
    const participation = await loadParticipation(tx, input.participationId);

    // I-1: Stake institucional no puede reventarse por marketplace
    if (participation.isPlatformStake) {
      throw new InvariantViolation(
        "P_01_PLATFORM_NO_RESALE",
        "El stake institucional de AJDUT no puede listarse en el tablón de reventa."
      );
    }

    if (!canTransition(participation.status, "RESALE_LISTED")) {
      throw new IllegalTransition(participation.status, "RESALE_LISTED");
    }
    if (participation.currentOwnerId !== input.sellerId) {
      throw new ForbiddenError("Solo el titular actual puede listar la participación.");
    }

    if (input.intentNote.trim().length < 10) {
      throw new ValidationError("intentNote", "La nota de intención debe tener al menos 10 caracteres.");
    }

    const listing = await tx.resaleListing.create({
      data: {
        participationId: participation.id,
        projectId: participation.projectId,
        sellerId: input.sellerId,
        intentNote: input.intentNote,
        contactChannel: input.contactChannel,
        status: "LISTED",
      },
    });
    await tx.participation.update({
      where: { id: participation.id },
      data: { status: "IN_RESALE" },
    });

    await recordAudit(tx, {
      actorId: input.sellerId,
      projectId: participation.projectId,
      action: "PARTICIPATION.RESALE_LISTED",
      entityType: "ResaleListing",
      entityId: listing.id,
      payload: { participationId: participation.id },
    });

    return listing;
  });
}

export type CancelResaleInput = {
  resaleListingId: string;
  actorId: string; // currentOwner o admin
  reason?: string;
};

export async function cancelResale(input: CancelResaleInput) {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.resaleListing.findUnique({ where: { id: input.resaleListingId } });
    if (!listing) throw new NotFoundError("ResaleListing", input.resaleListingId);
    if (!["LISTED", "IN_CONVERSATION"].includes(listing.status)) {
      throw new IllegalTransition(listing.status, "RESALE_CANCELLED");
    }

    const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { role: true } });
    if (!actor) throw new ForbiddenError("Actor inválido.");
    if (actor.role !== "ADMIN" && listing.sellerId !== input.actorId) {
      throw new ForbiddenError("Solo el vendedor o un admin pueden cancelar la reventa.");
    }

    await tx.resaleListing.update({
      where: { id: listing.id },
      data: { status: "CANCELLED", closedAt: new Date() },
    });
    await tx.participation.update({
      where: { id: listing.participationId },
      data: { status: "ASSIGNED" },
    });

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: listing.projectId,
      action: "PARTICIPATION.RESALE_CANCELLED",
      entityType: "ResaleListing",
      entityId: listing.id,
      payload: { reason: input.reason ?? null },
    });
  });
}

export type CloseResaleDealInput = {
  resaleListingId: string;
  sellerId: string;
  proposedBuyerId: string;
  sellerSignedAt: Date;
  buyerSignedAt: Date;
  rofrWaivedById: string;     // PROJECT_OWNER (founder) que renuncia explícitamente
  rofrWaiverNote?: string;
};

export async function closeResaleDeal(input: CloseResaleDealInput) {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.resaleListing.findUnique({ where: { id: input.resaleListingId } });
    if (!listing) throw new NotFoundError("ResaleListing", input.resaleListingId);
    if (listing.status !== "LISTED" && listing.status !== "IN_CONVERSATION") {
      throw new IllegalTransition(listing.status, "RESALE_DEAL_CLOSED");
    }
    if (listing.sellerId !== input.sellerId) {
      throw new ForbiddenError("Solo el vendedor puede cerrar el trato.");
    }

    // El comprador propuesto debe existir, ser activo y NO ser el mismo vendedor
    if (input.proposedBuyerId === input.sellerId) {
      throw new ValidationError("proposedBuyerId", "El comprador no puede ser el mismo vendedor.");
    }
    const buyer = await tx.user.findUnique({
      where: { id: input.proposedBuyerId },
      select: { isActive: true, role: true, deletedAt: true },
    });
    if (!buyer || !buyer.isActive || buyer.deletedAt) {
      throw new ValidationError("proposedBuyerId", "Comprador propuesto no existe o no está activo.");
    }
    // A3: cualquier usuario aprobado puede comprar; el role PARTNER no es requisito.
    if (buyer.role === "PLATFORM") {
      throw new ValidationError("proposedBuyerId", "El usuario institucional no puede comprar reventas.");
    }

    // Verificar ROFR: quien renuncia debe ser el founder del proyecto
    const project = await tx.project.findUnique({
      where: { id: listing.projectId },
      select: { ownerId: true },
    });
    if (!project) throw new NotFoundError("Project", listing.projectId);
    if (project.ownerId !== input.rofrWaivedById) {
      throw new ForbiddenError("Solo el founder del proyecto puede renunciar al ROFR.");
    }

    const participation = await loadParticipation(tx, listing.participationId);
    if (!canTransition(participation.status, "RESALE_DEAL_CLOSED")) {
      throw new IllegalTransition(participation.status, "RESALE_DEAL_CLOSED");
    }

    await tx.resaleListing.update({
      where: { id: listing.id },
      data: {
        status: "AWAITING_VALIDATION",
        proposedBuyerId: input.proposedBuyerId,
        sellerSignedAt: input.sellerSignedAt,
        buyerSignedAt: input.buyerSignedAt,
        rofrWaivedAt: new Date(),
        rofrWaivedById: input.rofrWaivedById,
        rofrWaiverNote: input.rofrWaiverNote ?? null,
      },
    });
    await tx.participation.update({
      where: { id: participation.id },
      data: { status: "TRANSFER_PENDING" },
    });

    await recordAudit(tx, {
      actorId: input.sellerId,
      projectId: listing.projectId,
      action: "PARTICIPATION.RESALE_DEAL_CLOSED",
      entityType: "ResaleListing",
      entityId: listing.id,
      payload: { proposedBuyerId: input.proposedBuyerId },
    });
  });
}

export type ValidateTransferInput = {
  resaleListingId: string;
  adminId: string;
  coAdminId?: string | null;
  reason: string;
  effectiveAt?: Date;
};

export async function validateTransfer(input: ValidateTransferInput) {
  return prisma.$transaction(async (tx) => {
    await assertAdmin(tx, input.adminId);
    const listing = await tx.resaleListing.findUnique({ where: { id: input.resaleListingId } });
    if (!listing) throw new NotFoundError("ResaleListing", input.resaleListingId);
    if (listing.status !== "AWAITING_VALIDATION") {
      throw new IllegalTransition(listing.status, "TRANSFER_VALIDATED");
    }
    if (!listing.proposedBuyerId) {
      throw new InvariantViolation(
        "R_01_NO_BUYER",
        "ResaleListing en AWAITING_VALIDATION sin comprador propuesto."
      );
    }
    if (!listing.sellerSignedAt || !listing.buyerSignedAt) {
      throw new InvariantViolation(
        "R_02_MISSING_SIGNATURE",
        "Faltan firmas electrónicas de comprador o vendedor."
      );
    }
    if (!listing.rofrWaivedAt) {
      throw new InvariantViolation(
        "R_03_ROFR_PENDING",
        "El founder no ha renunciado explícitamente al ROFR."
      );
    }

    const participation = await loadParticipation(tx, listing.participationId);
    if (!canTransition(participation.status, "TRANSFER_VALIDATED")) {
      throw new IllegalTransition(participation.status, "TRANSFER_VALIDATED");
    }

    // Stake institucional exige co-firma
    if (participation.isPlatformStake) {
      if (!input.coAdminId) {
        throw new InvariantViolation(
          "P_02_COSIGN_REQUIRED",
          "Transferencia de stake institucional requiere co-firma."
        );
      }
      if (input.coAdminId === input.adminId) {
        throw new InvariantViolation("P_02_SAME_ADMIN_COSIGN", "El co-firmante no puede ser el mismo admin.");
      }
      await assertAdmin(tx, input.coAdminId);
    }

    const effectiveAt = input.effectiveAt ?? new Date();

    await appendOwnershipBlock(tx, {
      participationId: participation.id,
      fromUserId: listing.sellerId,
      toUserId: listing.proposedBuyerId,
      authorizedById: input.adminId,
      coAuthorizedById: input.coAdminId ?? null,
      reason: input.reason,
      resaleListingId: listing.id,
      effectiveAt,
    });

    await tx.participation.update({
      where: { id: participation.id },
      data: {
        status: "ASSIGNED",
        currentOwnerId: listing.proposedBuyerId,
        acquiredAt: effectiveAt,
      },
    });

    await tx.resaleListing.update({
      where: { id: listing.id },
      data: { status: "COMPLETED", closedAt: new Date() },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: listing.projectId,
      action: "PARTICIPATION.TRANSFER_VALIDATED",
      entityType: "Participation",
      entityId: participation.id,
      payload: {
        resaleListingId: listing.id,
        fromUserId: listing.sellerId,
        toUserId: listing.proposedBuyerId,
        coAdminId: input.coAdminId ?? null,
      },
    });
  });
}

export type RejectTransferInput = {
  resaleListingId: string;
  adminId: string;
  note: string;
};

export async function rejectTransfer(input: RejectTransferInput) {
  return prisma.$transaction(async (tx) => {
    await assertAdmin(tx, input.adminId);
    const listing = await tx.resaleListing.findUnique({ where: { id: input.resaleListingId } });
    if (!listing) throw new NotFoundError("ResaleListing", input.resaleListingId);
    if (listing.status !== "AWAITING_VALIDATION") {
      throw new IllegalTransition(listing.status, "TRANSFER_REJECTED");
    }

    const participation = await loadParticipation(tx, listing.participationId);
    if (!canTransition(participation.status, "TRANSFER_REJECTED")) {
      throw new IllegalTransition(participation.status, "TRANSFER_REJECTED");
    }

    await tx.resaleListing.update({
      where: { id: listing.id },
      data: { status: "IN_CONVERSATION" }, // vuelve al tablón
    });
    await tx.participation.update({
      where: { id: participation.id },
      data: { status: "IN_RESALE" },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: listing.projectId,
      action: "PARTICIPATION.TRANSFER_REJECTED",
      entityType: "ResaleListing",
      entityId: listing.id,
      payload: { note: input.note },
    });
  });
}
