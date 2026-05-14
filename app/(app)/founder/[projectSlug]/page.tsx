import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Section } from "@/components/ui/Section";
import { formatNumber, formatPercent, formatCurrency, formatDate } from "@/lib/utils/format";

type Params = { params: Promise<{ projectSlug: string }> };

export default async function FounderDashboardPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: {
        include: {
          founders: true,
          milestones: { orderBy: { createdAt: "desc" }, take: 6 },
          metrics: { orderBy: { asOf: "desc" }, take: 12 },
        },
      },
      participations: { select: { id: true, status: true, shareCount: true, isPlatformStake: true } },
    },
  });

  if (!project) notFound();

  // El "workspace" del founder es estrictamente del dueño del proyecto.
  // Admins ven los proyectos desde /admin o /proyectos/[slug] en modo lectura.
  if (project.ownerId !== user.id) notFound();

  const totalShares = project.totalShares;
  const assigned = project.participations
    .filter((p) => ["ASSIGNED", "IN_RESALE", "TRANSFER_PENDING"].includes(p.status))
    .reduce((sum, p) => sum + p.shareCount, 0);
  const available = project.participations
    .filter((p) => p.status === "AVAILABLE")
    .reduce((sum, p) => sum + p.shareCount, 0);
  const platform = project.participations
    .filter((p) => p.isPlatformStake)
    .reduce((sum, p) => sum + p.shareCount, 0);

  const isAdminViewer = user.role === "ADMIN" && project.ownerId !== user.id;

  return (
    <div>
      {isAdminViewer && (
        <div className="surface-cement mb-8 px-6 py-3">
          <span className="eyebrow !text-paper">Modo Admin · {project.name}</span>
        </div>
      )}

      <header className="flex flex-col gap-6 hairline-b pb-8 sm:pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:max-w-2xl">
          <p className="eyebrow">
            {project.startupProfile?.sector ?? project.kind}
            {project.startupProfile?.stage ? ` · ${project.startupProfile.stage}` : ""}
          </p>
          <h1 className="font-sans mt-4 sm:mt-6 text-h1 text-navy">{project.name}</h1>
          <p className="mt-3 sm:mt-4 text-navy/75 leading-relaxed">
            “{project.startupProfile?.oneLiner ?? project.shortPitch}”
          </p>
        </div>
        <div className="sm:text-right shrink-0">
          <span className="eyebrow">◐ {project.status}</span>
          {project.approvedAt && (
            <p className="mt-2 eyebrow">Aprobado {formatDate(project.approvedAt)}</p>
          )}
        </div>
      </header>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={`/proyectos/${project.slug}` as Route} className="btn-primary">
          Ver página del proyecto →
        </Link>
        <Link href={`/founder/${project.slug}/editar` as Route} className="btn-outline">
          ✎ Editar información
        </Link>
        <Link href={`/founder/${project.slug}/leads` as Route} className="btn-outline">
          Interés de compra →
        </Link>
        <Link href={"/founder/nuevo-proyecto" as Route} className="eyebrow hover:!text-gold self-center ml-2">
          + Otro proyecto
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 hairline-t pt-4">
        <Link href={`/founder/${project.slug}/equipo` as Route} className="eyebrow hover:!text-gold">
          Editar equipo →
        </Link>
        <span className="eyebrow !text-navy/30">·</span>
        <Link href={`/founder/${project.slug}/hitos` as Route} className="eyebrow hover:!text-gold">
          Editar hitos →
        </Link>
        <span className="eyebrow !text-navy/30">·</span>
        <Link href={`/founder/${project.slug}/metricas` as Route} className="eyebrow hover:!text-gold">
          Editar métricas →
        </Link>
      </div>

      <Section title="Instantánea">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <KpiCard label="Participaciones totales" value={formatNumber(totalShares)} hint="totales" />
          <KpiCard
            label="Distribuidas"
            value={formatNumber(assigned)}
            hint={formatPercent((assigned / totalShares) * 100)}
          />
          <KpiCard
            label="Disponibles"
            value={formatNumber(available)}
            hint={formatPercent((available / totalShares) * 100)}
          />
          <KpiCard
            label="AJDUT plataforma"
            value={formatNumber(platform)}
            hint={formatPercent((platform / totalShares) * 100)}
            highlight
          />
        </div>

        {project.startupProfile?.preMoneyValuation && (
          <div className="mt-px grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
            <KpiCard
              label="Última valoración"
              value={formatCurrency(
                Number(project.startupProfile.preMoneyValuation),
                project.startupProfile.valuationCurrency
              )}
              hint="pre-money"
            />
            <KpiCard label="Founders" value={String(project.startupProfile.founders.length)} hint="activos" />
            <KpiCard label="Hitos" value={String(project.startupProfile.milestones.length)} hint="registrados" />
            <KpiCard label="Métricas" value={String(project.startupProfile.metrics.length)} hint="históricas" />
          </div>
        )}
      </Section>

      <Section
        title="Cap table"
        actionLabel="Ver detalle"
        actionHref={`/proyectos/${project.slug}` as Route}
      >
        <p className="text-navy/60">
          Quiénes tienen acciones de tu compañía y cuántas. El detalle vivo está en la página
          pública del proyecto.
        </p>
      </Section>

      <Section
        title="Hitos"
        actionLabel="Editar"
        actionHref={`/founder/${project.slug}/hitos` as Route}
      >
        {project.startupProfile?.milestones.length ? (
          <ul className="space-y-3">
            {project.startupProfile.milestones.map((m) => (
              <li key={m.id} className="grid grid-cols-12 gap-x-3 gap-y-1 hairline-b py-3">
                <span className="col-span-6 sm:col-span-2 eyebrow !text-navy">{m.status}</span>
                <span className="col-span-6 sm:col-span-2 eyebrow text-right sm:text-left">
                  {m.targetDate ? formatDate(m.targetDate) : "—"}
                </span>
                <span className="col-span-12 sm:col-span-8 text-navy">{m.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-navy/60">Sin hitos registrados.</p>
        )}
      </Section>

      <Section
        title="Equipo fundador"
        actionLabel="Editar"
        actionHref={`/founder/${project.slug}/equipo` as Route}
      >
        {project.startupProfile?.founders.length ? (
          <ul className="space-y-3">
            {project.startupProfile.founders.map((f) => (
              <li
                key={f.id}
                className="grid grid-cols-12 items-center gap-3 hairline-b py-3"
              >
                <span className="col-span-7 sm:col-span-5 text-navy break-words">{f.fullName}</span>
                <span className="col-span-5 sm:col-span-3 eyebrow text-right sm:text-left">{f.role}</span>
                <span className="col-span-6 sm:col-span-2 font-mono text-navy">{formatPercent(Number(f.equityPercent))}</span>
                <span className="col-span-6 sm:col-span-2 eyebrow text-right">{f.isActive ? "activo" : "inactivo"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-navy/60">Sin equipo registrado.</p>
        )}
      </Section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-paper p-6">
      <p className="eyebrow">{label}</p>
      <p className={`mt-3 font-mono text-kpi ${highlight ? "text-navy" : "text-navy"}`}>
        {value}
        {highlight && <span className="ml-2 text-gold">◆</span>}
      </p>
      {hint && <p className="mt-2 eyebrow">{hint}</p>}
    </div>
  );
}
