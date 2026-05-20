"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { createInterestLead } from "@/lib/services/interest";
import { createInfoRequest } from "@/lib/services/info-request";
import { DomainError } from "@/lib/services/errors";
import {
  notifyFounderNewInterest,
  notifyInvestorInterestReceived,
  notifyAdminsNewInterest,
  notifyFounderInfoRequest,
} from "@/lib/email/notifications";

const VALID_SUPPORT_KINDS = ["CAPITAL", "SPONSOR", "AMBASSADOR", "ADVISOR", "OTHER"] as const;
type SupportKind = (typeof VALID_SUPPORT_KINDS)[number];

export type InterestResult =
  | { ok: true; leadId: string }
  | { ok: false; error: string; code?: string };

export async function manifestInterestAction(
  projectSlug: string,
  formData: FormData
): Promise<InterestResult> {
  const user = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      owner: { select: { fullName: true, email: true } },
      startupProfile: {
        select: { preMoneyValuation: true, valuationCurrency: true },
      },
      totalShares: true,
    },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado.", code: "NOT_FOUND" };

  const shareCountRaw = String(formData.get("shareCount") ?? "");
  const message = String(formData.get("message") ?? "");
  const supportKindRaw = String(formData.get("supportKind") ?? "").trim().toUpperCase();
  const supportKind: SupportKind | undefined = VALID_SUPPORT_KINDS.includes(
    supportKindRaw as SupportKind
  )
    ? (supportKindRaw as SupportKind)
    : undefined;
  const n = Number.parseInt(shareCountRaw, 10);

  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, error: "Cantidad inválida.", code: "VALIDATION" };
  }
  if (message.length > 2000) {
    return {
      ok: false,
      error: "El mensaje no puede superar los 2000 caracteres.",
      code: "VALIDATION",
    };
  }

  let lead;
  try {
    lead = await createInterestLead({
      projectId: project.id,
      userId: user.id,
      shareCountRequested: n,
      message,
      supportKind,
    });
    revalidatePath(`/proyectos/${projectSlug}`);
    revalidatePath(`/founder/${projectSlug}`);
    revalidatePath(`/founder/${projectSlug}/leads`);
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error(e);
    return { ok: false, error: "Error interno." };
  }

  // ─── Emails fire-and-forget ─────────────────────────────────────
  after(async () => {
    // Cargo el email/nombre del investor (puede haber cambiado tras login)
    const investor = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, fullName: true },
    });
    if (!investor) return;

    const valuation = project.startupProfile?.preMoneyValuation
      ? Number(project.startupProfile.preMoneyValuation)
      : null;
    const currency = project.startupProfile?.valuationCurrency ?? "USD";
    const pricePerShare =
      valuation && project.totalShares > 0
        ? valuation / project.totalShares
        : null;

    const fmtMoney = (amt: number) =>
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amt);

    const amount = pricePerShare ? n * pricePerShare : null;
    const amountFormatted = amount !== null ? fmtMoney(amount) : null;
    const priceFormatted = pricePerShare !== null ? fmtMoney(pricePerShare) : null;

    const investorFirst = investor.fullName.split(" ")[0] ?? investor.fullName;
    const founderFirst = project.owner.fullName.split(" ")[0] ?? project.owner.fullName;

    await Promise.allSettled([
      // Al founder del proyecto
      notifyFounderNewInterest({
        to: project.owner.email,
        projectSlug: project.slug,
        founderFirstName: founderFirst,
        projectName: project.name,
        investorName: investor.fullName,
        investorEmail: investor.email,
        sharesRequested: n,
        amountFormatted,
        pricePerShareFormatted: priceFormatted,
        message,
      }),
      // Al inversor: confirmación
      notifyInvestorInterestReceived({
        to: investor.email,
        projectSlug: project.slug,
        investorFirstName: investorFirst,
        projectName: project.name,
        founderName: project.owner.fullName,
        sharesRequested: n,
        amountFormatted,
        pricePerShareFormatted: priceFormatted,
      }),
      // Al equipo de admins: heads-up de actividad
      notifyAdminsNewInterest({
        projectSlug: project.slug,
        projectName: project.name,
        investorName: investor.fullName,
        investorEmail: investor.email,
        sharesRequested: n,
        amountFormatted,
        pricePerShareFormatted: priceFormatted,
        message,
      }),
    ]);
  });

  return { ok: true, leadId: lead.id };
}

// ─── ETAPA 1 — "Quiero más información" ─────────────────────────────

export type InfoRequestResult =
  | { ok: true; infoRequestId: string }
  | { ok: false; error: string; code?: string };

/**
 * Crea una InfoRequest (etapa 1 del flujo). El founder la verá en sus leads y
 * podrá aprobar / rechazar. Si aprueba: el viewer ve documentos / reportes y
 * habilita el botón "Me interesa participar" (etapa 2).
 */
export async function requestProjectInfoAction(
  projectSlug: string,
  formData: FormData
): Promise<InfoRequestResult> {
  const user = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      owner: { select: { fullName: true, email: true } },
    },
  });
  if (!project) {
    return { ok: false, error: "Proyecto no encontrado.", code: "NOT_FOUND" };
  }

  const message = String(formData.get("message") ?? "");
  if (message.length > 2000) {
    return {
      ok: false,
      error: "El mensaje no puede superar los 2000 caracteres.",
      code: "VALIDATION",
    };
  }

  let infoRequest;
  try {
    infoRequest = await createInfoRequest({
      projectId: project.id,
      requesterId: user.id,
      message,
    });
    revalidatePath(`/proyectos/${projectSlug}`);
    revalidatePath(`/founder/${projectSlug}/leads`);
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: e.message, code: e.code };
    }
    console.error(e);
    return { ok: false, error: "Error interno." };
  }

  // Email al founder fire-and-forget. Solo si la solicitud quedó en PENDING
  // (idempotencia: si ya estaba APPROVED, no spameamos al founder).
  if (infoRequest.status === "PENDING") {
    after(async () => {
      const requester = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, fullName: true },
      });
      if (!requester) return;
      const founderFirst =
        project.owner.fullName.split(" ")[0] ?? project.owner.fullName;
      await notifyFounderInfoRequest({
        to: project.owner.email,
        projectSlug: project.slug,
        founderFirstName: founderFirst,
        projectName: project.name,
        requesterName: requester.fullName,
        requesterEmail: requester.email,
        message,
      });
    });
  }

  return { ok: true, infoRequestId: infoRequest.id };
}
