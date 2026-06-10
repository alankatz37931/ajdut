import { createHash, randomBytes } from "node:crypto";
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
import { passiveClassId } from "./shareholder-class";

type Tx = Prisma.TransactionClient;

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
      throw new ForbiddenError("Solo el project owner del proyecto puede aceptar el pedido.");
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

    const effectiveAt = input.effectiveAt ?? new Date();

    // 1. Decrementar el pool atómicamente. `updateMany` con la cláusula
    //    `shareCount: { gte: needed }` evita race conditions: dos aprobaciones
    //    concurrentes no pueden ambas leer el mismo shareCount y restar.
    //    Si count === 0 ⇒ no había pool o no alcanzaba; distinguimos abajo.
    const decremented = await tx.participation.updateMany({
      where: {
        projectId: lead.project.id,
        status: "AVAILABLE",
        shareCount: { gte: lead.shareCountRequested },
      },
      data: { shareCount: { decrement: lead.shareCountRequested } },
    });
    if (decremented.count === 0) {
      const pool = await tx.participation.findFirst({
        where: { projectId: lead.project.id, status: "AVAILABLE" },
        select: { shareCount: true },
      });
      if (!pool) {
        throw new InvariantViolation(
          "PA_01_NO_POOL",
          "Este proyecto no tiene pool de acciones disponibles."
        );
      }
      throw new ValidationError(
        "shareCountRequested",
        `Solo hay ${pool.shareCount} acciones disponibles (pedido: ${lead.shareCountRequested}).`
      );
    }
    // Si quedó en 0, eliminamos el pool vacío para no contaminar futuras queries
    await tx.participation.deleteMany({
      where: { projectId: lead.project.id, status: "AVAILABLE", shareCount: 0 },
    });

    // 2. Crear la Participation asignada al inversor.
    //    Sufijo random para evitar colisiones del serialCode (unique) cuando
    //    dos asignaciones caen en el mismo milisegundo.
    const serial = `AJDUT-${lead.project.slug.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const participation = await tx.participation.create({
      data: {
        projectId: lead.project.id,
        serialCode: serial,
        shareCount: lead.shareCountRequested,
        status: "ASSIGNED",
        currentOwnerId: lead.user.id,
        isPlatformStake: false,
        acquiredAt: effectiveAt,
        // Clase por defecto de quien adquiere: Inversor pasivo (reasignable).
        shareholderClassId: await passiveClassId(tx, lead.project.id),
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

// ─── Asignación directa (founder invita y asigna en un solo paso) ──

export type AssignSharesToInvestorInput = {
  tx: Tx;                  // operación encadenada con la creación del User en la invitación
  projectId: string;
  projectSlug: string;
  actorId: string;         // founder dueño del proyecto (o admin actuando en nombre)
  toUserId: string;        // destinatario de las acciones
  shareCount: number;
  reason?: string;
  effectiveAt?: Date;
};

export type AssignSharesToInvestorResult = {
  participationId: string;
  newSerial: string;
  shareCount: number;
  certificateId: string;
  certificateSerial: string;
};

/**
 * Asigna `shareCount` acciones desde el pool AVAILABLE de un proyecto a un
 * inversor. Operación atómica dentro de la transacción `tx` provista. Se usa
 * desde el flujo de invitación directa del founder (no pasa por Lead).
 *
 * No valida que el actor sea el founder — la decisión de autorización vive
 * en el caller (la action lo verifica vía getProjectAccess). Acá nos
 * concentramos en mantener la consistencia del pool + emitir certificate +
 * registrar OwnershipHistory + auditoría.
 */
export async function assignSharesToInvestor(
  input: AssignSharesToInvestorInput
): Promise<AssignSharesToInvestorResult> {
  const { tx } = input;
  if (input.shareCount < 1) {
    throw new ValidationError("shareCount", "Cantidad inválida.");
  }

  const project = await tx.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, slug: true, status: true },
  });
  if (!project) throw new NotFoundError("Project", input.projectId);
  if (project.status !== "ACTIVE") {
    throw new InvariantViolation(
      "PR_05_PROJECT_INACTIVE",
      "El proyecto no está activo; no se pueden asignar acciones."
    );
  }

  const investor = await tx.user.findUnique({
    where: { id: input.toUserId },
    select: { id: true, isActive: true, deletedAt: true },
  });
  if (!investor) throw new NotFoundError("User", input.toUserId);
  if (!investor.isActive || investor.deletedAt) {
    throw new ForbiddenError("El usuario destinatario no tiene cuenta activa.");
  }

  const effectiveAt = input.effectiveAt ?? new Date();

  // 1. Decremento atómico del pool (race-safe).
  const decremented = await tx.participation.updateMany({
    where: {
      projectId: project.id,
      status: "AVAILABLE",
      shareCount: { gte: input.shareCount },
    },
    data: { shareCount: { decrement: input.shareCount } },
  });
  if (decremented.count === 0) {
    const pool = await tx.participation.findFirst({
      where: { projectId: project.id, status: "AVAILABLE" },
      select: { shareCount: true },
    });
    if (!pool) {
      throw new InvariantViolation(
        "PA_01_NO_POOL",
        "Este proyecto no tiene pool de acciones disponibles."
      );
    }
    throw new ValidationError(
      "shareCount",
      `Solo hay ${pool.shareCount} acciones disponibles (pedido: ${input.shareCount}).`
    );
  }
  await tx.participation.deleteMany({
    where: { projectId: project.id, status: "AVAILABLE", shareCount: 0 },
  });

  // 2. Crear participation asignada (sufijo random anti-colisión del serial).
  const serial = `AJDUT-${project.slug.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const participation = await tx.participation.create({
    data: {
      projectId: project.id,
      serialCode: serial,
      shareCount: input.shareCount,
      status: "ASSIGNED",
      currentOwnerId: investor.id,
      isPlatformStake: false,
      acquiredAt: effectiveAt,
      // Clase por defecto de quien adquiere: Inversor pasivo (reasignable).
      shareholderClassId: await passiveClassId(tx, project.id),
    },
  });

  // 3. OwnershipHistory inmutable
  const reason =
    input.reason ??
    `Asignación directa por invitación del founder — ${input.shareCount} acciones.`;
  const payload = {
    participationId: participation.id,
    fromUserId: null,
    toUserId: investor.id,
    authorizedById: input.actorId,
    coAuthorizedById: null,
    reason,
    resaleListingId: null,
    effectiveAt: effectiveAt.toISOString(),
  };
  const blockHash = computeBlockHash(payload, null);

  await tx.ownershipHistory.create({
    data: {
      participationId: participation.id,
      fromUserId: null,
      toUserId: investor.id,
      authorizedById: input.actorId,
      coAuthorizedById: null,
      reason,
      resaleListingId: null,
      effectiveAt,
      blockHash,
      prevHash: null,
    },
  });

  // 4. Certificate básico
  const certSerial = `CERT-${serial}`;
  const watermarkSeed = createHash("sha256")
    .update(participation.id + effectiveAt.toISOString())
    .digest("hex")
    .slice(0, 16);
  const disclaimerHash = "v1:certificate-default";

  const certificate = await tx.certificate.create({
    data: {
      participationId: participation.id,
      issuedToUserId: investor.id,
      serialCode: certSerial,
      pdfStorageKey: "",
      watermarkSeed,
      disclaimerHash,
    },
  });

  // 5. Auditoría
  await recordAudit(tx, {
    actorId: input.actorId,
    projectId: project.id,
    action: "PARTICIPATION.ASSIGNED",
    entityType: "Participation",
    entityId: participation.id,
    payload: {
      source: "INVITE",
      toUserId: investor.id,
      shareCount: input.shareCount,
      serial,
    },
  });
  await recordAudit(tx, {
    actorId: input.actorId,
    projectId: project.id,
    action: "CERTIFICATE.ISSUED",
    entityType: "Certificate",
    entityId: certificate.id,
    payload: { participationId: participation.id, serial: certSerial },
  });

  return {
    participationId: participation.id,
    newSerial: serial,
    shareCount: input.shareCount,
    certificateId: certificate.id,
    certificateSerial: certSerial,
  };
}
