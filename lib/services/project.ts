import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { recordAudit } from "./audit";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import {
  computeCapTable,
  equityPercentToShares,
  vestedEquityPercent,
  type CapTableInput,
} from "./cap-table";

type Tx = Prisma.TransactionClient;

/**
 * Include necesario para reconstruir el `CapTableInput` de un proyecto: el
 * equipo fundador (equity%), las tenencias externas y las participaciones con
 * su holder. Lo reutilizan las validaciones de escritura que no pueden pasar
 * el 100% (equipo / composición / disponibles).
 */
export const CAP_TABLE_INCLUDE = {
  startupProfile: {
    select: {
      founders: {
        select: {
          fullName: true,
          equityPercent: true,
          isActive: true,
          shareholderClassId: true,
          vestingMonths: true,
          vestingStartAt: true,
          vestingInitialPercent: true,
          vestingFinalPercent: true,
        },
      },
    },
  },
  externalHoldings: {
    select: {
      label: true,
      shareCount: true,
      shareholderClassId: true,
      peopleCount: true,
    },
  },
  participations: {
    select: {
      id: true,
      status: true,
      shareCount: true,
      isPlatformStake: true,
      shareholderClassId: true,
      currentOwner: { select: { id: true, alias: true, fullName: true } },
    },
  },
} satisfies Prisma.ProjectInclude;

/**
 * Forma mínima estructural que necesita `buildCapTableInput`. Acepta cualquier
 * proyecto cargado con (al menos) `CAP_TABLE_INCLUDE`; no exige campos extra
 * como `participation.id`, así las queries que solo proyectan lo necesario
 * (p.ej. editar/page.tsx) type-checkean sin fricción.
 */
export type CapTableProjectShape = {
  totalShares: number;
  startupProfile: {
    founders: {
      fullName: string;
      equityPercent: Prisma.Decimal;
      isActive: boolean;
      shareholderClassId?: string | null;
      vestingMonths?: number | null;
      vestingStartAt?: Date | null;
      vestingInitialPercent?: Prisma.Decimal | null;
      vestingFinalPercent?: Prisma.Decimal | null;
    }[];
  } | null;
  externalHoldings: {
    label: string | null;
    shareCount: number;
    shareholderClassId?: string | null;
    peopleCount?: number;
  }[];
  participations: {
    status: string;
    shareCount: number;
    isPlatformStake: boolean;
    shareholderClassId?: string | null;
    currentOwner: { id: string; alias: string | null; fullName: string } | null;
  }[];
};

/**
 * Proyecta un proyecto (cargado con `CAP_TABLE_INCLUDE`) al `CapTableInput`
 * unificado. Misma proyección que el dashboard / la ficha pública: solo
 * founders activos cuentan como equity.
 */
export function buildCapTableInput(
  project: CapTableProjectShape
): CapTableInput {
  const total = project.totalShares;
  const now = new Date();
  const activeFounders = (project.startupProfile?.founders ?? []).filter(
    (f) => f.isActive
  );

  // Vesting: el equity de cada founder se entrega en vivo. El cap table muestra
  // lo ENTREGADO (vested); lo no entregado (target − vested) se acumula como
  // `reservedShares` → bloqueado, descuenta del pool, no se da a otros.
  let reservedShares = 0;
  const founders = activeFounders.map((f) => {
    const target = Number(f.equityPercent);
    const vested = vestedEquityPercent(
      target,
      f.vestingMonths,
      f.vestingStartAt,
      now,
      f.vestingInitialPercent != null ? Number(f.vestingInitialPercent) : null,
      f.vestingFinalPercent != null ? Number(f.vestingFinalPercent) : null
    );
    reservedShares +=
      equityPercentToShares(target, total) - equityPercentToShares(vested, total);
    return {
      name: f.fullName,
      equityPercent: vested,
      classId: f.shareholderClassId ?? null,
    };
  });

  return {
    totalShares: total,
    reservedShares: Math.max(0, reservedShares),
    founders,
    externalHoldings: (project.externalHoldings ?? []).map((h) => ({
      label: h.label ?? "",
      shareCount: h.shareCount,
      peopleCount: h.peopleCount,
      classId: h.shareholderClassId ?? null,
    })),
    participations: project.participations.map((p) => ({
      status: p.status,
      shareCount: p.shareCount,
      isPlatformStake: p.isPlatformStake,
      classId: p.shareholderClassId ?? null,
      currentOwner: p.currentOwner
        ? {
            id: p.currentOwner.id,
            alias: p.currentOwner.alias,
            fullName: p.currentOwner.fullName,
          }
        : null,
    })),
  };
}

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
    throw new ForbiddenError("Solo el project owner del proyecto puede editar esta información.");
  }
}

export type UpdateAvailableSharesInput = {
  projectId: string;
  actorId: string;
  shareCount: number;
};

/**
 * Actualiza la cantidad de participaciones a la venta (pool AVAILABLE).
 *
 * Modelo:
 *  - Toma la Participation con status=AVAILABLE del proyecto (o la crea).
 *  - Setea su shareCount al valor solicitado.
 *  - Si shareCount = 0, elimina el pool.
 *
 * El TOTAL emitido del proyecto NO se cambia acá: el project owner puede
 * mover cuántas de las participaciones ya emitidas están a la venta, pero
 * para EMITIR MÁS (superar el total) debe consultarlo con los propietarios.
 *
 * Cap table unificado: el pool disponible es el REMANENTE. El tope real no es
 * `total - asignados` sino `total - comprometido`, donde comprometido =
 * equipo (equity% → participaciones) + tenencias externas + plataforma +
 * asignados (= `capTable.committedShares`). Así "disponibles" nunca empuja el
 * cap table por encima del 100%.
 */
export async function updateAvailableShares(input: UpdateAvailableSharesInput) {
  return prisma.$transaction(async (tx) => {
    await assertCanEditProject(tx, input.actorId, input.projectId);

    if (input.shareCount < 0) {
      throw new ValidationError("shareCount", "La cantidad no puede ser negativa.");
    }

    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      include: CAP_TABLE_INCLUDE,
    });
    if (!project) throw new NotFoundError("Project", input.projectId);

    // `committedShares` ya suma equipo + externas + plataforma + asignados
    // (todo lo NO disponible). El pool no puede exceder el remanente.
    const capTable = computeCapTable(buildCapTableInput(project));
    const maxAvailable = Math.max(0, project.totalShares - capTable.committedShares);
    if (input.shareCount > maxAvailable) {
      throw new ValidationError(
        "shareCount",
        `No podés poner más de ${maxAvailable} participaciones disponibles. El resto ya está comprometido (equipo, tenencias y asignados). Para emitir más, consultá con los propietarios.`
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
  // Fecha a partir de la cual se habilita la reventa de participaciones.
  // String "YYYY-MM-DD" del <input type="date"> o "" / null para limpiar.
  resaleAllowedFrom?: string | null;
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
    // Fecha de inicio de reventa: vacío/null → limpiar (sin restricción). Si
    // viene una fecha, la validamos antes de persistirla.
    if (input.resaleAllowedFrom !== undefined) {
      if (input.resaleAllowedFrom === null || input.resaleAllowedFrom === "") {
        projectUpdates.resaleAllowedFrom = null;
      } else {
        const d = new Date(input.resaleAllowedFrom);
        if (isNaN(d.getTime())) {
          throw new ValidationError("resaleAllowedFrom", "Fecha de reventa inválida.");
        }
        projectUpdates.resaleAllowedFrom = d;
      }
    }

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

// Máximo sano para evitar overflow numérico / inputs absurdos. No es un
// "cap de producto" como el viejo TARGET_MAX_SHARES — el founder define
// libremente el total dentro de este rango.
const MAX_TOTAL_PARTICIPATIONS = 1_000_000_000; // 1e9
// NOTA: `derivePriceAndShares` (lib/utils/shares.ts) ya NO se usa en este
// flujo. La emisión ahora es directa (total + precio). La función queda en
// el repo solo para compat con código/seed legacy.

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
  // Emisión directa: el founder define cuántas participaciones totales emite
  // y a qué precio cada una. La valoración se deriva (total × precio) y se
  // persiste en StartupProfile.preMoneyValuation.
  totalParticipations: number;
  pricePerParticipation: number;
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
 * El admin lo verá en /proyectos y deberá aprobarlo. El pool inicial de
 * acciones disponibles (100% del total) se materializa en `approveProject`.
 */
export async function createProject(input: CreateProjectInput) {
  if (!Number.isInteger(input.totalParticipations) || input.totalParticipations < 1) {
    throw new ValidationError(
      "totalParticipations",
      "El total de participaciones debe ser un entero mayor o igual a 1."
    );
  }
  if (input.totalParticipations > MAX_TOTAL_PARTICIPATIONS) {
    throw new ValidationError(
      "totalParticipations",
      "El total de participaciones excede el límite permitido."
    );
  }
  if (!Number.isFinite(input.pricePerParticipation) || input.pricePerParticipation <= 0) {
    throw new ValidationError(
      "pricePerParticipation",
      "El valor por participación debe ser mayor que cero."
    );
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
      throw new ForbiddenError("Solo project owners pueden crear proyectos.");
    }

    // Emisión directa: el founder define total + precio. La valoración es el
    // producto. Sin algoritmo de derivación ni cap artificial — el total
    // ingresado es exactamente el que se emite.
    const totalShares = input.totalParticipations;
    const pricePerShare = input.pricePerParticipation;
    const valuation = totalShares * pricePerShare;

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
        preMoneyValuation: new Prisma.Decimal(valuation),
        valuationCurrency: input.valuationCurrency,
        totalEquityShares: totalShares,
        platformEquityPercent: new Prisma.Decimal(0),
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
/** Inactiva un proyecto ACTIVE → SUSPENDED. Los miembros dejan de verlo;
 *  owner y admin lo siguen viendo. Reversible con reactivateProject. */
export async function suspendProject(input: { projectId: string; adminId: string }) {
  return prisma.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({
      where: { id: input.adminId },
      select: { role: true, isActive: true },
    });
    if (!admin || admin.role !== "ADMIN" || !admin.isActive) {
      throw new ForbiddenError("Solo un ADMIN activo puede inactivar proyectos.");
    }
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { status: true, deletedAt: true },
    });
    if (!project || project.deletedAt) throw new NotFoundError("Project", input.projectId);
    if (project.status !== "ACTIVE") {
      throw new ValidationError(
        "status",
        `Solo proyectos ACTIVE se pueden inactivar. Actual: ${project.status}.`
      );
    }
    await tx.project.update({
      where: { id: input.projectId },
      data: { status: "SUSPENDED" },
    });
    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: input.projectId,
      action: "PROJECT.SUSPENDED",
      entityType: "Project",
      entityId: input.projectId,
      payload: { by: "admin" },
    });
    return { ok: true as const };
  });
}

/** Reactiva un proyecto SUSPENDED → ACTIVE (vuelve a ser visible para miembros). */
export async function reactivateProject(input: { projectId: string; adminId: string }) {
  return prisma.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({
      where: { id: input.adminId },
      select: { role: true, isActive: true },
    });
    if (!admin || admin.role !== "ADMIN" || !admin.isActive) {
      throw new ForbiddenError("Solo un ADMIN activo puede reactivar proyectos.");
    }
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { status: true, deletedAt: true },
    });
    if (!project || project.deletedAt) throw new NotFoundError("Project", input.projectId);
    if (project.status !== "SUSPENDED") {
      throw new ValidationError(
        "status",
        `Solo proyectos SUSPENDED se pueden reactivar. Actual: ${project.status}.`
      );
    }
    await tx.project.update({
      where: { id: input.projectId },
      data: { status: "ACTIVE" },
    });
    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: input.projectId,
      action: "PROJECT.REACTIVATED",
      entityType: "Project",
      entityId: input.projectId,
      payload: { by: "admin" },
    });
    return { ok: true as const };
  });
}

/** Soft-delete: el proyecto desaparece de la plataforma para todos (las páginas
 *  chequean deletedAt → notFound; el listado lo filtra). Reversible solo en DB. */
export async function softDeleteProject(input: { projectId: string; adminId: string }) {
  return prisma.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({
      where: { id: input.adminId },
      select: { role: true, isActive: true },
    });
    if (!admin || admin.role !== "ADMIN" || !admin.isActive) {
      throw new ForbiddenError("Solo un ADMIN activo puede eliminar proyectos.");
    }
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { deletedAt: true },
    });
    if (!project) throw new NotFoundError("Project", input.projectId);
    if (project.deletedAt) return { ok: true as const }; // idempotente
    await tx.project.update({
      where: { id: input.projectId },
      data: { deletedAt: new Date() },
    });
    await recordAudit(tx, {
      actorId: input.adminId,
      projectId: input.projectId,
      action: "PROJECT.DELETED",
      entityType: "Project",
      entityId: input.projectId,
      payload: { by: "admin" },
    });
    return { ok: true as const };
  });
}

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
