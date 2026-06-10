import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { computeBlockHash } from "@/lib/crypto/ownership-chain";
import {
  ForbiddenError,
  IllegalTransition,
  InvariantViolation,
  NotFoundError,
  ValidationError,
} from "./errors";
import { canTransition } from "@/lib/state-machine/participation";

/**
 * Estado del módulo:
 * - Las funciones de manifestación de interés / asignación se movieron a
 *   `interest.ts` y `share-assignment.ts` (lead a nivel proyecto, flujo
 *   simplificado).
 * - Acá queda el flujo de REVENTAS (listForResale → validateTransfer) que
 *   está pausado a nivel UI. Si se revive, ya está la maquinaria.
 */

type Tx = Prisma.TransactionClient;

// ─── Validación tripartita: helpers de token del comprador ──────────
//
// El comprador propuesto recibe un link `/confirmar-reventa/<plainToken>` por
// mail (y banner in-app). La DB sólo guarda el SHA-256 del token. TTL: 30 días.
// Mismo patrón que `pending-assignment.ts` (target confirmation token).

const BUYER_CONFIRMATION_TOKEN_BYTES = 32;
const BUYER_CONFIRMATION_TTL_DAYS = 30;

function hashBuyerConfirmationToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

function newBuyerConfirmationToken(): {
  plain: string;
  hash: string;
  expiresAt: Date;
} {
  const plain = randomBytes(BUYER_CONFIRMATION_TOKEN_BYTES).toString("base64url");
  const hash = hashBuyerConfirmationToken(plain);
  const expiresAt = new Date(
    Date.now() + BUYER_CONFIRMATION_TTL_DAYS * 24 * 60 * 60 * 1000
  );
  return { plain, hash, expiresAt };
}

async function loadParticipation(tx: Tx, participationId: string) {
  const p = await tx.participation.findUnique({ where: { id: participationId } });
  if (!p) throw new NotFoundError("Participation", participationId);
  return p;
}

async function assertAdmin(tx: Tx, userId: string): Promise<void> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!u || !u.isActive || u.role !== "ADMIN") {
    throw new ForbiddenError("Solo un ADMIN activo puede ejecutar esta acción.");
  }
}

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

// ─── REVENTAS ──────────────────────────────────────────────────────
// Soporte para reventa PARCIAL: el seller puede listar una porción de su
// participación a cierto precio/participación. Si listing.shareCount ==
// participation.shareCount y no hay otros listings activos → flip a
// IN_RESALE. Si es parcial, la participación queda en ASSIGNED y pueden
// coexistir múltiples listings sobre ella siempre que la suma de
// shareCount activo <= participation.shareCount.

const ACTIVE_LISTING_STATUSES: Array<"LISTED" | "AWAITING_VALIDATION" | "IN_CONVERSATION"> = [
  "LISTED",
  "IN_CONVERSATION",
  "AWAITING_VALIDATION",
];

export type ListResaleInput = {
  participationId: string;
  sellerId: string;            // currentOwner
  intentNote: string;
  contactChannel: string;
  shareCount: number;
  proposedPricePerShare: number | string | Prisma.Decimal;
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

    if (participation.currentOwnerId !== input.sellerId) {
      throw new ForbiddenError("Solo el titular actual puede listar la participación.");
    }

    // Gate de fecha: el project owner puede definir una fecha a partir de la
    // cual se habilita la reventa. Antes de esa fecha, ningún listing es válido.
    const project = await tx.project.findUnique({
      where: { id: participation.projectId },
      select: { name: true, resaleAllowedFrom: true },
    });
    if (project?.resaleAllowedFrom) {
      const now = new Date();
      if (now < project.resaleAllowedFrom) {
        const fecha = new Intl.DateTimeFormat("es-MX", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(project.resaleAllowedFrom);
        throw new ValidationError(
          "resaleAllowedFrom",
          `La reventa de participaciones de este proyecto está habilitada a partir del ${fecha}.`
        );
      }
    }

    // Sólo se admite listar si la participación está en ASSIGNED (full o parcial
    // con stock disponible) o en IN_RESALE (parcial — ya tiene listings activos
    // pero aún quedan participaciones libres). El state-machine canónico cubre
    // ASSIGNED→RESALE_LISTED; la coexistencia parcial se valida acá.
    if (participation.status !== "ASSIGNED" && participation.status !== "IN_RESALE") {
      throw new IllegalTransition(participation.status, "RESALE_LISTED");
    }

    if (input.intentNote.trim().length < 10) {
      throw new ValidationError("intentNote", "La nota de intención debe tener al menos 10 caracteres.");
    }

    if (!Number.isInteger(input.shareCount) || input.shareCount < 1) {
      throw new ValidationError("shareCount", "La cantidad debe ser un entero positivo.");
    }

    const pricePerShare =
      input.proposedPricePerShare instanceof Prisma.Decimal
        ? input.proposedPricePerShare
        : new Prisma.Decimal(input.proposedPricePerShare);
    if (pricePerShare.lte(0)) {
      throw new ValidationError("proposedPricePerShare", "El precio por participación debe ser mayor a cero.");
    }

    // Suma de shareCount de listings activos sobre esta participación. Para
    // listings legacy con shareCount=null asumimos que ocupan la totalidad
    // (eran transferencias totales pre-overhaul).
    const activeListings = await tx.resaleListing.findMany({
      where: {
        participationId: participation.id,
        status: { in: ACTIVE_LISTING_STATUSES },
      },
      select: { shareCount: true },
    });
    const activeSum = activeListings.reduce(
      (acc, l) => acc + (l.shareCount ?? participation.shareCount),
      0
    );
    const available = participation.shareCount - activeSum;
    if (input.shareCount > available) {
      throw new ValidationError(
        "shareCount",
        `Solo hay ${available} participaciones disponibles para revender.`
      );
    }

    const listing = await tx.resaleListing.create({
      data: {
        participationId: participation.id,
        projectId: participation.projectId,
        sellerId: input.sellerId,
        intentNote: input.intentNote,
        contactChannel: input.contactChannel,
        status: "LISTED",
        shareCount: input.shareCount,
        proposedPricePerShare: pricePerShare,
      },
    });

    // Flip a IN_RESALE solo cuando es una venta total (todo el stock libre se
    // listó). Caso parcial → permanece ASSIGNED para que el seller pueda
    // seguir disfrutando del resto (dividendos, voto, etc.).
    const isFullListing =
      input.shareCount === participation.shareCount && activeListings.length === 0;
    if (isFullListing) {
      await tx.participation.update({
        where: { id: participation.id },
        data: { status: "IN_RESALE" },
      });
    }

    await recordAudit(tx, {
      actorId: input.sellerId,
      projectId: participation.projectId,
      action: "PARTICIPATION.RESALE_LISTED",
      entityType: "ResaleListing",
      entityId: listing.id,
      payload: {
        participationId: participation.id,
        shareCount: input.shareCount,
        pricePerShare: pricePerShare.toString(),
      },
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
    // El vendedor puede cancelar mientras la reventa siga abierta: publicada
    // (LISTED), en conversación (IN_CONVERSATION) o incluso ya con comprador
    // designado esperando validación (AWAITING_VALIDATION) — hasta que el admin
    // ejecute el traspaso, el vendedor puede echarse atrás.
    if (!ACTIVE_LISTING_STATUSES.includes(listing.status as (typeof ACTIVE_LISTING_STATUSES)[number])) {
      throw new IllegalTransition(listing.status, "RESALE_CANCELLED");
    }

    const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { role: true } });
    if (!actor) throw new ForbiddenError("Actor inválido.");
    if (actor.role !== "ADMIN" && listing.sellerId !== input.actorId) {
      throw new ForbiddenError("Solo el vendedor o un admin pueden cancelar la reventa.");
    }

    await tx.resaleListing.update({
      where: { id: listing.id },
      data: {
        status: "CANCELLED",
        closedAt: new Date(),
        // Si se canceló estando en AWAITING_VALIDATION, limpiamos al comprador
        // designado y todo el estado de la validación tripartita para que el
        // listing quede cerrado sin residuos.
        proposedBuyerId: null,
        buyerAcceptedAt: null,
        ownerAcceptedAt: null,
        buyerConfirmationTokenHash: null,
        buyerConfirmationTokenExpiresAt: null,
      },
    });

    // Solo revertimos el status de la participación a ASSIGNED si NO quedan
    // otros listings activos sobre ella. En el modelo de reventa parcial
    // pueden coexistir múltiples listings sobre una misma participation.
    const otherActive = await tx.resaleListing.count({
      where: {
        participationId: listing.participationId,
        status: { in: ACTIVE_LISTING_STATUSES },
        id: { not: listing.id },
      },
    });
    if (otherActive === 0) {
      const participation = await tx.participation.findUnique({
        where: { id: listing.participationId },
        select: { status: true },
      });
      // IN_RESALE (publicada) o TRANSFER_PENDING (ya con comprador designado)
      // vuelven a ASSIGNED al cancelar.
      if (
        participation &&
        (participation.status === "IN_RESALE" ||
          participation.status === "TRANSFER_PENDING")
      ) {
        await tx.participation.update({
          where: { id: listing.participationId },
          data: { status: "ASSIGNED" },
        });
      }
    }

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
  /**
   * Firmas electrónicas y waiver de ROFR son OPCIONALES. El flujo vigente es
   * simplificado: el vendedor designa al comprador y el ADMIN aprueba el
   * traspaso. Los campos quedan disponibles por si se reactiva el flujo legal
   * completo (doble firma + renuncia explícita del founder al ROFR).
   */
  sellerSignedAt?: Date | null;
  buyerSignedAt?: Date | null;
  rofrWaivedById?: string | null;
  rofrWaiverNote?: string | null;
};

export type CloseResaleDealResult = {
  resaleListingId: string;
  proposedBuyerId: string;
  shareCount: number;
  projectId: string;
  projectSlug: string;
  projectName: string;
  ownerId: string;
  sellerName: string;
  buyerEmail: string;
  buyerFullName: string;
  /**
   * Token plano (base64url) que viaja en el link `/confirmar-reventa/<token>`
   * al comprador. La DB sólo guarda el hash; nunca debe loggearse.
   */
  buyerConfirmationToken: string;
  buyerConfirmationExpiresAt: Date;
  pricePerShare: string | null;
};

/**
 * @deprecated Flujo viejo "seller-designa-comprador". Reemplazado por
 * `acquireResale` (first-to-acquire, compra iniciada por el comprador). Se
 * mantiene para no romper imports ni la página `/confirmar-reventa`, pero la UI
 * ya no la invoca.
 */
export async function closeResaleDeal(
  input: CloseResaleDealInput
): Promise<CloseResaleDealResult> {
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
      select: { isActive: true, role: true, deletedAt: true, email: true, fullName: true },
    });
    if (!buyer || !buyer.isActive || buyer.deletedAt) {
      throw new ValidationError("proposedBuyerId", "Comprador propuesto no existe o no está activo.");
    }
    // A3: cualquier usuario aprobado puede comprar; el role PARTNER no es requisito.
    if (buyer.role === "PLATFORM") {
      throw new ValidationError("proposedBuyerId", "El usuario institucional no puede comprar reventas.");
    }

    // ROFR: si se declara un waiver explícito, quien renuncia debe ser el
    // founder del proyecto. En el flujo simplificado no hay waiver.
    if (input.rofrWaivedById) {
      const project = await tx.project.findUnique({
        where: { id: listing.projectId },
        select: { ownerId: true },
      });
      if (!project) throw new NotFoundError("Project", listing.projectId);
      if (project.ownerId !== input.rofrWaivedById) {
        throw new ForbiddenError("Solo el founder del proyecto puede renunciar al ROFR.");
      }
    }

    const participation = await loadParticipation(tx, listing.participationId);
    // Para listings parciales, la participación queda en ASSIGNED (puede
    // tener otros listings activos en paralelo). Solo flippeamos a
    // TRANSFER_PENDING cuando el listing cubre la totalidad del stock
    // (legacy null → equivale al total).
    const listingShareCount = listing.shareCount ?? participation.shareCount;
    const isFullTransfer = listingShareCount === participation.shareCount;
    if (isFullTransfer && !canTransition(participation.status, "RESALE_DEAL_CLOSED")) {
      throw new IllegalTransition(participation.status, "RESALE_DEAL_CLOSED");
    }

    // Validación tripartita: al designar comprador, generamos el token de
    // confirmación del comprador y reseteamos ambas aceptaciones (por si el
    // listing había pasado por un ciclo previo de rechazo/re-designación). El
    // admin no podrá ejecutar validateTransfer hasta que buyer y owner aprueben.
    const tokenInfo = newBuyerConfirmationToken();

    await tx.resaleListing.update({
      where: { id: listing.id },
      data: {
        status: "AWAITING_VALIDATION",
        proposedBuyerId: input.proposedBuyerId,
        sellerSignedAt: input.sellerSignedAt ?? null,
        buyerSignedAt: input.buyerSignedAt ?? null,
        rofrWaivedAt: input.rofrWaivedById ? new Date() : null,
        rofrWaivedById: input.rofrWaivedById ?? null,
        rofrWaiverNote: input.rofrWaiverNote ?? null,
        // Reset de la validación tripartita para este nuevo comprador.
        buyerAcceptedAt: null,
        ownerAcceptedAt: null,
        buyerConfirmationTokenHash: tokenInfo.hash,
        buyerConfirmationTokenExpiresAt: tokenInfo.expiresAt,
      },
    });
    if (isFullTransfer) {
      await tx.participation.update({
        where: { id: participation.id },
        data: { status: "TRANSFER_PENDING" },
      });
    }

    await recordAudit(tx, {
      actorId: input.sellerId,
      projectId: listing.projectId,
      action: "PARTICIPATION.RESALE_DEAL_CLOSED",
      entityType: "ResaleListing",
      entityId: listing.id,
      payload: {
        proposedBuyerId: input.proposedBuyerId,
        shareCount: listingShareCount,
        partial: !isFullTransfer,
      },
    });

    // Datos para el email del comprador + notificación in-app al founder.
    const [project, seller] = await Promise.all([
      tx.project.findUnique({
        where: { id: listing.projectId },
        select: { name: true, slug: true, ownerId: true },
      }),
      tx.user.findUnique({
        where: { id: input.sellerId },
        select: { fullName: true, alias: true },
      }),
    ]);
    if (!project) throw new NotFoundError("Project", listing.projectId);
    const sellerName = seller?.alias ?? seller?.fullName ?? "Un miembro";

    // Notification in-app al founder: hay una reventa esperando su validación.
    await tx.notification.create({
      data: {
        userId: project.ownerId,
        kind: "RESALE_OWNER_CONFIRM",
        payload: {
          resaleListingId: listing.id,
          projectName: project.name,
          projectSlug: project.slug,
          sellerName,
          buyerName: buyer.fullName,
          shareCount: listingShareCount,
          reventaUrl: `/proyectos/${project.slug}/reventa`,
        },
      },
    });

    // Notification in-app al comprador propuesto: confirmá tu compra.
    await tx.notification.create({
      data: {
        userId: input.proposedBuyerId,
        kind: "RESALE_BUYER_CONFIRM",
        payload: {
          resaleListingId: listing.id,
          projectName: project.name,
          projectSlug: project.slug,
          sellerName,
          shareCount: listingShareCount,
          confirmUrl: `/confirmar-reventa/${tokenInfo.plain}`,
        },
      },
    });

    return {
      resaleListingId: listing.id,
      proposedBuyerId: input.proposedBuyerId,
      shareCount: listingShareCount,
      projectId: listing.projectId,
      projectSlug: project.slug,
      projectName: project.name,
      ownerId: project.ownerId,
      sellerName,
      buyerEmail: buyer.email,
      buyerFullName: buyer.fullName,
      buyerConfirmationToken: tokenInfo.plain,
      buyerConfirmationExpiresAt: tokenInfo.expiresAt,
      pricePerShare: listing.proposedPricePerShare
        ? listing.proposedPricePerShare.toString()
        : null,
    };
  });
}

// ─── REVENTA: compra iniciada por el comprador (first-to-acquire) ────
//
// Modelo vigente: el vendedor sólo publica (cantidad + precio) y NO elige al
// comprador. Cualquier socio aprobado adquiere la publicación desde el tablón;
// el primero en adquirirla la reserva → pasa a AWAITING_VALIDATION (founder
// valida + admin ejecuta). Como el comprador inicia la compra logueado, su
// `buyerAcceptedAt` se setea acá mismo: no hace falta token ni email de
// confirmación (a diferencia de `closeResaleDeal`).

export type AcquireResaleInput = { resaleListingId: string; buyerId: string };

export type AcquireResaleResult = {
  ownerId: string;
  projectName: string;
  projectSlug: string;
  sellerName: string;
  buyerName: string;
  shareCount: number;
};

export async function acquireResale(
  input: AcquireResaleInput
): Promise<AcquireResaleResult> {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.resaleListing.findUnique({
      where: { id: input.resaleListingId },
    });
    if (!listing) throw new NotFoundError("ResaleListing", input.resaleListingId);

    // First-to-acquire: sólo se puede adquirir una publicación libre. Si ya
    // está AWAITING_VALIDATION/IN_CONVERSATION significa que otro socio la
    // reservó primero.
    if (listing.status !== "LISTED") {
      throw new IllegalTransition(listing.status, "RESALE_ACQUIRED");
    }

    // El comprador no puede ser el vendedor.
    if (listing.sellerId === input.buyerId) {
      throw new ForbiddenError("No podés adquirir tu propia participación.");
    }

    // El comprador debe existir, ser activo, no estar borrado y no ser el
    // usuario institucional (PLATFORM). Cualquier socio aprobado puede comprar.
    const buyer = await tx.user.findUnique({
      where: { id: input.buyerId },
      select: { isActive: true, role: true, deletedAt: true, fullName: true, alias: true },
    });
    if (!buyer || !buyer.isActive || buyer.deletedAt || buyer.role === "PLATFORM") {
      throw new ForbiddenError("Comprador inválido o no autorizado.");
    }

    const participation = await loadParticipation(tx, listing.participationId);
    const listingShareCount = listing.shareCount ?? participation.shareCount;
    const isFullTransfer = listingShareCount === participation.shareCount;
    if (isFullTransfer && !canTransition(participation.status, "RESALE_DEAL_CLOSED")) {
      throw new IllegalTransition(participation.status, "RESALE_DEAL_CLOSED");
    }

    const now = new Date();

    await tx.resaleListing.update({
      where: { id: listing.id },
      data: {
        status: "AWAITING_VALIDATION",
        proposedBuyerId: input.buyerId,
        // El comprador inició la compra logueado: ESA es su confirmación. No
        // hay token ni email del lado del comprador.
        buyerAcceptedAt: now,
        buyerSignedAt: now,
        ownerAcceptedAt: null,
        buyerConfirmationTokenHash: null,
        buyerConfirmationTokenExpiresAt: null,
      },
    });
    if (isFullTransfer) {
      await tx.participation.update({
        where: { id: participation.id },
        data: { status: "TRANSFER_PENDING" },
      });
    }

    await recordAudit(tx, {
      actorId: input.buyerId,
      projectId: listing.projectId,
      action: "PARTICIPATION.RESALE_ACQUIRED",
      entityType: "ResaleListing",
      entityId: listing.id,
      payload: { buyerId: input.buyerId, shareCount: listingShareCount },
    });

    // El founder necesita aviso de que hay una reventa para validar.
    const [project, seller] = await Promise.all([
      tx.project.findUnique({
        where: { id: listing.projectId },
        select: { name: true, slug: true, ownerId: true },
      }),
      tx.user.findUnique({
        where: { id: listing.sellerId },
        select: { fullName: true, alias: true },
      }),
    ]);
    if (!project) throw new NotFoundError("Project", listing.projectId);
    const sellerName = seller?.alias ?? seller?.fullName ?? "Un miembro";
    const buyerName = buyer.alias ?? buyer.fullName;

    // Notification in-app al founder: hay una reventa esperando su validación.
    await tx.notification.create({
      data: {
        userId: project.ownerId,
        kind: "RESALE_OWNER_CONFIRM",
        payload: {
          resaleListingId: listing.id,
          projectName: project.name,
          projectSlug: project.slug,
          sellerName,
          buyerName,
          shareCount: listingShareCount,
          reventaUrl: `/proyectos/${project.slug}/reventa`,
        },
      },
    });

    return {
      ownerId: project.ownerId,
      projectName: project.name,
      projectSlug: project.slug,
      sellerName,
      buyerName,
      shareCount: listingShareCount,
    };
  });
}

export type ValidateTransferInput = {
  resaleListingId: string;
  adminId: string;
  coAdminId?: string | null;
  reason: string;
  effectiveAt?: Date;
  /**
   * Si true, el admin override la validación tripartita: ejecuta el traspaso
   * aunque el comprador o el founder no hayan confirmado por la plataforma.
   * Queda auditado como `RESALE.ADMIN_OVERRIDE`. Default: false.
   */
  override?: boolean;
  /** Nota obligatoria (>= 10 chars) si `override = true`. */
  overrideNote?: string;
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

    // Validación TRIPARTITA: el comprador propuesto y el project owner (founder)
    // deben haber aprobado antes de que el admin ejecute el traspaso. Esto le da
    // al founder control sobre quién entra como socio. El override existe para
    // casos excepcionales (confirmación por fuera de la plataforma) y queda
    // auditado con nota obligatoria. Mismo patrón que pending-assignment.
    const buyerConfirmed = listing.buyerAcceptedAt !== null;
    const ownerConfirmed = listing.ownerAcceptedAt !== null;
    if (!buyerConfirmed || !ownerConfirmed) {
      if (!input.override) {
        throw new InvariantViolation(
          "R_04_TRIPARTITE_PENDING",
          !buyerConfirmed && !ownerConfirmed
            ? "El comprador y el founder todavía no validaron la reventa."
            : !buyerConfirmed
            ? "El comprador todavía no confirmó la reventa."
            : "El founder todavía no validó la reventa."
        );
      }
      const note = (input.overrideNote ?? "").trim();
      if (note.length < 10) {
        throw new ValidationError(
          "overrideNote",
          "Para hacer override la nota debe tener al menos 10 caracteres."
        );
      }
      await recordAudit(tx, {
        actorId: input.adminId,
        projectId: listing.projectId,
        action: "RESALE.ADMIN_OVERRIDE",
        entityType: "ResaleListing",
        entityId: listing.id,
        payload: {
          buyerConfirmed,
          ownerConfirmed,
          note,
        },
      });
    }

    const participation = await loadParticipation(tx, listing.participationId);

    // Soporte de venta parcial: si listing.shareCount < participation.shareCount
    // partimos la participación. Legacy null = totalidad.
    const listingShareCount = listing.shareCount ?? participation.shareCount;
    if (listingShareCount < 1 || listingShareCount > participation.shareCount) {
      throw new InvariantViolation(
        "R_02_BAD_LISTING_SHARES",
        `ResaleListing.shareCount (${listingShareCount}) fuera de rango respecto a Participation.shareCount (${participation.shareCount}).`
      );
    }
    const isFullTransfer = listingShareCount === participation.shareCount;

    if (isFullTransfer) {
      // Path canónico: la participación tuvo que pasar por TRANSFER_PENDING
      // antes de poder validarse.
      if (!canTransition(participation.status, "TRANSFER_VALIDATED")) {
        throw new IllegalTransition(participation.status, "TRANSFER_VALIDATED");
      }
    } else {
      // Path parcial: la participación se queda en ASSIGNED (puede tener otros
      // listings paralelos). El listing en AWAITING_VALIDATION es suficiente
      // gate; no exigimos canTransition sobre el status global.
      if (participation.status !== "ASSIGNED") {
        throw new IllegalTransition(participation.status, "TRANSFER_VALIDATED");
      }
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

    if (isFullTransfer) {
      // Transferencia total — patrón vigente: append al chain y flip de owner.
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
        data: {
          status: "COMPLETED",
          closedAt: new Date(),
          // Defense in depth: el link de confirmación del comprador ya no debe
          // funcionar una vez ejecutado el traspaso.
          buyerConfirmationTokenHash: null,
          buyerConfirmationTokenExpiresAt: null,
        },
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
          shareCount: listingShareCount,
          partial: false,
        },
      });

      return;
    }

    // ─── Partial split ─────────────────────────────────────────────────
    // 1) Decremento atómico del shareCount del seller (race-safe igual que
    //    share-assignment.ts: gte en el where evita doble cierre concurrente).
    const project = await tx.project.findUnique({
      where: { id: participation.projectId },
      select: { slug: true },
    });
    if (!project) throw new NotFoundError("Project", participation.projectId);

    const decremented = await tx.participation.updateMany({
      where: {
        id: participation.id,
        shareCount: { gte: listingShareCount },
      },
      data: { shareCount: { decrement: listingShareCount } },
    });
    if (decremented.count === 0) {
      throw new InvariantViolation(
        "R_03_RACE_PARTIAL",
        "No se pudo decrementar el stock de la participación origen (race condition o stock insuficiente)."
      );
    }

    // 2) Nueva Participation para el buyer — mismo patrón de serial que
    //    share-assignment.ts (Date.now en base36 + 3 bytes random).
    const serial = `AJDUT-${project.slug.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const newParticipation = await tx.participation.create({
      data: {
        projectId: participation.projectId,
        serialCode: serial,
        shareCount: listingShareCount,
        status: "ASSIGNED",
        currentOwnerId: listing.proposedBuyerId,
        isPlatformStake: false,
        acquiredAt: effectiveAt,
      },
    });

    // 3) OwnershipHistory inmutable para la nueva participación (cadena nueva).
    const reason = input.reason || `Reventa parcial — ${listingShareCount} participaciones.`;
    const payload = {
      participationId: newParticipation.id,
      fromUserId: listing.sellerId,
      toUserId: listing.proposedBuyerId,
      authorizedById: input.adminId,
      coAuthorizedById: input.coAdminId ?? null,
      reason,
      resaleListingId: listing.id,
      effectiveAt: effectiveAt.toISOString(),
    };
    const blockHash = computeBlockHash(payload, null);

    await tx.ownershipHistory.create({
      data: {
        participationId: newParticipation.id,
        fromUserId: listing.sellerId,
        toUserId: listing.proposedBuyerId,
        authorizedById: input.adminId,
        coAuthorizedById: input.coAdminId ?? null,
        reason,
        resaleListingId: listing.id,
        effectiveAt,
        blockHash,
        prevHash: null,
      },
    });

    // 4) Certificate para la nueva participación (mismo patrón que share-assignment).
    const certSerial = `CERT-${serial}`;
    const watermarkSeed = createHash("sha256")
      .update(newParticipation.id + effectiveAt.toISOString())
      .digest("hex")
      .slice(0, 16);
    const disclaimerHash = "v1:certificate-default";

    const certificate = await tx.certificate.create({
      data: {
        participationId: newParticipation.id,
        issuedToUserId: listing.proposedBuyerId,
        serialCode: certSerial,
        pdfStorageKey: "",
        watermarkSeed,
        disclaimerHash,
      },
    });

    // 5) Cerrar el listing
    await tx.resaleListing.update({
      where: { id: listing.id },
      data: {
        status: "COMPLETED",
        closedAt: new Date(),
        buyerConfirmationTokenHash: null,
        buyerConfirmationTokenExpiresAt: null,
      },
    });

    // 6) Auditoría — SPLIT (parte) + TRANSFER_VALIDATED (transfiere) + CERTIFICATE.ISSUED.
    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: listing.projectId,
      action: "PARTICIPATION.SPLIT",
      entityType: "Participation",
      entityId: participation.id,
      payload: {
        resaleListingId: listing.id,
        originalParticipationId: participation.id,
        newParticipationId: newParticipation.id,
        splitShareCount: listingShareCount,
        remainingShareCount: participation.shareCount - listingShareCount,
      },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: listing.projectId,
      action: "PARTICIPATION.TRANSFERRED",
      entityType: "Participation",
      entityId: newParticipation.id,
      payload: {
        resaleListingId: listing.id,
        fromUserId: listing.sellerId,
        toUserId: listing.proposedBuyerId,
        coAdminId: input.coAdminId ?? null,
        shareCount: listingShareCount,
        partial: true,
        serial,
      },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: listing.projectId,
      action: "CERTIFICATE.ISSUED",
      entityType: "Certificate",
      entityId: certificate.id,
      payload: { participationId: newParticipation.id, serial: certSerial },
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
    const listingShareCount = listing.shareCount ?? participation.shareCount;
    const isFullTransfer = listingShareCount === participation.shareCount;

    if (isFullTransfer) {
      if (!canTransition(participation.status, "TRANSFER_REJECTED")) {
        throw new IllegalTransition(participation.status, "TRANSFER_REJECTED");
      }
    }

    await tx.resaleListing.update({
      where: { id: listing.id },
      data: {
        status: "IN_CONVERSATION", // vuelve al tablón
        // El comprador propuesto deja de estar designado; limpiamos las
        // aceptaciones tripartitas y el token para que un futuro
        // closeResaleDeal arranque limpio.
        buyerAcceptedAt: null,
        ownerAcceptedAt: null,
        buyerConfirmationTokenHash: null,
        buyerConfirmationTokenExpiresAt: null,
      },
    });
    // Solo revertimos el status global cuando el listing era total — para
    // parciales la participación nunca dejó de estar ASSIGNED.
    if (isFullTransfer) {
      await tx.participation.update({
        where: { id: participation.id },
        data: { status: "IN_RESALE" },
      });
    }

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: listing.projectId,
      action: "PARTICIPATION.TRANSFER_REJECTED",
      entityType: "ResaleListing",
      entityId: listing.id,
      payload: { note: input.note, partial: !isFullTransfer },
    });
  });
}

// ─── Validación tripartita: confirmación del COMPRADOR ──────────────

export type InspectBuyerTokenResult =
  | {
      ok: true;
      resaleListingId: string;
      projectName: string;
      projectSlug: string;
      sellerName: string;
      shareCount: number;
      pricePerShare: string | null;
      intentNote: string | null;
      alreadyAcceptedAt: Date | null;
      expiresAt: Date;
    }
  | { ok: false; error: "TOKEN_NOT_FOUND" | "TOKEN_EXPIRED" | "TOKEN_RESOLVED" };

/**
 * Inspecciona el token del comprador sin consumirlo — para la página
 * `/confirmar-reventa/[token]`. `TOKEN_RESOLVED` cubre el caso donde la reventa
 * ya se ejecutó o canceló (status != AWAITING_VALIDATION): el link queda
 * invalidado. Mismo patrón que inspectTargetConfirmationToken.
 */
export async function inspectBuyerConfirmationToken(
  plainToken: string
): Promise<InspectBuyerTokenResult> {
  const hash = hashBuyerConfirmationToken(plainToken);
  const listing = await prisma.resaleListing.findUnique({
    where: { buyerConfirmationTokenHash: hash },
    include: {
      project: { select: { name: true, slug: true } },
      seller: { select: { fullName: true, alias: true } },
      participation: { select: { shareCount: true } },
    },
  });
  if (!listing) return { ok: false, error: "TOKEN_NOT_FOUND" };
  if (listing.status !== "AWAITING_VALIDATION") {
    return { ok: false, error: "TOKEN_RESOLVED" };
  }
  if (
    !listing.buyerConfirmationTokenExpiresAt ||
    listing.buyerConfirmationTokenExpiresAt.getTime() < Date.now()
  ) {
    return { ok: false, error: "TOKEN_EXPIRED" };
  }
  return {
    ok: true,
    resaleListingId: listing.id,
    projectName: listing.project.name,
    projectSlug: listing.project.slug,
    sellerName: listing.seller.alias ?? listing.seller.fullName,
    shareCount: listing.shareCount ?? listing.participation.shareCount,
    pricePerShare: listing.proposedPricePerShare
      ? listing.proposedPricePerShare.toString()
      : null,
    intentNote: listing.intentNote,
    alreadyAcceptedAt: listing.buyerAcceptedAt,
    expiresAt: listing.buyerConfirmationTokenExpiresAt,
  };
}

export type ConfirmResaleBuyerResult = {
  resaleListingId: string;
  projectName: string;
  projectSlug: string;
  shareCount: number;
  /** True si comprador y founder ya validaron — queda esperando al admin. */
  bothPartiesConfirmed: boolean;
};

/**
 * El comprador propuesto confirma via el link de email (single-use). Setea
 * `buyerAcceptedAt`, nulea el token. Idempotente si por algún motivo el token
 * llega dos veces (en realidad se nulea, así que el segundo intento devuelve
 * TOKEN_NOT_FOUND a nivel inspect).
 */
export async function confirmResaleBuyer(
  plainToken: string
): Promise<ConfirmResaleBuyerResult> {
  const hash = hashBuyerConfirmationToken(plainToken);

  return prisma.$transaction(async (tx) => {
    const listing = await tx.resaleListing.findUnique({
      where: { buyerConfirmationTokenHash: hash },
      include: {
        project: { select: { name: true, slug: true } },
        participation: { select: { shareCount: true } },
      },
    });
    if (!listing) {
      throw new NotFoundError("ResaleListing", "by buyer token");
    }
    if (listing.status !== "AWAITING_VALIDATION") {
      throw new InvariantViolation(
        "R_05_NOT_AWAITING",
        `La reventa ya no está esperando confirmación (${listing.status}).`
      );
    }
    if (
      !listing.buyerConfirmationTokenExpiresAt ||
      listing.buyerConfirmationTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new InvariantViolation(
        "R_06_TOKEN_EXPIRED",
        "Este link de confirmación expiró. Pedile al vendedor que reinicie el trato."
      );
    }

    const now = new Date();
    await tx.resaleListing.update({
      where: { id: listing.id },
      data: {
        buyerAcceptedAt: now,
        buyerSignedAt: listing.buyerSignedAt ?? now,
        // Consumir el token (single-use).
        buyerConfirmationTokenHash: null,
        buyerConfirmationTokenExpiresAt: null,
      },
    });

    if (listing.proposedBuyerId) {
      await tx.notification.updateMany({
        where: {
          userId: listing.proposedBuyerId,
          kind: "RESALE_BUYER_CONFIRM",
          readAt: null,
        },
        data: { readAt: now },
      });
    }

    await recordAudit(tx, {
      actorId: listing.proposedBuyerId,
      projectId: listing.projectId,
      action: "RESALE.BUYER_CONFIRMED",
      entityType: "ResaleListing",
      entityId: listing.id,
      payload: {
        proposedBuyerId: listing.proposedBuyerId,
        confirmedAt: now.toISOString(),
      },
    });

    return {
      resaleListingId: listing.id,
      projectName: listing.project.name,
      projectSlug: listing.project.slug,
      shareCount: listing.shareCount ?? listing.participation.shareCount,
      bothPartiesConfirmed: listing.ownerAcceptedAt !== null,
    };
  });
}

// ─── Validación tripartita: confirmación del FOUNDER (project owner) ──

export type ConfirmResaleOwnerInput = {
  resaleListingId: string;
  actorId: string; // debe ser el project.ownerId
};

export type ConfirmResaleOwnerResult = {
  resaleListingId: string;
  projectName: string;
  projectSlug: string;
  shareCount: number;
  bothPartiesConfirmed: boolean;
};

/**
 * El founder (project owner) valida la reventa desde su dashboard. No usa
 * token: está logueado y validamos que actorId == project.ownerId. Esto le da
 * control sobre quién entra como socio.
 */
export async function confirmResaleOwner(
  input: ConfirmResaleOwnerInput
): Promise<ConfirmResaleOwnerResult> {
  return prisma.$transaction(async (tx) => {
    const listing = await tx.resaleListing.findUnique({
      where: { id: input.resaleListingId },
      include: {
        project: { select: { name: true, slug: true, ownerId: true } },
        participation: { select: { shareCount: true } },
      },
    });
    if (!listing) throw new NotFoundError("ResaleListing", input.resaleListingId);
    if (listing.project.ownerId !== input.actorId) {
      throw new ForbiddenError(
        "Solo el project owner puede validar esta reventa."
      );
    }
    if (listing.status !== "AWAITING_VALIDATION") {
      throw new InvariantViolation(
        "R_05_NOT_AWAITING",
        `La reventa ya no está esperando validación (${listing.status}).`
      );
    }

    const now = new Date();
    // Idempotente: si ya validó, devolvemos el estado sin re-auditar.
    if (!listing.ownerAcceptedAt) {
      await tx.resaleListing.update({
        where: { id: listing.id },
        data: { ownerAcceptedAt: now },
      });

      // Marcar leída la notificación in-app del founder.
      await tx.notification.updateMany({
        where: {
          userId: input.actorId,
          kind: "RESALE_OWNER_CONFIRM",
          readAt: null,
        },
        data: { readAt: now },
      });

      await recordAudit(tx, {
        actorId: input.actorId,
        projectId: listing.projectId,
        action: "RESALE.OWNER_CONFIRMED",
        entityType: "ResaleListing",
        entityId: listing.id,
        payload: { confirmedAt: now.toISOString() },
      });
    }

    return {
      resaleListingId: listing.id,
      projectName: listing.project.name,
      projectSlug: listing.project.slug,
      shareCount: listing.shareCount ?? listing.participation.shareCount,
      bothPartiesConfirmed: listing.buyerAcceptedAt !== null,
    };
  });
}
