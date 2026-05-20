import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";

type Tx = Prisma.TransactionClient;

/**
 * Garantiza que el actor sea EL FOUNDER del proyecto.
 *
 * Solo el dueño del proyecto (project.ownerId) puede editar la información.
 * Admins NO editan contenido — su rol es operacional (aprobaciones, validaciones).
 * Co-admins tampoco editan información de la página del proyecto.
 */
export async function assertCanEditProject(
  tx: Tx,
  actorId: string,
  projectId: string
): Promise<void> {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { isActive: true },
  });
  if (!actor || !actor.isActive) throw new ForbiddenError("Sesión inválida.");

  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new NotFoundError("Project", projectId);
  if (project.ownerId !== actorId) {
    throw new ForbiddenError("Solo el founder del proyecto puede editar esta información.");
  }
}

export type UpdateAvailableSharesInput = {
  projectId: string;
  actorId: string;
  shareCount: number;
};

/**
 * Actualiza la cantidad de acciones a la venta (pool AVAILABLE).
 *
 * Modelo:
 *  - Toma la Participation con status=AVAILABLE del proyecto (o la crea).
 *  - Setea su shareCount al valor solicitado.
 *  - Si shareCount = 0, elimina el pool.
 *
 * Validación:
 *  - shareCount ≥ 0
 *  - shareCount ≤ Project.totalShares - shares ya asignados (no podemos sobreemitir).
 */
export async function updateAvailableShares(input: UpdateAvailableSharesInput) {
  return prisma.$transaction(async (tx) => {
    await assertCanEditProject(tx, input.actorId, input.projectId);

    if (input.shareCount < 0) {
      throw new ValidationError("shareCount", "La cantidad no puede ser negativa.");
    }

    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      include: {
        participations: { select: { id: true, status: true, shareCount: true } },
      },
    });
    if (!project) throw new NotFoundError("Project", input.projectId);

    const assigned = project.participations
      .filter((p) => p.status !== "AVAILABLE")
      .reduce((s, p) => s + p.shareCount, 0);

    const maxAvailable = project.totalShares - assigned;
    if (input.shareCount > maxAvailable) {
      throw new ValidationError(
        "shareCount",
        `No podés poner más de ${maxAvailable} acciones disponibles (el resto ya está asignado o reservado).`
      );
    }

    const existing = project.participations.find((p) => p.status === "AVAILABLE");

    if (input.shareCount === 0) {
      if (existing) {
        await tx.participation.delete({ where: { id: existing.id } });
      }
    } else if (existing) {
      await tx.participation.update({
        where: { id: existing.id },
        data: { shareCount: input.shareCount },
      });
    } else {
      await tx.participation.create({
        data: {
          projectId: project.id,
          serialCode: `AJDUT-${project.slug.toUpperCase()}-POOL-${Date.now()}`,
          shareCount: input.shareCount,
          status: "AVAILABLE",
          isPlatformStake: false,
        },
      });
    }

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: project.id,
      action: "PROJECT.CREATED",
      entityType: "Project",
      entityId: project.id,
      payload: { event: "AVAILABLE_SHARES_UPDATED", newValue: input.shareCount },
    });

    return { ok: true as const };
  });
}

export type UpdateProjectInfoInput = {
  projectId: string;
  actorId: string;
  name?: string;
  shortPitch?: string;
  description?: string;
  kind?: "STARTUP" | "REAL_ESTATE" | "MERCHANDISE" | "OTHER";
  // Startup-specific
  sector?: string;
  stage?: "IDEA" | "PRE_SEED" | "SEED" | "EARLY_REVENUE" | "GROWTH" | "SCALE";
  location?: string | null;
  targetRaiseAmount?: string | null;
  oneLiner?: string;
  problemStatement?: string;
  solutionStatement?: string;
  businessModel?: string;
  preMoneyValuation?: string | null;
  valuationCurrency?: string;
  websiteUrl?: string | null;
  videoUrl?: string | null;
  // Documentos como URLs externas (drive/dropbox/notion/etc.)
  pitchDeckUrl?: string | null;
  dataRoomUrl?: string | null;
  // Estructura y respaldo (texto informativo)
  assetBackingNote?: string | null;
  equityStructureNote?: string | null;
  // Documentos opcionales adicionales (URLs externas)
  projectionsUrl?: string | null;
  planNegociosUrl?: string | null;
  estrategiasPeriodicasUrl?: string | null;
  estadosFinancierosUrl?: string | null;
  estrategiaEmisionUrl?: string | null;
  // Políticas (texto libre informativo). Acciones y dividendos.
  policyShares?: string | null;
  policyDividends?: string | null;
  dividendsFrequency?: string | null;
};

/**
 * Actualiza datos editables del proyecto y/o su StartupProfile.
 * Todos los campos son opcionales: solo se aplican los que se pasen.
 */
export async function updateProjectInfo(input: UpdateProjectInfoInput) {
  return prisma.$transaction(async (tx) => {
    await assertCanEditProject(tx, input.actorId, input.projectId);

    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      include: { startupProfile: true },
    });
    if (!project) throw new NotFoundError("Project", input.projectId);

    // Validaciones livianas
    if (input.oneLiner !== undefined && input.oneLiner.length > 160) {
      throw new ValidationError("oneLiner", "El one-liner máximo 160 caracteres.");
    }
    if (input.shortPitch !== undefined && input.shortPitch.length > 280) {
      throw new ValidationError("shortPitch", "El pitch máximo 280 caracteres.");
    }

    const projectUpdates: Prisma.ProjectUpdateInput = {};
    if (input.name !== undefined) projectUpdates.name = input.name.trim();
    if (input.shortPitch !== undefined) projectUpdates.shortPitch = input.shortPitch.trim();
    if (input.description !== undefined) projectUpdates.description = input.description.trim();
    if (input.kind !== undefined) projectUpdates.kind = input.kind;

    if (Object.keys(projectUpdates).length > 0) {
      await tx.project.update({ where: { id: project.id }, data: projectUpdates });
    }

    if (project.startupProfile) {
      const profileUpdates: Prisma.StartupProfileUpdateInput = {};
      if (input.sector !== undefined) profileUpdates.sector = input.sector.trim();
      if (input.stage !== undefined) profileUpdates.stage = input.stage;
      if (input.location !== undefined)
        profileUpdates.location = input.location ? input.location.trim() : null;
      if (input.targetRaiseAmount !== undefined) {
        profileUpdates.targetRaiseAmount =
          input.targetRaiseAmount === null || input.targetRaiseAmount === ""
            ? null
            : new Prisma.Decimal(input.targetRaiseAmount);
      }
      if (input.oneLiner !== undefined) profileUpdates.oneLiner = input.oneLiner.trim();
      if (input.problemStatement !== undefined)
        profileUpdates.problemStatement = input.problemStatement.trim();
      if (input.solutionStatement !== undefined)
        profileUpdates.solutionStatement = input.solutionStatement.trim();
      if (input.businessModel !== undefined)
        profileUpdates.businessModel = input.businessModel.trim();
      if (input.preMoneyValuation !== undefined) {
        profileUpdates.preMoneyValuation =
          input.preMoneyValuation === null || input.preMoneyValuation === ""
            ? null
            : new Prisma.Decimal(input.preMoneyValuation);
      }
      if (input.valuationCurrency !== undefined)
        profileUpdates.valuationCurrency = input.valuationCurrency.trim();
      if (input.websiteUrl !== undefined) profileUpdates.websiteUrl = input.websiteUrl || null;
      if (input.videoUrl !== undefined) profileUpdates.videoUrl = input.videoUrl || null;
      if (input.pitchDeckUrl !== undefined)
        profileUpdates.pitchDeckStorageKey = input.pitchDeckUrl || null;
      if (input.dataRoomUrl !== undefined)
        profileUpdates.dataRoomStorageKey = input.dataRoomUrl || null;
      if (input.assetBackingNote !== undefined)
        profileUpdates.assetBackingNote = input.assetBackingNote
          ? input.assetBackingNote.trim() || null
          : null;
      if (input.equityStructureNote !== undefined)
        profileUpdates.equityStructureNote = input.equityStructureNote
          ? input.equityStructureNote.trim() || null
          : null;
      if (input.projectionsUrl !== undefined)
        profileUpdates.projectionsUrl = input.projectionsUrl || null;
      if (input.planNegociosUrl !== undefined)
        profileUpdates.planNegociosUrl = input.planNegociosUrl || null;
      if (input.estrategiasPeriodicasUrl !== undefined)
        profileUpdates.estrategiasPeriodicasUrl = input.estrategiasPeriodicasUrl || null;
      if (input.estadosFinancierosUrl !== undefined)
        profileUpdates.estadosFinancierosUrl = input.estadosFinancierosUrl || null;
      if (input.estrategiaEmisionUrl !== undefined)
        profileUpdates.estrategiaEmisionUrl = input.estrategiaEmisionUrl || null;
      if (input.policyShares !== undefined)
        profileUpdates.policyShares = input.policyShares
          ? input.policyShares.trim() || null
          : null;
      if (input.policyDividends !== undefined)
        profileUpdates.policyDividends = input.policyDividends
          ? input.policyDividends.trim() || null
          : null;
      if (input.dividendsFrequency !== undefined)
        profileUpdates.dividendsFrequency = input.dividendsFrequency
          ? input.dividendsFrequency.trim() || null
          : null;

      if (Object.keys(profileUpdates).length > 0) {
        await tx.startupProfile.update({
          where: { id: project.startupProfile.id },
          data: profileUpdates,
        });
      }
    }

    await recordAudit(tx, {
      actorId: input.actorId,
      projectId: project.id,
      action: "PROJECT.CREATED",  // reutilizamos esta action; auditLog refleja edición
      entityType: "Project",
      entityId: project.id,
      payload: { event: "PROJECT_INFO_UPDATED" },
    });

    return { ok: true as const };
  });
}

// ─── Crear proyecto (founder) ───────────────────────────────────────

import { derivePriceAndShares } from "@/lib/utils/shares";

export type CreateProjectInput = {
  ownerId: string;
  name: string;
  oneLiner: string;
  description: string;
  sector: string;
  stage: "IDEA" | "PRE_SEED" | "SEED" | "EARLY_REVENUE" | "GROWTH" | "SCALE";
  kind?: "STARTUP" | "REAL_ESTATE" | "MERCHANDISE" | "OTHER";
  location?: string;
  targetRaiseAmount?: number;
  problemStatement: string;
  solutionStatement: string;
  businessModel: string;
  preMoneyValuation: number;
  valuationCurrency: "USD" | "MXN";
  websiteUrl?: string;
  videoUrl?: string;
  legalName: string;
  jurisdiction: string;
  // Estructura y respaldo (texto informativo)
  assetBackingNote?: string | null;
  equityStructureNote?: string | null;
  // Documentos opcionales (URLs externas)
  projectionsUrl?: string | null;
  planNegociosUrl?: string | null;
  estrategiasPeriodicasUrl?: string | null;
  estadosFinancierosUrl?: string | null;
  estrategiaEmisionUrl?: string | null;
  // Políticas (texto libre informativo). Acciones y dividendos.
  policyShares?: string | null;
  policyDividends?: string | null;
  dividendsFrequency?: string | null;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Crea un proyecto STARTUP en estado PENDING_APPROVAL.
 *
 * El admin lo verá en /proyectos y deberá aprobarlo. El cap table (10% AJDUT
 * + pool de acciones disponibles) se materializa en `approveProject`.
 */
export async function createProject(input: CreateProjectInput) {
  if (input.preMoneyValuation <= 0) {
    throw new ValidationError("preMoneyValuation", "La valoración debe ser mayor que cero.");
  }
  if (input.oneLiner.length > 160) {
    throw new ValidationError("oneLiner", "El one-liner máximo 160 caracteres.");
  }

  return prisma.$transaction(async (tx) => {
    const owner = await tx.user.findUnique({
      where: { id: input.ownerId },
      select: { role: true, isActive: true, deletedAt: true },
    });
    if (!owner || !owner.isActive || owner.deletedAt) {
      throw new ForbiddenError("Sesión inválida.");
    }
    if (owner.role !== "PROJECT_OWNER" && owner.role !== "ADMIN") {
      throw new ForbiddenError("Solo founders pueden crear proyectos.");
    }

    const { pricePerShare, totalShares } = derivePriceAndShares(input.preMoneyValuation);
    if (totalShares <= 0) {
      throw new ValidationError(
        "preMoneyValuation",
        "La valoración no permite calcular un total de acciones válido."
      );
    }

    // Generamos un slug único. Si choca, agregamos sufijo numérico.
    const baseSlug = slugify(input.name);
    let slug = baseSlug;
    let suffix = 1;
    while (await tx.project.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const project = await tx.project.create({
      data: {
        slug,
        name: input.name.trim(),
        kind: input.kind ?? "STARTUP",
        status: "PENDING_APPROVAL",
        ownerId: input.ownerId,
        shortPitch: input.oneLiner.trim().slice(0, 280),
        description: input.description.trim(),
        totalShares,
      },
    });

    await tx.startupProfile.create({
      data: {
        projectId: project.id,
        legalName: input.legalName.trim(),
        jurisdiction: input.jurisdiction.trim(),
        location: input.location?.trim() || null,
        targetRaiseAmount:
          input.targetRaiseAmount !== undefined
            ? new Prisma.Decimal(input.targetRaiseAmount)
            : null,
        sector: input.sector.trim(),
        oneLiner: input.oneLiner.trim(),
        problemStatement: input.problemStatement.trim(),
        solutionStatement: input.solutionStatement.trim(),
        businessModel: input.businessModel.trim(),
        stage: input.stage,
        preMoneyValuation: new Prisma.Decimal(input.preMoneyValuation),
        valuationCurrency: input.valuationCurrency,
        totalEquityShares: totalShares,
        platformEquityPercent: new Prisma.Decimal(10),
        websiteUrl: input.websiteUrl?.trim() || null,
        videoUrl: input.videoUrl?.trim() || null,
        assetBackingNote: input.assetBackingNote?.trim() || null,
        equityStructureNote: input.equityStructureNote?.trim() || null,
        projectionsUrl: input.projectionsUrl?.trim() || null,
        planNegociosUrl: input.planNegociosUrl?.trim() || null,
        estrategiasPeriodicasUrl: input.estrategiasPeriodicasUrl?.trim() || null,
        estadosFinancierosUrl: input.estadosFinancierosUrl?.trim() || null,
        estrategiaEmisionUrl: input.estrategiaEmisionUrl?.trim() || null,
        policyShares: input.policyShares?.trim() || null,
        policyDividends: input.policyDividends?.trim() || null,
        dividendsFrequency: input.dividendsFrequency?.trim() || null,
      },
    });

    await recordAudit(tx, {
      actorId: input.ownerId,
      projectId: project.id,
      action: "PROJECT.CREATED",
      entityType: "Project",
      entityId: project.id,
      payload: {
        pricePerShare,
        totalShares,
        valuationCurrency: input.valuationCurrency,
      },
    });

    await recordAudit(tx, {
      actorId: input.ownerId,
      projectId: project.id,
      action: "PROJECT.SUBMITTED_FOR_APPROVAL",
      entityType: "Project",
      entityId: project.id,
    });

    return { project, pricePerShare, totalShares };
  });
}

export type RejectProjectInput = {
  projectId: string;
  adminId: string;
  reason: string;
};

/**
 * Marca un proyecto pendiente como CLOSED con una razón. No hay flujo de
 * reintento — el founder debería crear uno nuevo si quiere insistir.
 */
export async function rejectProject(input: RejectProjectInput) {
  return prisma.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({
      where: { id: input.adminId },
      select: { role: true, isActive: true },
    });
    if (!admin || admin.role !== "ADMIN" || !admin.isActive) {
      throw new ForbiddenError("Solo un ADMIN activo puede rechazar proyectos.");
    }
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { status: true },
    });
    if (!project) throw new NotFoundError("Project", input.projectId);
    if (project.status !== "PENDING_APPROVAL") {
      throw new ValidationError(
        "status",
        `Solo proyectos en PENDING_APPROVAL se pueden rechazar. Actual: ${project.status}.`
      );
    }
    if (input.reason.trim().length < 10) {
      throw new ValidationError("reason", "La razón debe tener al menos 10 caracteres.");
    }

    await tx.project.update({
      where: { id: input.projectId },
      data: {
        status: "CLOSED",
        suspensionReason: input.reason.trim(),
      },
    });

    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: input.projectId,
      action: "PROJECT.CLOSED",
      entityType: "Project",
      entityId: input.projectId,
      payload: { reason: input.reason, by: "admin-rejection-on-approval" },
    });

    return { ok: true as const };
  });
}
