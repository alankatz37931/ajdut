import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { computeBlockHash } from "@/lib/crypto/ownership-chain";
import {
  ForbiddenError,
  InvariantViolation,
  NotFoundError,
  ValidationError,
} from "./errors";

export type AssignFromLeadInput = {
  leadId: string;
  actorId: string;          // founder dueño del proyecto
  effectiveAt?: Date;
};

export type AssignFromLeadResult = {
  participationId: string;
  newSerial: string;
  shareCount: number;
  toUserId: string;
  certificateId: string;
};

/**
 * Cierra el loop de compra: dado un Lead OPEN/CONTACTED, ejecuta la asignación
 * de acciones desde el pool AVAILABLE del proyecto al inversor.
 *
 * Operación atómica:
 *  1. Carga el Lead + valida que el actor sea el founder del proyecto.
 *  2. Encuentra el pool AVAILABLE y verifica que haya suficientes acciones.
 *  3. Decrementa el pool en `shareCountRequested` (o lo borra si queda en 0).
 *  4. Crea una nueva Participation con `status = ASSIGNED` para el inversor.
 *  5. Registra OwnershipHistory inmutable (cadena de hashes).
 *  6. Emite un Certificate básico (sin PDF aún).
 *  7. Marca el Lead como CONVERTED.
 *  8. Registra auditoría completa.
 */
export async function assignSharesFromLead(
  input: AssignFromLeadInput
): Promise<AssignFromLeadResult> {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: input.leadId },
      include: {
        project: {
          select: {
            id: true,
            slug: true,
            ownerId: true,
            name: true,
            status: true,
          },
        },
        user: { select: { id: true, fullName: true, email: true, isActive: true, deletedAt: true } },
      },
    });
    if (!lead) throw new NotFoundError("Lead", input.leadId);
    if (lead.project.ownerId !== input.actorId) {
      throw new ForbiddenError("Solo el founder del proyecto puede aceptar el pedido.");
    }
    if (lead.status !== "OPEN" && lead.status !== "CONTACTED") {
      throw new InvariantViolation(
        "L_03_BAD_STATUS",
        `El lead está en ${lead.status} y no se puede convertir.`
      );
    }
    if (lead.project.status !== "ACTIVE") {
      throw new InvariantViolation(
        "PR_05_PROJECT_INACTIVE",
        "El proyecto no está activo; no se pueden asignar acciones."
      );
    }
    if (!lead.user.isActive || lead.user.deletedAt) {
      throw new ValidationError("user", "El miembro ya no tiene cuenta activa.");
    }
    if (lead.shareCountRequested < 1) {
      throw new ValidationError("shareCountRequested", "Cantidad inválida en el lead.");
    }

    // 1. Encontrar pool AVAILABLE del proyecto
    const pool = await tx.participation.findFirst({
      where: { projectId: lead.project.id, status: "AVAILABLE" },
    });
    if (!pool) {
      throw new InvariantViolation(
        "PA_01_NO_POOL",
        "Este proyecto no tiene pool de acciones disponibles."
      );
    }
    if (pool.shareCount < lead.shareCountRequested) {
      throw new ValidationError(
        "shareCountRequested",
        `Solo hay ${pool.shareCount} acciones disponibles (pedido: ${lead.shareCountRequested}).`
      );
    }

    const effectiveAt = input.effectiveAt ?? new Date();

    // 2. Decrementar el pool (o eliminarlo si queda en 0)
    const remaining = pool.shareCount - lead.shareCountRequested;
    if (remaining === 0) {
      await tx.participation.delete({ where: { id: pool.id } });
    } else {
      await tx.participation.update({
        where: { id: pool.id },
        data: { shareCount: remaining },
      });
    }

    // 3. Crear la Participation asignada al inversor
    const serial = `AJDUT-${lead.project.slug.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const participation = await tx.participation.create({
      data: {
        projectId: lead.project.id,
        serialCode: serial,
        shareCount: lead.shareCountRequested,
        status: "ASSIGNED",
        currentOwnerId: lead.user.id,
        isPlatformStake: false,
        acquiredAt: effectiveAt,
      },
    });

    // 4. OwnershipHistory inmutable
    const payload = {
      participationId: participation.id,
      fromUserId: null, // emisión desde pool (no había dueño previo)
      toUserId: lead.user.id,
      authorizedById: input.actorId,
      coAuthorizedById: null,
      reason: `Asignación desde lead ${lead.id} — ${lead.shareCountRequested} acciones.`,
      resaleListingId: null,
      effectiveAt: effectiveAt.toISOString(),
    };
    const blockHash = computeBlockHash(payload, null);

    await tx.ownershipHistory.create({
      data: {
        participationId: participation.id,
        fromUserId: null,
        toUserId: lead.user.id,
        authorizedById: input.actorId,
        coAuthorizedById: null,
        reason: payload.reason,
        resaleListingId: null,
        effectiveAt,
        blockHash,
        prevHash: null,
      },
    });

    // 5. Certificate básico (sin PDF generado, solo el registro de propiedad)
    const certSerial = `CERT-${serial}`;
    const watermarkSeed = createHash("sha256")
      .update(participation.id + effectiveAt.toISOString())
      .digest("hex")
      .slice(0, 16);
    const disclaimerHash = "v1:certificate-default";

    const certificate = await tx.certificate.create({
      data: {
        participationId: participation.id,
        issuedToUserId: lead.user.id,
        serialCode: certSerial,
        pdfStorageKey: "", // pendiente: generación de PDF
        watermarkSeed,
        disclaimerHash,
      },
    });

    // 6. Marcar Lead como CONVERTED
    await tx.lead.update({
      where: { id: lead.id },
      data: { status: "CONVERTED", resolvedAt: new Date() },
    });

    // 7. Auditoría
    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: lead.project.id,
      action: "PARTICIPATION.ASSIGNED",
      entityType: "Participation",
      entityId: participation.id,
      payload: {
        leadId: lead.id,
        toUserId: lead.user.id,
        shareCount: lead.shareCountRequested,
        serial,
      },
    });
    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: lead.project.id,
      action: "CERTIFICATE.ISSUED",
      entityType: "Certificate",
      entityId: certificate.id,
      payload: { participationId: participation.id, serial: certSerial },
    });

    return {
      participationId: participation.id,
      newSerial: serial,
      shareCount: lead.shareCountRequested,
      toUserId: lead.user.id,
      certificateId: certificate.id,
    };
  });
}
