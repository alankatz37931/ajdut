import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
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
    <div className="max-w-3xl">
      <Link href={`/founder/${projectSlug}` as Route} className="eyebrow hover:!text-gold">
        ← {project.name}
      </Link>
      <header className="mt-6 hairline-b pb-8">
        <h1 className="font-sans text-h1 text-navy">Métricas</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Snapshot numérico del proyecto. Cada métrica queda vinculada a una fecha; las que
          marques como <span className="font-mono">PUBLIC_TO_HOLDERS</span> se muestran en la página
          del proyecto.
        </p>
      </header>

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
