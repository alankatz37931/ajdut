import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { MetricsEditor } from "./MetricsEditor";

type Params = { params: Promise<{ projectSlug: string }> };

export const metadata = { title: "Métricas · AJDUT" };

export default async function FounderMetricsPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: {
        include: { metrics: { orderBy: { asOf: "desc" } } },
      },
    },
  });
  if (!project) notFound();
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
        section="Métricas"
        description="Snapshot numérico del proyecto. Cada métrica queda vinculada a una fecha; las marcadas como visibles para miembros se muestran en la ficha pública."
      />

      <MetricsEditor projectSlug={projectSlug} initial={metrics} />
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
