"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { updateProjectInfo, updateAvailableShares } from "@/lib/services/project";
import { DomainError } from "@/lib/services/errors";

export type EditProjectResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

export async function updateProjectInfoAction(
  projectSlug: string,
  formData: FormData
): Promise<EditProjectResult> {
  const user = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado.", code: "NOT_FOUND" };

  const pickStr = (k: string) => {
    const v = formData.get(k);
    return v === null ? undefined : String(v).trim();
  };
  const pickOptionalStr = (k: string) => {
    const v = formData.get(k);
    if (v === null) return undefined;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  const stage = pickStr("stage");
  const kind = pickStr("kind");

  try {
    await updateProjectInfo({
      projectId: project.id,
      actorId: user.id,
      name: pickStr("name"),
      shortPitch: pickStr("shortPitch"),
      description: pickStr("description"),
      kind:
        kind && ["STARTUP", "REAL_ESTATE", "MERCHANDISE", "OTHER"].includes(kind)
          ? (kind as "STARTUP" | "REAL_ESTATE" | "MERCHANDISE" | "OTHER")
          : undefined,
      sector: pickStr("sector"),
      stage:
        stage && ["IDEA", "PRE_SEED", "SEED", "EARLY_REVENUE", "GROWTH", "SCALE"].includes(stage)
          ? (stage as "IDEA" | "PRE_SEED" | "SEED" | "EARLY_REVENUE" | "GROWTH" | "SCALE")
          : undefined,
      location: pickOptionalStr("location"),
      targetRaiseAmount: pickOptionalStr("targetRaiseAmount"),
      oneLiner: pickStr("oneLiner"),
      problemStatement: pickStr("problemStatement"),
      solutionStatement: pickStr("solutionStatement"),
      businessModel: pickStr("businessModel"),
      preMoneyValuation: pickOptionalStr("preMoneyValuation"),
      valuationCurrency: pickStr("valuationCurrency"),
      websiteUrl: pickOptionalStr("websiteUrl"),
      videoUrl: pickOptionalStr("videoUrl"),
      pitchDeckUrl: pickOptionalStr("pitchDeckUrl"),
      dataRoomUrl: pickOptionalStr("dataRoomUrl"),
      assetBackingNote: pickOptionalStr("assetBackingNote"),
      equityStructureNote: pickOptionalStr("equityStructureNote"),
      projectionsUrl: pickOptionalStr("projectionsUrl"),
      planNegociosUrl: pickOptionalStr("planNegociosUrl"),
      estrategiasPeriodicasUrl: pickOptionalStr("estrategiasPeriodicasUrl"),
      estadosFinancierosUrl: pickOptionalStr("estadosFinancierosUrl"),
      estrategiaEmisionUrl: pickOptionalStr("estrategiaEmisionUrl"),
      policyShares: pickOptionalStr("policyShares"),
      policyDividends: pickOptionalStr("policyDividends"),
      dividendsFrequency: pickOptionalStr("dividendsFrequency"),
    });

    // Acciones disponibles (opcional — solo si el founder cambia el valor)
    const availableShares = pickStr("availableShares");
    if (availableShares !== undefined && availableShares !== "") {
      const n = Number.parseInt(availableShares, 10);
      if (Number.isFinite(n)) {
        await updateAvailableShares({
          projectId: project.id,
          actorId: user.id,
          shareCount: n,
        });
      }
    }
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error(e);
    return { ok: false, error: "Error interno." };
  }

  revalidatePath(`/proyectos/${projectSlug}`);
  revalidatePath(`/founder/${projectSlug}`);
  revalidatePath(`/founder/${projectSlug}/editar`);
  redirect(`/founder/${projectSlug}` as Route);
}
