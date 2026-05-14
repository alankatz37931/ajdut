"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { assignSharesFromLead } from "@/lib/services/share-assignment";
import { DomainError } from "@/lib/services/errors";
import { notifyInvestorSharesAssigned } from "@/lib/email/notifications";

export type LeadActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function loadLeadForOwner(leadId: string, actorId: string) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { project: { select: { ownerId: true, slug: true } } },
  });
  if (!lead) return null;
  if (lead.project.ownerId !== actorId) return null;
  return lead;
}

export async function markLeadContactedAction(leadId: string): Promise<LeadActionResult> {
  const user = await requireSession();
  const lead = await loadLeadForOwner(leadId, user.id);
  if (!lead) return { ok: false, error: "Lead no encontrado." };
  if (lead.status !== "OPEN") {
    return { ok: false, error: "Este lead ya está cerrado o resuelto." };
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "CONTACTED" },
  });
  revalidatePath(`/founder/${lead.project.slug}/leads`);
  return { ok: true };
}

export async function dismissLeadAction(leadId: string): Promise<LeadActionResult> {
  const user = await requireSession();
  const lead = await loadLeadForOwner(leadId, user.id);
  if (!lead) return { ok: false, error: "Lead no encontrado." };
  if (lead.status !== "OPEN" && lead.status !== "CONTACTED") {
    return { ok: false, error: "Este lead ya está resuelto." };
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: "DISMISSED", resolvedAt: new Date() },
  });
  revalidatePath(`/founder/${lead.project.slug}/leads`);
  return { ok: true };
}

/**
 * Acepta el lead y ejecuta la asignación de acciones desde el pool AVAILABLE.
 * Llama al service `assignSharesFromLead` que cierra la transacción completa.
 */
export async function acceptLeadAndAssignAction(leadId: string): Promise<LeadActionResult> {
  const user = await requireSession();
  const lead = await loadLeadForOwner(leadId, user.id);
  if (!lead) return { ok: false, error: "Lead no encontrado." };

  let result;
  try {
    result = await assignSharesFromLead({
      leadId: lead.id,
      actorId: user.id,
    });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno al asignar las acciones." };
  }

  revalidatePath(`/founder/${lead.project.slug}/leads`);
  revalidatePath(`/founder/${lead.project.slug}`);
  revalidatePath(`/proyectos/${lead.project.slug}`);
  revalidatePath(`/partner`);

  // Email al inversor
  after(async () => {
    const [project, investor] = await Promise.all([
      prisma.project.findUnique({
        where: { id: lead.projectId },
        select: {
          name: true,
          totalShares: true,
          startupProfile: {
            select: { preMoneyValuation: true, valuationCurrency: true },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: result.toUserId },
        select: { email: true, fullName: true },
      }),
      prisma.certificate.findUnique({
        where: { id: result.certificateId },
        select: { serialCode: true },
      }),
    ]);

    const certificate = await prisma.certificate.findUnique({
      where: { id: result.certificateId },
      select: { serialCode: true },
    });

    if (!project || !investor || !certificate) return;

    const valuation = project.startupProfile?.preMoneyValuation
      ? Number(project.startupProfile.preMoneyValuation)
      : null;
    const currency = project.startupProfile?.valuationCurrency ?? "USD";
    const pricePerShare =
      valuation && project.totalShares > 0 ? valuation / project.totalShares : null;
    const amount = pricePerShare ? pricePerShare * result.shareCount : null;

    const fmtMoney = (n: number) =>
      new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n);

    const investorFirst = investor.fullName.split(" ")[0] ?? investor.fullName;

    await notifyInvestorSharesAssigned({
      to: investor.email,
      investorFirstName: investorFirst,
      projectName: project.name,
      shareCount: result.shareCount,
      amountFormatted: amount !== null ? fmtMoney(amount) : null,
      pricePerShareFormatted: pricePerShare !== null ? fmtMoney(pricePerShare) : null,
      serial: result.newSerial,
      certificateSerial: certificate.serialCode,
    });
  });

  return { ok: true };
}
