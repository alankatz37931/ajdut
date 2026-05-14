import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import {
  ForbiddenError,
  IllegalTransition,
  InvariantViolation,
  NotFoundError,
  ValidationError,
} from "./errors";

type Tx = Prisma.TransactionClient;

const DISCLAIMER_TEXT_V1 =
  "AJDUT no procesa, custodia ni facilita el pago de esta distribución. Los fondos se transfieren fuera de la plataforma según los términos acordados entre el founder y cada socio. AJDUT registra la declaración del founder, la confirmación de envío y la confirmación de recepción con fines de trazabilidad y auditoría.";

const DISCLAIMER_HASH_V1 = "v1:" + Buffer.from(DISCLAIMER_TEXT_V1).toString("base64").slice(0, 32);

export const CURRENT_DISCLAIMER = { text: DISCLAIMER_TEXT_V1, hash: DISCLAIMER_HASH_V1 };

// ─── Declarar distribución (DRAFT) ─────────────────────────────────

export type DeclareDistributionInput = {
  projectId: string;
  declaredById: string;       // PROJECT_OWNER
  title: string;
  fiscalPeriod?: string;
  notes?: string;
  totalAmount: string | number;
  currency: string;
  recordDate: Date;
  supportingDocKey?: string;
};

export async function declareDistribution(input: DeclareDistributionInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new NotFoundError("Project", input.projectId);
    if (project.ownerId !== input.declaredById) {
      throw new ForbiddenError("Solo el founder del proyecto puede declarar distribuciones.");
    }
    if (project.status !== "ACTIVE") {
      throw new InvariantViolation(
        "D_06_PROJECT_NOT_ACTIVE",
        `El proyecto está en estado ${project.status}; solo proyectos ACTIVE admiten distribuciones.`
      );
    }

    const totalAmount = new Prisma.Decimal(input.totalAmount);
    if (totalAmount.lte(0)) {
      throw new ValidationError("totalAmount", "El monto total debe ser mayor que cero.");
    }
    if (input.title.trim().length < 3) {
      throw new ValidationError("title", "El título es demasiado corto.");
    }

    const distribution = await tx.dividendDistribution.create({
      data: {
        projectId: project.id,
        declaredById: input.declaredById,
        title: input.title.trim(),
        fiscalPeriod: input.fiscalPeriod ?? null,
        notes: input.notes ?? null,
        totalAmount,
        currency: input.currency,
        recordDate: input.recordDate,
        totalSharesAtRecord: 0,        // se completa al ANNOUNCE
        amountPerShare: new Prisma.Decimal(0),
        supportingDocKey: input.supportingDocKey ?? null,
        disclaimerHash: CURRENT_DISCLAIMER.hash,
        status: "DRAFT",
      },
    });

    await recordAudit(tx, {
      actorId: input.declaredById,
      projectId: project.id,
      action: "DISTRIBUTION.DRAFTED",
      entityType: "DividendDistribution",
      entityId: distribution.id,
      payload: { totalAmount: totalAmount.toString(), currency: input.currency },
    });

    return distribution;
  });
}

// ─── Snapshot del cap table al recordDate ──────────────────────────

type Snapshot = Array<{
  participationId: string;
  ownerId: string;
  shareCount: number;
  isPlatformStake: boolean;
}>;

async function buildHolderSnapshot(tx: Tx, projectId: string, recordDate: Date): Promise<Snapshot> {
  // Estrategia: para cada Participation actual del proyecto, buscar el dueño
  // efectivo al recordDate vía OwnershipHistory.validatedAt <= recordDate.
  const participations = await tx.participation.findMany({
    where: { projectId, currentOwnerId: { not: null } },
    select: { id: true, isPlatformStake: true, shareCount: true },
  });

  const result: Snapshot = [];
  for (const p of participations) {
    const lastHistory = await tx.ownershipHistory.findFirst({
      where: { participationId: p.id, validatedAt: { lte: recordDate } },
      orderBy: { validatedAt: "desc" },
      select: { toUserId: true },
    });
    if (!lastHistory) continue;
    result.push({
      participationId: p.id,
      ownerId: lastHistory.toUserId,
      shareCount: p.shareCount,
      isPlatformStake: p.isPlatformStake,
    });
  }
  return result;
}

// ─── Anunciar distribución: congela el snapshot y crea payments ────

export type AnnounceDistributionInput = {
  distributionId: string;
  actorId: string;
};

export async function announceDistribution(input: AnnounceDistributionInput) {
  return prisma.$transaction(async (tx) => {
    const dist = await tx.dividendDistribution.findUnique({ where: { id: input.distributionId } });
    if (!dist) throw new NotFoundError("DividendDistribution", input.distributionId);
    if (dist.status !== "DRAFT") {
      throw new IllegalTransition(dist.status, "ANNOUNCE");
    }
    if (dist.declaredById !== input.actorId) {
      throw new ForbiddenError("Solo el declarante puede anunciar la distribución.");
    }

    const snapshot = await buildHolderSnapshot(tx, dist.projectId, dist.recordDate);

    const totalShares = snapshot.reduce((acc, s) => acc + s.shareCount, 0);
    if (totalShares <= 0) {
      throw new InvariantViolation(
        "D_03_EMPTY_SNAPSHOT",
        "No hay holders al recordDate; no se puede anunciar la distribución."
      );
    }

    const totalAmount = dist.totalAmount;
    const amountPerShare = new Prisma.Decimal(totalAmount).div(totalShares); // hasta 8 decimales

    // Crear payments redondeando cada amount a 2 decimales hacia abajo,
    // el residual se suma al payment institucional.
    let distributed = new Prisma.Decimal(0);
    const platformIndices: number[] = [];
    const pendingPayments: Array<{
      participationId: string;
      recipientId: string;
      shareCount: number;
      amount: Prisma.Decimal;
      isPlatformPayment: boolean;
    }> = [];

    snapshot.forEach((s, i) => {
      const amt = amountPerShare.mul(s.shareCount).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      distributed = distributed.plus(amt);
      pendingPayments.push({
        participationId: s.participationId,
        recipientId: s.ownerId,
        shareCount: s.shareCount,
        amount: amt,
        isPlatformPayment: s.isPlatformStake,
      });
      if (s.isPlatformStake) platformIndices.push(i);
    });

    // I-D4: debe existir al menos un payment de plataforma
    if (platformIndices.length === 0) {
      throw new InvariantViolation(
        "D_04_NO_PLATFORM_PAYMENT",
        "El snapshot no contiene la participación institucional de AJDUT; no se puede anunciar."
      );
    }

    // Residual al primer payment institucional
    const residual = new Prisma.Decimal(totalAmount).minus(distributed);
    const firstPlatformIdx = platformIndices[0]!;
    pendingPayments[firstPlatformIdx]!.amount = pendingPayments[firstPlatformIdx]!.amount.plus(residual);

    await tx.dividendDistribution.update({
      where: { id: dist.id },
      data: {
        status: "ANNOUNCED",
        announcedAt: new Date(),
        totalSharesAtRecord: totalShares,
        amountPerShare,
      },
    });

    for (const p of pendingPayments) {
      await tx.dividendPayment.create({
        data: {
          distributionId: dist.id,
          participationId: p.participationId,
          recipientId: p.recipientId,
          shareCount: p.shareCount,
          amount: p.amount,
          currency: dist.currency,
          isPlatformPayment: p.isPlatformPayment,
          status: "PENDING",
        },
      });
    }

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: dist.projectId,
      action: "DISTRIBUTION.ANNOUNCED",
      entityType: "DividendDistribution",
      entityId: dist.id,
      payload: {
        totalSharesAtRecord: totalShares,
        amountPerShare: amountPerShare.toString(),
        paymentsCount: pendingPayments.length,
      },
    });

    return { totalShares, amountPerShare, paymentsCount: pendingPayments.length };
  });
}

// ─── Founder marca un payment como SENT ────────────────────────────

export type MarkPaymentSentInput = {
  paymentId: string;
  actorId: string;            // PROJECT_OWNER
  sentChannel: string;
  sentReference: string;
  sentNote?: string;
};

export async function markPaymentSent(input: MarkPaymentSentInput) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.dividendPayment.findUnique({
      where: { id: input.paymentId },
      include: { distribution: true },
    });
    if (!payment) throw new NotFoundError("DividendPayment", input.paymentId);
    if (payment.status !== "PENDING") {
      throw new IllegalTransition(payment.status, "MARK_SENT");
    }
    if (payment.distribution.declaredById !== input.actorId) {
      throw new ForbiddenError("Solo el founder declarante puede marcar pagos como enviados.");
    }
    if (input.sentChannel.trim().length < 2 || input.sentReference.trim().length < 2) {
      throw new ValidationError("sentReference", "Canal y referencia de envío son obligatorios.");
    }

    await tx.dividendPayment.update({
      where: { id: payment.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        sentChannel: input.sentChannel,
        sentReference: input.sentReference,
        sentNote: input.sentNote ?? null,
      },
    });

    // Si era el primer SENT, mover distribución a IN_PAYOUT
    if (payment.distribution.status === "ANNOUNCED") {
      await tx.dividendDistribution.update({
        where: { id: payment.distribution.id },
        data: { status: "IN_PAYOUT", payoutStartedAt: new Date() },
      });
    }

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: payment.distribution.projectId,
      action: "DISTRIBUTION.PAYMENT_SENT",
      entityType: "DividendPayment",
      entityId: payment.id,
      payload: {
        sentChannel: input.sentChannel,
        sentReference: input.sentReference,
        isPlatformPayment: payment.isPlatformPayment,
      },
    });
  });
}

// ─── Holder o Admin confirma RECEIVED ──────────────────────────────

export type ConfirmPaymentReceivedInput = {
  paymentId: string;
  actorId: string;            // PARTNER (su propio payment) o ADMIN (si es platform)
  receivedReference?: string;
  receivedNote?: string;
};

export async function confirmPaymentReceived(input: ConfirmPaymentReceivedInput) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.dividendPayment.findUnique({
      where: { id: input.paymentId },
      include: { distribution: true },
    });
    if (!payment) throw new NotFoundError("DividendPayment", input.paymentId);
    if (payment.status !== "SENT" && payment.status !== "DISPUTED") {
      throw new IllegalTransition(payment.status, "MARK_RECEIVED");
    }

    const actor = await tx.user.findUnique({ where: { id: input.actorId }, select: { role: true } });
    if (!actor) throw new ForbiddenError("Actor inválido.");

    if (payment.isPlatformPayment) {
      // I-D5: solo Admin puede confirmar
      if (actor.role !== "ADMIN") {
        throw new InvariantViolation(
          "D_05_PLATFORM_REQUIRES_ADMIN",
          "Solo un Admin puede confirmar la recepción del payment institucional."
        );
      }
    } else {
      // Holder confirma su propio payment, o un Admin en su nombre
      if (actor.role !== "ADMIN" && payment.recipientId !== input.actorId) {
        throw new ForbiddenError("Solo el destinatario o un Admin pueden confirmar la recepción.");
      }
    }

    await tx.dividendPayment.update({
      where: { id: payment.id },
      data: {
        status: "RECEIVED",
        receivedAt: new Date(),
        receivedReference: input.receivedReference ?? null,
        receivedNote: input.receivedNote ?? null,
        confirmedById: input.actorId,
        disputedAt: null,
      },
    });

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: payment.distribution.projectId,
      action: "DISTRIBUTION.PAYMENT_RECEIVED",
      entityType: "DividendPayment",
      entityId: payment.id,
      payload: { isPlatformPayment: payment.isPlatformPayment },
    });

    // Si todos los payments están RECEIVED, completar la distribución
    const remaining = await tx.dividendPayment.count({
      where: { distributionId: payment.distributionId, status: { not: "RECEIVED" } },
    });
    if (remaining === 0) {
      await tx.dividendDistribution.update({
        where: { id: payment.distributionId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await recordAudit(tx, {
        actorId: input.actorId,
        projectId: payment.distribution.projectId,
        action: "DISTRIBUTION.COMPLETED",
        entityType: "DividendDistribution",
        entityId: payment.distributionId,
      });
    }
  });
}

// ─── Holder objeta el payment ──────────────────────────────────────

export type DisputePaymentInput = {
  paymentId: string;
  actorId: string;
  disputeReason: string;
};

export async function disputePayment(input: DisputePaymentInput) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.dividendPayment.findUnique({
      where: { id: input.paymentId },
      include: { distribution: true },
    });
    if (!payment) throw new NotFoundError("DividendPayment", input.paymentId);
    if (payment.status !== "SENT") {
      throw new IllegalTransition(payment.status, "DISPUTE");
    }
    if (payment.isPlatformPayment) {
      throw new InvariantViolation(
        "D_05_PLATFORM_NO_DISPUTE_PUBLIC",
        "Las disputas sobre el payment institucional las maneja Admin internamente."
      );
    }
    if (payment.recipientId !== input.actorId) {
      throw new ForbiddenError("Solo el destinatario puede disputar el payment.");
    }
    if (input.disputeReason.trim().length < 10) {
      throw new ValidationError("disputeReason", "La razón de la disputa debe tener al menos 10 caracteres.");
    }

    await tx.dividendPayment.update({
      where: { id: payment.id },
      data: {
        status: "DISPUTED",
        disputedAt: new Date(),
        disputeReason: input.disputeReason,
      },
    });

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: payment.distribution.projectId,
      action: "DISTRIBUTION.PAYMENT_DISPUTED",
      entityType: "DividendPayment",
      entityId: payment.id,
      payload: { disputeReason: input.disputeReason },
    });
  });
}

// ─── Admin resuelve una disputa ─────────────────────────────────────

export type ResolveDisputeInput = {
  paymentId: string;
  adminId: string;
  resolveAs: "RECEIVED" | "SENT";   // Aceptada → RECEIVED; insuficiente → SENT (re-intento)
  resolutionNote: string;
};

export async function resolveDispute(input: ResolveDisputeInput) {
  return prisma.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({
      where: { id: input.adminId },
      select: { role: true, isActive: true },
    });
    if (!admin || admin.role !== "ADMIN" || !admin.isActive) {
      throw new ForbiddenError("Solo un Admin activo puede resolver disputas.");
    }

    const payment = await tx.dividendPayment.findUnique({
      where: { id: input.paymentId },
      include: { distribution: true },
    });
    if (!payment) throw new NotFoundError("DividendPayment", input.paymentId);
    if (payment.status !== "DISPUTED") {
      throw new IllegalTransition(payment.status, "RESOLVE_DISPUTE");
    }

    await tx.dividendPayment.update({
      where: { id: payment.id },
      data: {
        status: input.resolveAs,
        resolvedAt: new Date(),
        resolutionNote: input.resolutionNote,
        resolvedById: input.adminId,
        ...(input.resolveAs === "RECEIVED"
          ? {
              receivedAt: new Date(),
              receivedNote: input.resolutionNote,
              confirmedById: input.adminId,
            }
          : {}),
      },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: payment.distribution.projectId,
      action: "DISTRIBUTION.PAYMENT_RESOLVED",
      entityType: "DividendPayment",
      entityId: payment.id,
      payload: { resolveAs: input.resolveAs, resolutionNote: input.resolutionNote },
    });
  });
}
