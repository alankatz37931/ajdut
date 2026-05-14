"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { createInterestLead } from "@/lib/services/interest";
import { DomainError } from "@/lib/services/errors";
import {
  notifyFounderNewInterest,
  notifyInvestorInterestReceived,
  notifyAdminsNewInterest,
} from "@/lib/email/notifications";

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
