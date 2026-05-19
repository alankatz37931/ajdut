"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { recordAudit } from "@/lib/services/audit";
import { notifyMembersReportPublished } from "@/lib/email/notifications";

export type PublishReportResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

export type DeleteReportResult =
  | { ok: true }
  | { ok: false; error: string };

// Mismos estados que `avisos/` para identificar socios "asignados" del proyecto.
const ASSIGNED_STATUSES = [
  "ASSIGNED",
  "IN_RESALE",
  "TRANSFER_PENDING",
  "IN_NEGOTIATION",
] as const;

const REPORT_PERIODS = ["Q1", "Q2", "Q3", "Q4", "ANNUAL", "EXTRAORDINARY"] as const;
const REPORT_KINDS = [
  "QUARTERLY_FINANCIAL",
  "INVESTOR_UPDATE",
  "ANNUAL_AUDIT",
  "EXTRAORDINARY",
] as const;

const PERIOD_LABEL: Record<(typeof REPORT_PERIODS)[number], string> = {
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
  ANNUAL: "Anual",
  EXTRAORDINARY: "Extraordinario",
};

const KIND_LABEL: Record<(typeof REPORT_KINDS)[number], string> = {
  QUARTERLY_FINANCIAL: "Trimestral",
  INVESTOR_UPDATE: "Update",
  ANNUAL_AUDIT: "Auditoría anual",
  EXTRAORDINARY: "Extraordinario",
};

const reportSchema = z.object({
  title: z.string().trim().min(1, "El título no puede estar vacío.").max(160, "El título no puede superar los 160 caracteres."),
  summary: z.string().trim().min(1, "El resumen no puede estar vacío.").max(1000, "El resumen no puede superar los 1000 caracteres."),
  fiscalYear: z
    .number({ invalid_type_error: "El año fiscal debe ser un número." })
    .int("El año fiscal debe ser un entero.")
    .min(1900, "Año fiscal inválido.")
    .max(2999, "Año fiscal inválido."),
  period: z.enum(REPORT_PERIODS),
  kind: z.enum(REPORT_KINDS),
  url: z
    .string()
    .trim()
    .min(1, "La URL del archivo es obligatoria.")
    .url("La URL del archivo no es válida."),
});

async function loadMemberEmails(projectId: string): Promise<string[]> {
  const parts = await prisma.participation.findMany({
    where: {
      projectId,
      isPlatformStake: false,
      currentOwnerId: { not: null },
      status: { in: [...ASSIGNED_STATUSES] },
    },
    select: { currentOwner: { select: { email: true } } },
  });
  const emails = new Set<string>();
  for (const p of parts) {
    const email = p.currentOwner?.email;
    if (email) emails.add(email);
  }
  return [...emails];
}

function humanPeriod(period: (typeof REPORT_PERIODS)[number], year: number): string {
  if (period === "ANNUAL") return `Anual ${year}`;
  if (period === "EXTRAORDINARY") return `Extraordinario ${year}`;
  return `${period} ${year}`;
}

export async function publishReportAction(
  projectSlug: string,
  formData: FormData
): Promise<PublishReportResult> {
  const user = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, name: true, slug: true, ownerId: true, status: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado." };

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canEdit) {
    return { ok: false, error: "No tenés permiso para publicar reportes en este proyecto." };
  }

  const fiscalYearRaw = String(formData.get("fiscalYear") ?? "").trim();
  const parsed = reportSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    fiscalYear: fiscalYearRaw === "" ? NaN : Number(fiscalYearRaw),
    period: String(formData.get("period") ?? ""),
    kind: String(formData.get("kind") ?? ""),
    url: String(formData.get("url") ?? ""),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Datos inválidos.",
      field: first?.path[0] ? String(first.path[0]) : undefined,
    };
  }
  const data = parsed.data;

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const report = await tx.report.create({
        data: {
          projectId: project.id,
          kind: data.kind,
          period: data.period,
          fiscalYear: data.fiscalYear,
          title: data.title,
          summary: data.summary,
          storageKey: data.url,
          fileMime: "application/pdf",
          fileSizeKb: 0,
          publishedBy: user.id,
        },
      });
      await recordAudit(tx, {
        actorId: user.id,
        projectId: project.id,
        action: "REPORT.PUBLISHED",
        entityType: "Report",
        entityId: report.id,
        payload: {
          kind: data.kind,
          period: data.period,
          fiscalYear: data.fiscalYear,
          title: data.title,
        },
      });
      return report;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const periodHuman = humanPeriod(data.period, data.fiscalYear);
      return {
        ok: false,
        error: `Ya hay un reporte publicado para ${periodHuman} · tipo ${KIND_LABEL[data.kind]}.`,
      };
    }
    const msg = e instanceof Error ? e.message : "Error inesperado al publicar el reporte.";
    return { ok: false, error: msg };
  }

  revalidatePath(`/founder/${projectSlug}/reportes`);
  revalidatePath(`/founder/${projectSlug}`);
  revalidatePath(`/proyectos/${projectSlug}`);

  // Aviso por email a todos los socios — fire-and-forget, no bloquea respuesta.
  after(async () => {
    const emails = await loadMemberEmails(project.id);
    if (emails.length === 0) return;
    await notifyMembersReportPublished({
      to: emails,
      projectName: project.name,
      reportTitle: data.title,
      period: humanPeriod(data.period, data.fiscalYear),
      kindLabel: KIND_LABEL[data.kind],
      summary: data.summary,
      url: data.url,
    });
  });

  return { ok: true, id: created.id };
}

export async function deleteReportAction(
  projectSlug: string,
  reportId: string
): Promise<DeleteReportResult> {
  const user = await requireSession();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, ownerId: true, status: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado." };

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canEdit) {
    return { ok: false, error: "No tenés permiso para eliminar reportes en este proyecto." };
  }

  const existing = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true, projectId: true },
  });
  if (!existing || existing.projectId !== project.id) {
    return { ok: false, error: "Reporte no encontrado." };
  }

  try {
    await prisma.report.delete({ where: { id: reportId } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error inesperado al eliminar el reporte.";
    return { ok: false, error: msg };
  }

  revalidatePath(`/founder/${projectSlug}/reportes`);
  revalidatePath(`/founder/${projectSlug}`);
  revalidatePath(`/proyectos/${projectSlug}`);

  return { ok: true };
}
