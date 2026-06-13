import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { MetricsEditor } from "./MetricsEditor";

type Params = { params: Promise<{ projectSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.founderMetricas };
}

export default async function FounderMetricsPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const dict = await getDict();
  const t = dict.founderMetricas;
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: {
        include: { metrics: { orderBy: { asOf: "desc" } } },
      },
    },
  });
  // Soft-delete: un proyecto eliminado ya no existe para el founder — la
  // fuente de verdad es deletedAt (mismo patrón que el dashboard).
  if (!project || project.deletedAt) notFound();
  if (project.ownerId !== user.id) notFound();
  if (!project.startupProfile) notFound();

  const metrics = project.startupProfile.metrics.map((m) => ({
    id: m.id,
    kind: m.kind as MetricsRowKind,
    customLabel: m.customLabel ?? "",
    value: Number(m.value),
    unit: m.unit,
    asOf: m.asOf.toISOString().slice(0, 10),
    visibility: m.visibility as "PRIVATE" | "PUBLIC_TO_HOLDERS",
  }));

  return (
    <div className="max-w-4xl">
      <ProjectHeader
        projectName={project.name}
        projectSlug={project.slug}
        projectStatus={project.status}
        section={t.section}
        description={t.description}
      />

      <MetricsEditor projectSlug={projectSlug} initial={metrics} dict={t} />
    </div>
  );
}

type MetricsRowKind =
  | "MRR"
  | "ARR"
  | "GMV"
  | "ACTIVE_USERS"
  | "PAYING_CUSTOMERS"
  | "CHURN_RATE"
  | "BURN_RATE"
  | "RUNWAY_MONTHS"
  | "CAC"
  | "LTV"
  | "GROSS_MARGIN"
  | "HEADCOUNT"
  | "CUSTOM";
