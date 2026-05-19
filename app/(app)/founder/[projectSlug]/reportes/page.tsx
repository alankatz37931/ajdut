import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { BackLink } from "@/components/app/BackLink";
import { formatDate } from "@/lib/utils/format";
import { ReportForm } from "./ReportForm";
import { DeleteReportButton } from "./DeleteReportButton";

type Params = { params: Promise<{ projectSlug: string }> };

export const metadata = {
  title: "Reportes trimestrales · AJDUT",
};

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
    <div className="max-w-3xl">
      <BackLink fallback={`/founder/${projectSlug}`}>
        ← {project.name}
      </BackLink>

      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Founder</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Reportes trimestrales</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">
          Compartí avances financieros y de negocio con tus socios. Publicá el reporte y todos
          los socios reciben un aviso por email con el link al archivo.
        </p>
      </header>

      <ReportForm projectSlug={project.slug} defaultYear={currentYear} />

      <section className="mt-12">
        <p className="font-mono text-sm tracking-wider mb-4">
          <span className="text-gold">02</span>{" "}
          <span className="text-navy">· Historial</span>
        </p>

        {reports.length === 0 ? (
          <p className="text-navy/60">Todavía no publicaste ningún reporte.</p>
        ) : (
          <ul className="space-y-0">
            {/* Encabezado de columnas: solo desktop, mismo patrón que /founder/leads */}
            <li className="hidden sm:grid grid-cols-12 gap-3 pb-1">
              <span className="sm:col-span-2 eyebrow !text-navy/40">Tipo</span>
              <span className="sm:col-span-2 eyebrow !text-navy/40">Período</span>
              <span className="sm:col-span-5 eyebrow !text-navy/40">Título</span>
              <span className="sm:col-span-2 eyebrow !text-navy/40">Publicado</span>
              <span className="sm:col-span-1 eyebrow !text-navy/40 text-right">·</span>
            </li>
            {reports.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-12 items-baseline gap-x-3 gap-y-1 hairline-b py-3"
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
                    className="eyebrow hover:!text-gold"
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
        )}
      </section>
    </div>
  );
}
