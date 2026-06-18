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
import { normalizeOptionalUrl } from "@/lib/utils/url";

export type CreateProjectResult =
  | { ok: true; slug: string }
  | { ok: false; error: string; code?: string };

const VALID_STAGES = ["IDEA", "PRE_SEED", "SEED", "EARLY_REVENUE", "GROWTH", "SCALE"] as const;
type Stage = (typeof VALID_STAGES)[number];

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
  const kind = get("kind");
  const location = get("location") || undefined;
  const targetRaiseRaw = get("targetRaiseAmount");
  const problemStatement = get("problemStatement");
  const solutionStatement = get("solutionStatement");
  const businessModel = get("businessModel");
  const totalParticipationsRaw = get("totalParticipations");
  const pricePerParticipationRaw = get("pricePerParticipation");
  const currency = get("valuationCurrency") || "USD";
  const legalName = get("legalName") || name;
  const jurisdiction = get("jurisdiction");
  const assetBackingNote = get("assetBackingNote") || undefined;
  const equityStructureNote = get("equityStructureNote") || undefined;
  const policyShares = get("policyShares") || undefined;

  // Todas las URLs externas pasan por normalizeOptionalUrl: rechaza
  // protocolos no-http(s) (javascript:, data:, etc.) que se ejecutarían
  // al click del viewer. Vacío → undefined para no pisar valores existentes.
  const urlFields = [
    "websiteUrl",
    "videoUrl",
    "projectionsUrl",
    "planNegociosUrl",
    "estrategiasPeriodicasUrl",
    "estadosFinancierosUrl",
    "estrategiaEmisionUrl",
  ] as const;
  const urls: Partial<Record<(typeof urlFields)[number], string | undefined>> = {};
  for (const field of urlFields) {
    const normalized = normalizeOptionalUrl(get(field));
    if (normalized === "INVALID") {
      return { ok: false, error: `URL invalida en ${field} — solo http/https.` };
    }
    urls[field] = normalized ?? undefined;
  }
  const policyDividends = get("policyDividends") || undefined;
  const dividendsFrequency = get("dividendsFrequency") || undefined;

  if (name.length < 2) return { ok: false, error: "Falta el nombre del proyecto." };
  if (oneLiner.length < 10) return { ok: false, error: "Falta un one-liner descriptivo." };
  if (description.length < 30) return { ok: false, error: "La descripción necesita más detalle (mín 30 caracteres)." };
  if (kind.length < 2) return { ok: false, error: "Falta el tipo." };
  if (!VALID_STAGES.includes(stageRaw as Stage)) return { ok: false, error: "Stage inválido." };
  let targetRaiseAmount: number | undefined;
  if (targetRaiseRaw !== "") {
    const n = Number.parseFloat(targetRaiseRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "El monto a levantar debe ser un número válido." };
    }
    targetRaiseAmount = n;
  }
  if (problemStatement.length < 20) return { ok: false, error: "El problema necesita más detalle (mín 20 caracteres)." };
  if (solutionStatement.length < 20) return { ok: false, error: "La solución necesita más detalle (mín 20 caracteres)." };
  if (businessModel.length < 10) return { ok: false, error: "Falta el modelo de negocio." };
  if (jurisdiction.length < 2) return { ok: false, error: "Falta la jurisdicción legal." };
  if (currency !== "USD" && currency !== "MXN") {
    return { ok: false, error: "Moneda inválida." };
  }

  // Emisión directa: el founder define el total de participaciones y el
  // valor por participación. La valoración se deriva (total × precio).
  const totalParticipations = Number.parseInt(totalParticipationsRaw, 10);
  if (!Number.isFinite(totalParticipations) || totalParticipations < 1) {
    return {
      ok: false,
      error: "El total de participaciones debe ser un entero válido (≥ 1).",
    };
  }
  // Máximo sano para evitar overflow (el dominio reaplica el mismo límite).
  if (totalParticipations > 1_000_000_000) {
    return {
      ok: false,
      error: "El total de participaciones excede el límite permitido.",
    };
  }
  const pricePerParticipation = Number.parseFloat(pricePerParticipationRaw);
  if (!Number.isFinite(pricePerParticipation) || pricePerParticipation <= 0) {
    return { ok: false, error: "El valor por participación no es válido." };
  }
  // Cap defensivo sobre la valoración derivada: > USD 1 cuatrillón es siempre
  // input erróneo (o intento de overflow numérico).
  const valuation = totalParticipations * pricePerParticipation;
  if (valuation > 1e15) {
    return { ok: false, error: "La valoración derivada excede el límite permitido." };
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
      totalParticipations,
      pricePerParticipation,
      valuationCurrency: currency as "USD" | "MXN",
      websiteUrl: urls.websiteUrl,
      videoUrl: urls.videoUrl,
      legalName,
      jurisdiction,
      assetBackingNote,
      equityStructureNote,
      projectionsUrl: urls.projectionsUrl,
      planNegociosUrl: urls.planNegociosUrl,
      estrategiasPeriodicasUrl: urls.estrategiasPeriodicasUrl,
      estadosFinancierosUrl: urls.estadosFinancierosUrl,
      estrategiaEmisionUrl: urls.estrategiaEmisionUrl,
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
