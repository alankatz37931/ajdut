"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireRole } from "@/lib/auth/session";
import { createProject } from "@/lib/services/project";
import { DomainError } from "@/lib/services/errors";
import { notifyAdminsNewProjectPending } from "@/lib/email/notifications";
import { prisma } from "@/lib/db/client";

export type CreateProjectResult =
  | { ok: true; slug: string }
  | { ok: false; error: string; code?: string };

const VALID_STAGES = ["IDEA", "PRE_SEED", "SEED", "EARLY_REVENUE", "GROWTH", "SCALE"] as const;
type Stage = (typeof VALID_STAGES)[number];

const VALID_KINDS = ["STARTUP", "REAL_ESTATE", "MERCHANDISE"] as const;
type Kind = (typeof VALID_KINDS)[number];

export async function createProjectAction(
  formData: FormData
): Promise<CreateProjectResult> {
  const user = await requireRole(["PROJECT_OWNER", "ADMIN"]);

  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name");
  const oneLiner = get("oneLiner");
  const description = get("description");
  const sector = get("sector");
  const stageRaw = get("stage");
  const kindRaw = get("kind");
  const location = get("location") || undefined;
  const targetRaiseRaw = get("targetRaiseAmount");
  const problemStatement = get("problemStatement");
  const solutionStatement = get("solutionStatement");
  const businessModel = get("businessModel");
  const valuationRaw = get("preMoneyValuation");
  const currency = get("valuationCurrency") || "USD";
  const websiteUrl = get("websiteUrl") || undefined;
  const videoUrl = get("videoUrl") || undefined;
  const legalName = get("legalName") || name;
  const jurisdiction = get("jurisdiction");
  const assetBackingNote = get("assetBackingNote") || undefined;
  const equityStructureNote = get("equityStructureNote") || undefined;
  const projectionsUrl = get("projectionsUrl") || undefined;
  const planNegociosUrl = get("planNegociosUrl") || undefined;
  const estrategiasPeriodicasUrl = get("estrategiasPeriodicasUrl") || undefined;
  const estadosFinancierosUrl = get("estadosFinancierosUrl") || undefined;
  const estrategiaEmisionUrl = get("estrategiaEmisionUrl") || undefined;
  const policyShares = get("policyShares") || undefined;
  const policyDividends = get("policyDividends") || undefined;
  const dividendsFrequency = get("dividendsFrequency") || undefined;

  if (name.length < 2) return { ok: false, error: "Falta el nombre del proyecto." };
  if (oneLiner.length < 10) return { ok: false, error: "Escribí un one-liner descriptivo." };
  if (description.length < 30) return { ok: false, error: "Agregá una descripción más completa (mín 30 caracteres)." };
  if (sector.length < 2) return { ok: false, error: "Indicá un sector." };
  if (!VALID_STAGES.includes(stageRaw as Stage)) return { ok: false, error: "Stage inválido." };
  const kind: Kind = VALID_KINDS.includes(kindRaw as Kind) ? (kindRaw as Kind) : "STARTUP";
  let targetRaiseAmount: number | undefined;
  if (targetRaiseRaw !== "") {
    const n = Number.parseFloat(targetRaiseRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "El monto a levantar debe ser un número válido." };
    }
    targetRaiseAmount = n;
  }
  if (problemStatement.length < 20) return { ok: false, error: "Contá más sobre el problema (mín 20 caracteres)." };
  if (solutionStatement.length < 20) return { ok: false, error: "Contá más sobre la solución (mín 20 caracteres)." };
  if (businessModel.length < 10) return { ok: false, error: "Definí el modelo de negocio." };
  if (jurisdiction.length < 2) return { ok: false, error: "Indicá la jurisdicción legal." };
  if (currency !== "USD" && currency !== "MXN") {
    return { ok: false, error: "Moneda inválida." };
  }

  const valuation = Number.parseFloat(valuationRaw);
  if (!Number.isFinite(valuation) || valuation <= 0) {
    return { ok: false, error: "Ingresá una valoración válida." };
  }

  let created;
  try {
    created = await createProject({
      ownerId: user.id,
      name,
      oneLiner,
      description,
      sector,
      stage: stageRaw as Stage,
      kind,
      location,
      targetRaiseAmount,
      problemStatement,
      solutionStatement,
      businessModel,
      preMoneyValuation: valuation,
      valuationCurrency: currency as "USD" | "MXN",
      websiteUrl,
      videoUrl,
      legalName,
      jurisdiction,
      assetBackingNote,
      equityStructureNote,
      projectionsUrl,
      planNegociosUrl,
      estrategiasPeriodicasUrl,
      estadosFinancierosUrl,
      estrategiaEmisionUrl,
      policyShares,
      policyDividends,
      dividendsFrequency,
    });
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error(e);
    return { ok: false, error: "Error interno al crear el proyecto." };
  }

  revalidatePath("/proyectos");
  revalidatePath("/founder");

  // Email al admin fire-and-forget
  after(async () => {
    const owner = await prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true, email: true },
    });
    if (!owner) return;
    await notifyAdminsNewProjectPending({
      projectSlug: created.project.slug,
      projectName: created.project.name,
      founderName: owner.fullName,
      founderEmail: owner.email,
      sector,
      stage: stageRaw,
      valuation,
      currency: currency as "USD" | "MXN",
      pricePerShare: created.pricePerShare,
      totalShares: created.totalShares,
      oneLiner,
    });
  });

  redirect(`/founder/${created.project.slug}` as Route);
}
