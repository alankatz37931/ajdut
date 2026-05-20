import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Section } from "@/components/ui/Section";
import { StatusBadge } from "@/components/founder/StatusBadge";
import { ModuleCard } from "@/components/founder/ModuleCard";
import { ProjectChecklist } from "@/components/founder/ProjectChecklist";
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
      participations: {
        select: { id: true, status: true, shareCount: true, isPlatformStake: true },
      },
    },
  });

  if (!project) notFound();

  // El workspace del founder es estrictamente del dueño del proyecto.
  if (project.ownerId !== user.id) notFound();

  // ─── KPIs estructurales del cap table ───────────────────────────────
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

  // ─── KPIs operativos del founder (no del proyecto público) ─────────
  // Estos son los números que el founder necesita ver de un vistazo
  // para saber qué le requiere atención HOY.
  const [openLeadsCount, pendingInfoRequestsCount, membersCount, lastReport] =
    await Promise.all([
      prisma.lead.count({
        where: { projectId: project.id, status: { in: ["OPEN", "CONTACTED"] } },
      }),
      prisma.infoRequest.count({
        where: { projectId: project.id, status: "PENDING" },
      }),
      // Distintos owners con acciones asignadas (excluyendo la plataforma).
      prisma.participation
        .findMany({
          where: {
            projectId: project.id,
            isPlatformStake: false,
            currentOwnerId: { not: null },
            status: { in: ["ASSIGNED", "IN_RESALE", "TRANSFER_PENDING", "IN_NEGOTIATION"] },
          },
          select: { currentOwnerId: true },
        })
        .then((rows) => new Set(rows.map((r) => r.currentOwnerId)).size),
      prisma.report.findFirst({
        where: { projectId: project.id },
        orderBy: { publishedAt: "desc" },
        select: { id: true, title: true, publishedAt: true, period: true, fiscalYear: true },
      }),
    ]);

  const pendingActions = openLeadsCount + pendingInfoRequestsCount;

  // ─── Checklist de completitud ───────────────────────────────────────
  const sp = project.startupProfile;
  const checklist = [
    {
      label: "Información básica del proyecto",
      done: Boolean(sp?.oneLiner && sp?.problemStatement && sp?.solutionStatement),
      href: `/founder/${project.slug}/editar` as Route,
      hint: "One-liner, problema, solución, modelo.",
    },
    {
      label: "Equipo fundador cargado",
      done: (sp?.founders.length ?? 0) > 0,
      href: `/founder/${project.slug}/equipo` as Route,
      hint: "Quiénes están detrás del proyecto.",
    },
    {
      label: "Hitos del roadmap",
      done: (sp?.milestones.length ?? 0) > 0,
      href: `/founder/${project.slug}/hitos` as Route,
      hint: "Lo prometido y lo cumplido.",
    },
    {
      label: "Pitch deck o video",
      done: Boolean(sp?.pitchDeckStorageKey || sp?.videoUrl),
      href: `/founder/${project.slug}/editar` as Route,
      hint: "URL al deck (Drive/Notion) o video (YouTube/Vimeo).",
    },
    {
      label: "Valoración declarada",
      done: Boolean(sp?.preMoneyValuation && Number(sp.preMoneyValuation) > 0),
      href: `/founder/${project.slug}/editar` as Route,
      hint: "Determina el precio por acción.",
    },
    {
      label: "Primer reporte trimestral",
      done: Boolean(lastReport),
      href: `/founder/${project.slug}/reportes` as Route,
      hint: "Avances financieros y de negocio.",
    },
  ];

  const completedChecklist = checklist.filter((c) => c.done).length;

  return (
    <div>
      {/* ─── HERO COMPACTO ─────────────────────────────────────────── */}
      <header className="flex flex-col gap-6 hairline-b pb-8 sm:pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:max-w-2xl">
          <p className="eyebrow">
            — Founder · {sp?.sector ?? project.kind}
            {sp?.stage ? ` · ${sp.stage}` : ""}
          </p>
          <h1 className="font-sans mt-4 sm:mt-6 text-h1 text-navy">{project.name}</h1>
          {sp?.oneLiner || project.shortPitch ? (
            <p className="mt-3 sm:mt-4 text-navy/75 leading-relaxed">
              “{sp?.oneLiner ?? project.shortPitch}”
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
          <StatusBadge status={project.status} />
          {project.approvedAt && (
            <p className="eyebrow !text-navy/50">
              Aprobado · {formatDate(project.approvedAt)}
            </p>
          )}
        </div>
      </header>

      {/* ─── ACCIONES PRIMARIAS ────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href={`/proyectos/${project.slug}` as Route} className="btn-primary">
          Ver ficha pública →
        </Link>
        <Link
          href={`/founder/${project.slug}/editar` as Route}
          className="btn-outline"
        >
          Editar información
        </Link>
        <span className="eyebrow !text-navy/30">·</span>
        <Link
          href={"/founder/nuevo-proyecto" as Route}
          className="eyebrow hover:!text-gold transition-colors"
        >
          + Otro proyecto
        </Link>
      </div>

      {/* ─── BANDA DE KPIs OPERATIVOS (lo que requiere atención hoy) */}
      <Section title="Resumen operativo">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line">
          <OperationalKpi
            label="Sin atender"
            value={pendingActions}
            hint={
              pendingActions === 0
                ? "Todo al día"
                : `${openLeadsCount} lead${openLeadsCount === 1 ? "" : "s"}${pendingInfoRequestsCount > 0 ? ` · ${pendingInfoRequestsCount} solicitud${pendingInfoRequestsCount === 1 ? "" : "es"}` : ""}`
            }
            urgent={pendingActions > 0}
          />
          <OperationalKpi
            label="Miembros activos"
            value={membersCount}
            hint={
              membersCount === 0
                ? "Sin socios todavía"
                : `${formatNumber(assigned)} acciones distribuidas`
            }
          />
          <OperationalKpi
            label="Pool disponible"
            value={formatNumber(available)}
            hint={`${Math.round((available / Math.max(totalShares, 1)) * 100)}% del total`}
          />
          <OperationalKpi
            label="Completitud"
            value={`${completedChecklist}/${checklist.length}`}
            hint={completedChecklist === checklist.length ? "Listo" : "Ítems pendientes"}
            mono
          />
        </div>
      </Section>

      {/* ─── GRILLA DE MÓDULOS (acciones del founder) ──────────────── */}
      <Section title="Módulos del proyecto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-line">
          <ModuleCard
            eyebrow="01 · Interés de compra"
            value={openLeadsCount > 0 ? openLeadsCount : undefined}
            empty={openLeadsCount === 0 && pendingInfoRequestsCount === 0}
            emptyCta="Sin interés registrado todavía."
            description={
              pendingInfoRequestsCount > 0
                ? `${pendingInfoRequestsCount} solicitud${pendingInfoRequestsCount === 1 ? "" : "es"} de información pendiente${pendingInfoRequestsCount === 1 ? "" : "s"}.`
                : openLeadsCount > 0
                  ? `${openLeadsCount} lead${openLeadsCount === 1 ? "" : "s"} sin contactar.`
                  : "Cuando alguien pida participar, aparece acá."
            }
            href={`/founder/${project.slug}/leads` as Route}
            highlight={pendingActions > 0}
          />
          <ModuleCard
            eyebrow="02 · Equipo fundador"
            value={sp?.founders.length ? sp.founders.length : undefined}
            empty={!sp?.founders.length}
            emptyCta="Cargá quiénes están detrás."
            description={
              sp?.founders.length
                ? `${sp.founders.length} miembro${sp.founders.length === 1 ? "" : "s"} cargado${sp.founders.length === 1 ? "" : "s"}.`
                : "Los founders se muestran en la ficha pública."
            }
            href={`/founder/${project.slug}/equipo` as Route}
          />
          <ModuleCard
            eyebrow="03 · Hitos"
            value={sp?.milestones.length ? sp.milestones.length : undefined}
            empty={!sp?.milestones.length}
            emptyCta="Marcá tu roadmap."
            description={
              sp?.milestones.length
                ? "Lo que prometiste cumplir y lo que ya cumpliste."
                : "Lo que prometiste cumplir, visible para socios."
            }
            href={`/founder/${project.slug}/hitos` as Route}
          />
          <ModuleCard
            eyebrow="04 · Métricas"
            value={sp?.metrics.length ? sp.metrics.length : undefined}
            empty={!sp?.metrics.length}
            emptyCta="Subí tu primera medición."
            description={
              sp?.metrics.length
                ? "Snapshot numérico — MRR, churn, runway, etc."
                : "Volumen, ingresos, runway. Histórico visible para socios."
            }
            href={`/founder/${project.slug}/metricas` as Route}
          />
          <ModuleCard
            eyebrow="05 · Reportes"
            value={lastReport ? undefined : undefined}
            description={
              lastReport
                ? `Último: ${lastReport.title} · ${formatDate(lastReport.publishedAt)}`
                : "Publicá avances financieros y de negocio."
            }
            empty={!lastReport}
            emptyCta="Publicá tu primer reporte trimestral."
            href={`/founder/${project.slug}/reportes` as Route}
          />
          <ModuleCard
            eyebrow="06 · Avisos a miembros"
            description={
              membersCount > 0
                ? `Enviá un email a tus ${membersCount} miembro${membersCount === 1 ? "" : "s"}.`
                : "Cuando tengas socios, vas a poder avisarles desde acá."
            }
            empty={membersCount === 0}
            emptyCta="Sin miembros todavía."
            href={`/founder/${project.slug}/avisos` as Route}
          />
          <ModuleCard
            eyebrow="07 · Invitar"
            value={available > 0 ? formatNumber(available) : undefined}
            description={
              available > 0
                ? "Proponé al admin agregar un socio desde el pool disponible."
                : "Para invitar nuevos miembros, primero recuperá pool."
            }
            empty={available === 0}
            emptyCta="Sin pool disponible."
            href={`/founder/${project.slug}/invitar` as Route}
          />
        </div>
      </Section>

      {/* ─── CHECKLIST + CAP TABLE ─────────────────────────────────── */}
      <Section title="Estado y cap table">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProjectChecklist items={checklist} />

          <div className="hairline bg-paper">
            <div className="hairline-b p-5 flex items-baseline justify-between gap-4">
              <p className="eyebrow">— Cap table</p>
              <Link
                href={`/proyectos/${project.slug}` as Route}
                className="eyebrow hover:!text-gold transition-colors"
              >
                Ver detalle →
              </Link>
            </div>
            <dl className="divide-y divide-line">
              <CapRow label="Total emitidas" value={formatNumber(totalShares)} />
              <CapRow
                label="Distribuidas"
                value={formatNumber(assigned)}
                hint={`${Math.round((assigned / Math.max(totalShares, 1)) * 100)}%`}
              />
              <CapRow
                label="Disponibles (pool)"
                value={formatNumber(available)}
                hint={`${Math.round((available / Math.max(totalShares, 1)) * 100)}%`}
              />
              <CapRow
                label="AJDUT plataforma"
                value={formatNumber(platform)}
                hint={`${Math.round((platform / Math.max(totalShares, 1)) * 100)}%`}
                gold
              />
              {sp?.preMoneyValuation && (
                <CapRow
                  label="Última valoración"
                  value={formatCurrency(
                    Number(sp.preMoneyValuation),
                    sp.valuationCurrency,
                  )}
                />
              )}
            </dl>
          </div>
        </div>
      </Section>

      {/* ─── EQUIPO + HITOS RÁPIDOS ───────────────────────────────── */}
      {sp?.founders.length ? (
        <Section
          title="Equipo fundador"
          actionLabel="Editar"
          actionHref={`/founder/${project.slug}/equipo` as Route}
        >
          <ul className="hairline-t">
            {sp.founders.map((f) => (
              <li
                key={f.id}
                className="grid grid-cols-12 items-center gap-3 hairline-b py-3"
              >
                <span className="col-span-7 sm:col-span-5 text-navy break-words">
                  {f.fullName}
                </span>
                <span className="col-span-5 sm:col-span-3 eyebrow text-right sm:text-left">
                  {f.role}
                </span>
                <span className="col-span-6 sm:col-span-2 font-mono text-navy">
                  {formatPercent(Number(f.equityPercent))}
                </span>
                <span className="col-span-6 sm:col-span-2 eyebrow text-right">
                  {f.isActive ? "activo" : "inactivo"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {sp?.milestones.length ? (
        <Section
          title="Últimos hitos"
          actionLabel="Editar"
          actionHref={`/founder/${project.slug}/hitos` as Route}
        >
          <ul className="hairline-t">
            {sp.milestones.map((m) => (
              <li
                key={m.id}
                className="grid grid-cols-12 gap-x-3 gap-y-1 hairline-b py-3"
              >
                <span className="col-span-6 sm:col-span-2 eyebrow !text-navy">
                  {m.status}
                </span>
                <span className="col-span-6 sm:col-span-2 eyebrow text-right sm:text-left">
                  {m.targetDate ? formatDate(m.targetDate) : "—"}
                </span>
                <span className="col-span-12 sm:col-span-8 text-navy">{m.title}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

/**
 * KPI compacto, alineado con el manual: eyebrow chico, número grande mono,
 * hint debajo. Cuando es "urgente" (leads sin atender) el número se pinta oro.
 */
function OperationalKpi({
  label,
  value,
  hint,
  urgent,
  mono,
}: {
  label: string;
  value: string | number;
  hint?: string;
  urgent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="bg-paper p-5 sm:p-6">
      <p className="eyebrow">{label}</p>
      <p
        className={`mt-3 font-mono text-kpi leading-none ${
          urgent ? "text-gold" : "text-navy"
        } ${mono ? "" : ""}`}
      >
        {value}
      </p>
      {hint && <p className="mt-2 eyebrow !text-navy/50">{hint}</p>}
    </div>
  );
}

function CapRow({
  label,
  value,
  hint,
  gold,
}: {
  label: string;
  value: string;
  hint?: string;
  gold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="flex items-baseline gap-3">
        {hint && <span className="eyebrow !text-navy/40">{hint}</span>}
        <span className={`font-mono text-navy ${gold ? "" : ""}`}>
          {value}
          {gold && <span className="ml-2 text-gold">◆</span>}
        </span>
      </dd>
    </div>
  );
}
