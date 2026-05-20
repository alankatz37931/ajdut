import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import {
  assignSharesFromLead,
  assignSharesToInvestor,
} from "./share-assignment";
import { createPasswordSetupToken } from "./password-setup";
import { computeBlockHash } from "@/lib/crypto/ownership-chain";
import {
  DomainError,
  ForbiddenError,
  InvariantViolation,
  NotFoundError,
  ValidationError,
} from "./errors";

type Tx = Prisma.TransactionClient;
type AnyClient = Prisma.TransactionClient | typeof prisma;

/**
 * Ola 5 — Toda asignación de acciones queda primero como PendingAssignment.
 * El ADMIN aprueba o rechaza desde /admin/asignaciones. Solo cuando aprueba se
 * ejecuta `assignSharesFromLead` (para source=LEAD) o `assignSharesToInvestor`
 * (para source=INVITE), que efectivamente decrementan el pool, crean la
 * Participation, emiten el Certificate y registran el OwnershipHistory.
 */

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Devuelve cuántas acciones quedan en el pool AVAILABLE de un proyecto, neto
 * de PendingAssignment con status PENDING. Sirve para evitar doble-asignar el
 * mismo pool: si el founder propone 100 acciones y mientras el admin valida
 * propone otras 50, el segundo cálculo ve el pool descontado.
 */
export async function getAvailableSharesForProposal(
  projectId: string,
  client: AnyClient = prisma
): Promise<number> {
  const [pool, pendingAgg] = await Promise.all([
    client.participation.findFirst({
      where: { projectId, status: "AVAILABLE" },
      select: { shareCount: true },
    }),
    client.pendingAssignment.aggregate({
      where: { projectId, status: "PENDING" },
      _sum: { shareCount: true },
    }),
  ]);
  const available = pool?.shareCount ?? 0;
  const reserved = pendingAgg._sum.shareCount ?? 0;
  return Math.max(0, available - reserved);
}

async function assertProjectEditor(
  tx: Tx,
  projectId: string,
  userId: string
): Promise<void> {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, status: true },
  });
  if (!project) throw new NotFoundError("Project", projectId);
  if (project.status !== "ACTIVE") {
    throw new InvariantViolation(
      "PR_05_PROJECT_INACTIVE",
      "El proyecto no está activo; no se pueden proponer asignaciones."
    );
  }
  if (project.ownerId === userId) return;

  const coAdmin = await tx.projectCoAdmin.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (coAdmin) return;

  const actor = await tx.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (actor && actor.isActive && actor.role === "ADMIN") return;

  throw new ForbiddenError(
    "Solo el founder, un co-admin o un admin pueden proponer asignaciones."
  );
}

async function assertAdmin(tx: Tx, userId: string): Promise<void> {
  const u = await tx.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!u || !u.isActive || u.role !== "ADMIN") {
    throw new ForbiddenError("Solo un ADMIN activo puede validar asignaciones.");
  }
}

// ─── Crear propuesta desde un Lead ──────────────────────────────────

export type CreatePendingFromLeadInput = {
  projectId: string;
  projectSlug: string;
  proposedById: string;
  leadId: string;
  shareCount: number;
  reason?: string;
};

export type CreatePendingResult = {
  pendingId: string;
  shareCount: number;
};

export async function createPendingFromLead(
  input: CreatePendingFromLeadInput
): Promise<CreatePendingResult> {
  if (input.shareCount < 1) {
    throw new ValidationError("shareCount", "La cantidad debe ser un entero >= 1.");
  }

  return prisma.$transaction(async (tx) => {
    await assertProjectEditor(tx, input.projectId, input.proposedById);

    const lead = await tx.lead.findUnique({
      where: { id: input.leadId },
      include: {
        project: { select: { id: true } },
        user: {
          select: { id: true, isActive: true, deletedAt: true },
        },
      },
    });
    if (!lead) throw new NotFoundError("Lead", input.leadId);
    if (lead.project.id !== input.projectId) {
      throw new ValidationError("leadId", "El lead no pertenece a este proyecto.");
    }
    if (lead.status !== "OPEN" && lead.status !== "CONTACTED") {
      throw new InvariantViolation(
        "L_03_BAD_STATUS",
        `El lead está en ${lead.status} y no se puede proponer.`
      );
    }
    if (!lead.user.isActive || lead.user.deletedAt) {
      throw new ValidationError(
        "user",
        "El miembro destinatario ya no tiene cuenta activa."
      );
    }

    // Anti doble-pending del mismo lead
    const existing = await tx.pendingAssignment.findFirst({
      where: {
        leadId: lead.id,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (existing) {
      throw new InvariantViolation(
        "PA_02_LEAD_ALREADY_PROPOSED",
        "Ya hay una propuesta pendiente de validación para este lead."
      );
    }

    const available = await getAvailableSharesForProposal(input.projectId, tx);
    if (input.shareCount > available) {
      throw new ValidationError(
        "shareCount",
        `Solo hay ${available} acciones disponibles (incluyendo propuestas pendientes).`
      );
    }

    const pending = await tx.pendingAssignment.create({
      data: {
        projectId: input.projectId,
        proposedById: input.proposedById,
        source: "LEAD",
        leadId: lead.id,
        targetUserId: lead.user.id,
        shareCount: input.shareCount,
        reason: input.reason ?? null,
        status: "PENDING",
      },
    });

    await recordAudit(tx, {
      actorId: input.proposedById,
      projectId: input.projectId,
      action: "PARTICIPATION.ASSIGN_PROPOSED",
      entityType: "PendingAssignment",
      entityId: pending.id,
      payload: {
        source: "LEAD",
        leadId: lead.id,
        targetUserId: lead.user.id,
        shareCount: input.shareCount,
      },
    });

    return { pendingId: pending.id, shareCount: input.shareCount };
  });
}

// ─── Crear propuesta desde invitación directa ───────────────────────

export type CreatePendingFromInviteInput = {
  projectId: string;
  projectSlug: string;
  proposedById: string;
  inviteEmail: string;
  inviteFullName: string;
  inviteMessage?: string;
  shareCount: number;
  reason?: string;
};

export async function createPendingFromInvite(
  input: CreatePendingFromInviteInput
): Promise<CreatePendingResult> {
  const email = input.inviteEmail.trim().toLowerCase();
  const fullName = input.inviteFullName.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("inviteEmail", "Email inválido.");
  }
  if (fullName.length < 2) {
    throw new ValidationError(
      "inviteFullName",
      "El nombre completo es obligatorio."
    );
  }
  if (input.shareCount < 1) {
    throw new ValidationError("shareCount", "La cantidad debe ser un entero >= 1.");
  }

  return prisma.$transaction(async (tx) => {
    await assertProjectEditor(tx, input.projectId, input.proposedById);

    // Resolver target user si existe
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (existing) {
      if (existing.deletedAt) {
        throw new DomainError(
          "USER_DELETED",
          "Ese usuario fue eliminado y no puede recibir nuevas asignaciones."
        );
      }
      if (!existing.isActive) {
        throw new DomainError(
          "USER_INACTIVE",
          "Ese usuario está suspendido. Reactivalo antes de proponerle acciones."
        );
      }
    }
    const targetUserId = existing?.id ?? null;

    const available = await getAvailableSharesForProposal(input.projectId, tx);
    if (input.shareCount > available) {
      throw new ValidationError(
        "shareCount",
        `Solo hay ${available} acciones disponibles (incluyendo propuestas pendientes).`
      );
    }

    const pending = await tx.pendingAssignment.create({
      data: {
        projectId: input.projectId,
        proposedById: input.proposedById,
        source: "INVITE",
        inviteEmail: email,
        inviteFullName: fullName,
        inviteMessage: input.inviteMessage?.trim() || null,
        targetUserId,
        shareCount: input.shareCount,
        reason: input.reason ?? null,
        status: "PENDING",
      },
    });

    await recordAudit(tx, {
      actorId: input.proposedById,
      projectId: input.projectId,
      action: "PARTICIPATION.ASSIGN_PROPOSED",
      entityType: "PendingAssignment",
      entityId: pending.id,
      payload: {
        source: "INVITE",
        inviteEmail: email,
        inviteFullName: fullName,
        targetUserId,
        shareCount: input.shareCount,
        wasExistingUser: !!targetUserId,
      },
    });

    return { pendingId: pending.id, shareCount: input.shareCount };
  });
}

// ─── Aprobar (ejecutar la asignación real) ─────────────────────────

export type ApprovePendingInput = {
  pendingId: string;
  adminId: string;
};

export type ApprovePendingResult = {
  pendingId: string;
  source: "LEAD" | "INVITE";
  participationId: string;
  certificateId: string;
  certificateSerial: string;
  newSerial: string;
  shareCount: number;
  toUserId: string;
  toEmail: string;
  toFullName: string;
  wasNewUser: boolean;
  setupToken: string | null;
  setupExpiresAt: Date | null;
  projectId: string;
  projectSlug: string;
  projectName: string;
  proposerEmail: string;
  proposerFullName: string;
};

export async function approvePendingAssignment(
  input: ApprovePendingInput
): Promise<ApprovePendingResult> {
  return prisma.$transaction(async (tx) => {
    await assertAdmin(tx, input.adminId);

    const pending = await tx.pendingAssignment.findUnique({
      where: { id: input.pendingId },
      include: {
        project: {
          select: { id: true, slug: true, name: true, status: true, ownerId: true },
        },
        proposedBy: { select: { email: true, fullName: true, alias: true } },
        lead: {
          select: { id: true, status: true, userId: true, shareCountRequested: true },
        },
        targetUser: { select: { id: true, email: true, fullName: true } },
      },
    });
    if (!pending) throw new NotFoundError("PendingAssignment", input.pendingId);
    if (pending.status !== "PENDING") {
      throw new InvariantViolation(
        "PA_03_NOT_PENDING",
        `La propuesta ya fue resuelta (${pending.status}).`
      );
    }
    if (pending.project.status !== "ACTIVE") {
      throw new InvariantViolation(
        "PR_05_PROJECT_INACTIVE",
        "El proyecto no está activo; no se puede aprobar la asignación."
      );
    }

    let participationId: string;
    let certificateId: string;
    let certificateSerial: string;
    let newSerial: string;
    let shareCount: number;
    let toUserId: string;
    let toEmail: string;
    let toFullName: string;
    let wasNewUser = false;
    let setupToken: string | null = null;
    let setupExpiresAt: Date | null = null;

    if (pending.source === "LEAD") {
      if (!pending.leadId || !pending.lead) {
        throw new InvariantViolation(
          "PA_04_LEAD_MISSING",
          "La propuesta dice source=LEAD pero no tiene lead asociado."
        );
      }
      if (pending.lead.status !== "OPEN" && pending.lead.status !== "CONTACTED") {
        throw new InvariantViolation(
          "PA_05_LEAD_STALE",
          `El lead cambió a ${pending.lead.status} mientras se aprobaba.`
        );
      }
      // Si el founder propuso una shareCount distinta a la del lead, hay que
      // sincronizar el lead antes para que assignSharesFromLead use el mismo
      // número. assignSharesFromLead lee `lead.shareCountRequested`.
      if (pending.shareCount !== pending.lead.shareCountRequested) {
        await tx.lead.update({
          where: { id: pending.leadId },
          data: { shareCountRequested: pending.shareCount },
        });
      }

      const r = await assignSharesFromLeadWithinTx({
        tx,
        leadId: pending.leadId,
        actorId: input.adminId,
        adminApproved: true,
      });
      participationId = r.participationId;
      certificateId = r.certificateId;
      certificateSerial = r.certificateSerial;
      newSerial = r.newSerial;
      shareCount = r.shareCount;
      toUserId = r.toUserId;
      const target = await tx.user.findUnique({
        where: { id: r.toUserId },
        select: { email: true, fullName: true },
      });
      toEmail = target?.email ?? "";
      toFullName = target?.fullName ?? "";
    } else {
      // INVITE
      if (!pending.inviteEmail || !pending.inviteFullName) {
        throw new InvariantViolation(
          "PA_06_INVITE_MISSING",
          "La propuesta dice source=INVITE pero faltan datos del invitado."
        );
      }
      const email = pending.inviteEmail;
      const fullName = pending.inviteFullName;

      // Resolver / crear el User
      let inviteeId: string;
      if (pending.targetUserId) {
        const u = await tx.user.findUnique({
          where: { id: pending.targetUserId },
          select: { id: true, isActive: true, deletedAt: true, email: true, fullName: true },
        });
        if (!u) {
          throw new InvariantViolation(
            "PA_07_TARGET_GONE",
            "El usuario destinatario ya no existe."
          );
        }
        if (!u.isActive || u.deletedAt) {
          throw new InvariantViolation(
            "PA_08_TARGET_INACTIVE",
            "El usuario destinatario está suspendido o eliminado."
          );
        }
        inviteeId = u.id;
        toEmail = u.email;
        toFullName = u.fullName;
      } else {
        // Reintento: por si lo crearon entre la propuesta y la aprobación
        const existing = await tx.user.findUnique({ where: { email } });
        if (existing) {
          if (existing.deletedAt || !existing.isActive) {
            throw new InvariantViolation(
              "PA_08_TARGET_INACTIVE",
              "El usuario con ese email está suspendido o eliminado."
            );
          }
          inviteeId = existing.id;
          toEmail = existing.email;
          toFullName = existing.fullName;
        } else {
          const created = await tx.user.create({
            data: {
              email,
              fullName,
              role: "PARTNER",
              passwordHash: null,
              isActive: true,
            },
          });
          inviteeId = created.id;
          toEmail = created.email;
          toFullName = created.fullName;
          wasNewUser = true;

          const tokenInfo = await createPasswordSetupToken(
            tx,
            created.id,
            "INITIAL_SETUP"
          );
          setupToken = tokenInfo.token;
          setupExpiresAt = tokenInfo.expiresAt;

          await recordAudit(tx, {
            actorId: input.adminId,
            projectId: pending.projectId,
            action: "USER.CREATED",
            entityType: "User",
            entityId: created.id,
            payload: {
              role: "PARTNER",
              source: "FOUNDER_INVITE_APPROVED",
              awaitingPasswordSetup: true,
              pendingAssignmentId: pending.id,
            },
          });
        }
      }

      const reason =
        pending.reason ??
        `Asignación aprobada por admin (propuesta de invitación directa) — ${pending.shareCount} acciones.`;

      const r = await assignSharesToInvestor({
        tx,
        projectId: pending.projectId,
        projectSlug: pending.project.slug,
        actorId: input.adminId,
        toUserId: inviteeId,
        shareCount: pending.shareCount,
        reason,
      });
      participationId = r.participationId;
      certificateId = r.certificateId;
      certificateSerial = r.certificateSerial;
      newSerial = r.newSerial;
      shareCount = r.shareCount;
      toUserId = inviteeId;
    }

    // Marcar pending como aprobada
    await tx.pendingAssignment.update({
      where: { id: pending.id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedById: input.adminId,
      },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: pending.projectId,
      action: "PARTICIPATION.ASSIGN_APPROVED",
      entityType: "PendingAssignment",
      entityId: pending.id,
      payload: {
        source: pending.source,
        participationId,
        toUserId,
        shareCount,
      },
    });

    return {
      pendingId: pending.id,
      source: pending.source,
      participationId,
      certificateId,
      certificateSerial,
      newSerial,
      shareCount,
      toUserId,
      toEmail,
      toFullName,
      wasNewUser,
      setupToken,
      setupExpiresAt,
      projectId: pending.projectId,
      projectSlug: pending.project.slug,
      projectName: pending.project.name,
      proposerEmail: pending.proposedBy.email,
      proposerFullName: pending.proposedBy.fullName,
    };
  });
}

// ─── Rechazar ───────────────────────────────────────────────────────

export type RejectPendingInput = {
  pendingId: string;
  adminId: string;
  note: string;
};

export type RejectPendingResult = {
  pendingId: string;
  source: "LEAD" | "INVITE";
  projectId: string;
  projectSlug: string;
  projectName: string;
  proposerEmail: string;
  proposerFullName: string;
  recipientLabel: string;
  shareCount: number;
  note: string;
};

export async function rejectPendingAssignment(
  input: RejectPendingInput
): Promise<RejectPendingResult> {
  const note = input.note.trim();
  if (note.length < 10) {
    throw new ValidationError(
      "note",
      "La nota de rechazo debe tener al menos 10 caracteres."
    );
  }

  return prisma.$transaction(async (tx) => {
    await assertAdmin(tx, input.adminId);

    const pending = await tx.pendingAssignment.findUnique({
      where: { id: input.pendingId },
      include: {
        project: { select: { id: true, slug: true, name: true } },
        proposedBy: { select: { email: true, fullName: true } },
        lead: { select: { id: true, status: true } },
        targetUser: { select: { email: true, fullName: true } },
      },
    });
    if (!pending) throw new NotFoundError("PendingAssignment", input.pendingId);
    if (pending.status !== "PENDING") {
      throw new InvariantViolation(
        "PA_03_NOT_PENDING",
        `La propuesta ya fue resuelta (${pending.status}).`
      );
    }

    await tx.pendingAssignment.update({
      where: { id: pending.id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedById: input.adminId,
        reviewNote: note,
      },
    });

    // Si vino de un lead, lo devolvemos a OPEN para que el founder pueda
    // revisarlo de nuevo. (Si ya estaba CONTACTED, lo bajamos a OPEN por
    // simplicidad — el founder puede volver a marcarlo contactado.)
    if (pending.source === "LEAD" && pending.leadId && pending.lead) {
      if (
        pending.lead.status === "OPEN" ||
        pending.lead.status === "CONTACTED"
      ) {
        await tx.lead.update({
          where: { id: pending.leadId },
          data: { status: "OPEN" },
        });
      }
    }

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: pending.projectId,
      action: "PARTICIPATION.ASSIGN_REJECTED",
      entityType: "PendingAssignment",
      entityId: pending.id,
      payload: {
        source: pending.source,
        shareCount: pending.shareCount,
        note,
      },
    });

    const recipientLabel =
      pending.targetUser?.fullName ??
      pending.inviteFullName ??
      pending.inviteEmail ??
      "destinatario";

    return {
      pendingId: pending.id,
      source: pending.source,
      projectId: pending.projectId,
      projectSlug: pending.project.slug,
      projectName: pending.project.name,
      proposerEmail: pending.proposedBy.email,
      proposerFullName: pending.proposedBy.fullName,
      recipientLabel,
      shareCount: pending.shareCount,
      note,
    };
  });
}

// ─── Wrapper interno: assignSharesFromLead dentro de una tx ─────────
//
// `assignSharesFromLead` (en share-assignment.ts) corre en su propia
// transacción de top-level. Pero acá ya estamos dentro de una tx (la de
// approvePendingAssignment), así que necesitamos una variante que reciba la
// `tx` y haga todo dentro. Para no romper la función existente (que sigue
// siendo el entrypoint público), inlineamos el cuerpo equivalente acá.

type AssignFromLeadInTxArgs = {
  tx: Tx;
  leadId: string;
  actorId: string;
  adminApproved: boolean;
  effectiveAt?: Date;
};

type AssignFromLeadInTxResult = {
  participationId: string;
  newSerial: string;
  shareCount: number;
  toUserId: string;
  certificateId: string;
  certificateSerial: string;
};

async function assignSharesFromLeadWithinTx(
  args: AssignFromLeadInTxArgs
): Promise<AssignFromLeadInTxResult> {
  const { tx } = args;
  const lead = await tx.lead.findUnique({
    where: { id: args.leadId },
    include: {
      project: {
        select: { id: true, slug: true, ownerId: true, name: true, status: true },
      },
      user: {
        select: { id: true, fullName: true, email: true, isActive: true, deletedAt: true },
      },
    },
  });
  if (!lead) throw new NotFoundError("Lead", args.leadId);
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

  const effectiveAt = args.effectiveAt ?? new Date();
  const remaining = pool.shareCount - lead.shareCountRequested;
  if (remaining === 0) {
    await tx.participation.delete({ where: { id: pool.id } });
  } else {
    await tx.participation.update({
      where: { id: pool.id },
      data: { shareCount: remaining },
    });
  }

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

  const reason = args.adminApproved
    ? `Asignación aprobada por admin desde lead ${lead.id} — ${lead.shareCountRequested} acciones.`
    : `Asignación desde lead ${lead.id} — ${lead.shareCountRequested} acciones.`;
  const payload = {
    participationId: participation.id,
    fromUserId: null,
    toUserId: lead.user.id,
    authorizedById: args.actorId,
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
      toUserId: lead.user.id,
      authorizedById: args.actorId,
      coAuthorizedById: null,
      reason,
      resaleListingId: null,
      effectiveAt,
      blockHash,
      prevHash: null,
    },
  });

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
      pdfStorageKey: "",
      watermarkSeed,
      disclaimerHash,
    },
  });

  await tx.lead.update({
    where: { id: lead.id },
    data: { status: "CONVERTED", resolvedAt: new Date() },
  });

  await recordAudit(tx, {
    actorId: args.actorId,
    projectId: lead.project.id,
    action: "PARTICIPATION.ASSIGNED",
    entityType: "Participation",
    entityId: participation.id,
    payload: {
      leadId: lead.id,
      toUserId: lead.user.id,
      shareCount: lead.shareCountRequested,
      serial,
      adminApproved: args.adminApproved,
    },
  });
  await recordAudit(tx, {
    actorId: args.actorId,
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
    certificateSerial: certSerial,
  };
}

// `assignSharesFromLead` (export del módulo share-assignment) sigue siendo el
// entrypoint público para callers que quieran asignar fuera de tx. Internamente
// acá no lo usamos porque ya estamos dentro de una transacción.
void assignSharesFromLead;
