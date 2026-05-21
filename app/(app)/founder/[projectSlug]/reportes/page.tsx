import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { BackLink } from "@/components/app/BackLink";
import { StatusBadge } from "@/components/founder/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import { ReportForm } from "./ReportForm";
import { DeleteReportButton } from "./DeleteReportButton";

type Params = { params: Promise<{ projectSlug: string }> };

export const metadata = {
  title: "Reportes trimestrales · AJDUT",
};

const REPORT_DESCRIPTION =
  "Compartí avances financieros y de negocio con tu comunidad. Cada miembro recibe un aviso por email cuando publicás.";

const PERIOD_LABEL: Record<string, string> = {
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
  ANNUAL: "Anual",
  EXTRAORDINARY: "Extraordinario",
};

const KIND_LABEL: Record<string, string> = {
  QUARTERLY_FINANCIAL: "Trimestral",
  INVESTOR_UPDATE: "Update",
  ANNUAL_AUDIT: "Auditoría anual",
  EXTRAORDINARY: "Extraordinario",
};

function humanPeriod(period: string, year: number): string {
  if (period === "ANNUAL") return `Anual ${year}`;
  if (period === "EXTRAORDINARY") return `Extraordinario ${year}`;
  return `${PERIOD_LABEL[period] ?? period} ${year}`;
}

export default async function FounderReportsPage({ params }: Params) {
  const user = await requireSession();
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    select: { id: true, name: true, slug: true, ownerId: true, status: true },
  });
  if (!project) notFound();

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canEdit) notFound();

  const reports = await prisma.report.findMany({
    where: { projectId: project.id },
    orderBy: [{ publishedAt: "desc" }],
    select: {
      id: true,
      kind: true,
      period: true,
      fiscalYear: true,
      title: true,
      summary: true,
      storageKey: true,
      publishedAt: true,
    },
  });

  const currentYear = new Date().getFullYear();

  return (
    <div>
      {/* ── Cabecera · breadcrumb ──────────────────────────────────── */}
      <div className="pt-5 sm:pt-7 pb-6 hairline-b flex flex-wrap items-center gap-3">
        <BackLink fallback={`/founder/${project.slug}`}>
          Project owner · {project.name}
        </BackLink>
        <StatusBadge status={project.status} />
      </div>

      {/* ── Formulario · dos columnas ──────────────────────────────── */}
      <ReportForm
        projectSlug={project.slug}
        defaultYear={currentYear}
        heading="Reportes trimestrales"
        description={REPORT_DESCRIPTION}
      />

      {/* ── Historial · ancho completo (solo si ya hay reportes) ───── */}
      {reports.length > 0 && (
        <section className="mt-16 pt-12 hairline-t">
          <div className="mb-8 flex items-baseline justify-between gap-3">
            <p className="eyebrow !text-navy">Historial</p>
            <p className="eyebrow !text-navy/40">
              {reports.length} publicado{reports.length === 1 ? "" : "s"}
            </p>
          </div>

          <ul>
            <li className="hidden sm:grid grid-cols-12 gap-3 pb-2 hairline-b">
              <span className="sm:col-span-2 eyebrow !text-navy/40">Tipo</span>
              <span className="sm:col-span-2 eyebrow !text-navy/40">Período</span>
              <span className="sm:col-span-5 eyebrow !text-navy/40">Título</span>
              <span className="sm:col-span-2 eyebrow !text-navy/40">Publicado</span>
              <span className="sm:col-span-1 eyebrow !text-navy/40 text-right">·</span>
            </li>
            {reports.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-12 items-baseline gap-x-3 gap-y-1 hairline-b py-4"
              >
                <span className="col-span-6 sm:col-span-2 eyebrow !text-navy">
                  {KIND_LABEL[r.kind] ?? r.kind}
                </span>
                <span className="col-span-6 sm:col-span-2 font-mono text-sm text-navy text-right sm:text-left">
                  {humanPeriod(r.period, r.fiscalYear)}
                </span>
                <span className="col-span-12 sm:col-span-5 text-navy break-words">
                  {r.title}
                </span>
                <span className="col-span-6 sm:col-span-2 eyebrow">
                  {formatDate(r.publishedAt)}
                </span>
                <span className="col-span-6 sm:col-span-1 flex flex-col sm:items-end gap-1 text-right">
                  <a
                    href={r.storageKey}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="eyebrow hover:!text-gold transition-colors"
                  >
                    Abrir ↗
                  </a>
                  <DeleteReportButton
                    projectSlug={project.slug}
                    reportId={r.id}
                    reportLabel={`${KIND_LABEL[r.kind] ?? r.kind} · ${humanPeriod(r.period, r.fiscalYear)}`}
                  />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
