import Link from "next/link";
import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { sequentialPrisma } from "@/lib/prisma/safe";
import { StatusBadge } from "@/components/founder/StatusBadge";
import { DocumentsPanel } from "./DocumentsPanel";
import { getDict, getLocale } from "@/lib/i18n";
import { computeCapTableByClass } from "@/lib/services/cap-table";
import { CAP_TABLE_INCLUDE, buildCapTableInput } from "@/lib/services/project";
import {
  formatNumber,
  formatPercent,
  formatCurrency,
  formatDate,
} from "@/lib/utils/format";

type Params = { params: Promise<{ projectSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { projectSlug } = await params;
  const dict = await getDict();
  const project = await prisma.project
    .findUnique({ where: { slug: projectSlug }, select: { name: true } })
    .catch(() => null);
  return {
    title: project
      ? `${project.name} · Project owner · AJDUT`
      : dict.metaTitles.founderDashboardFallback,
  };
}

export default async function FounderDashboardPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const { projectSlug } = await params;
  const dict = await getDict();
  const locale = await getLocale();

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: {
        include: {
          founders: { orderBy: [{ isActive: "desc" }, { equityPercent: "desc" }] },
          milestones: { orderBy: { createdAt: "desc" }, take: 8 },
          metrics: { orderBy: { asOf: "desc" }, take: 6 },
        },
      },
      participations: {
        include: {
          currentOwner: { select: { id: true, fullName: true, alias: true } },
        },
        orderBy: [{ isPlatformStake: "desc" }, { shareCount: "desc" }],
      },
      documents: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, storageKey: true, createdAt: true },
      },
      externalHoldings: {
        select: {
          label: true,
          shareCount: true,
          shareholderClassId: true,
          peopleCount: true,
        },
      },
      shareholderClasses: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, kind: true, order: true },
      },
      _count: { select: { shareholderClasses: true, externalHoldings: true } },
    },
  });

  // Soft-delete: si el proyecto fue eliminado, el founder no debe entrar
  // al dashboard — la fuente de verdad para "ya no existe" es deletedAt.
  if (!project || project.deletedAt) notFound();

  // El workspace del founder es estrictamente del dueño del proyecto.
  if (project.ownerId !== user.id) notFound();

  const t = dict.founderDashboard;
  const sp = project.startupProfile;

  // ─── Cap table UNIFICADO, AGRUPADO POR CLASE ──────────────────────
  // Única fuente de verdad: el equipo fundador (equity%), las tenencias
  // externas, el stake de plataforma y los asignados vía AJDUT, todos sobre
  // `totalShares`. El pool disponible es el remanente. Misma proyección de
  // inputs (`buildCapTableInput`) que la ficha pública (/proyectos/[slug]) →
  // ambas vistas idénticas. `computeCapTableByClass` agrega TODO por clase de
  // accionista (founders, externas y asignados), con pool y plataforma como
  // filas propias y "sin clasificar" para lo que no tiene clase.
  const totalShares = project.totalShares;
  const capInput = buildCapTableInput(project);
  // Etiqueta humana para externas sin label, coherente con la ficha pública.
  capInput.externalHoldings = capInput.externalHoldings.map((h) => ({
    ...h,
    label: h.label || t.capTable.preExistingFallback,
  }));
  // Solo las 4 clases canónicas (con kind). El stake de AJDUT se fold dentro
  // de Inversor pasivo; las 4 se muestran siempre, aunque queden en 0.
  const byClass = computeCapTableByClass(
    capInput,
    project.shareholderClasses
      .filter((c) => c.kind)
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
  );

  // El bloque "Fondeo" usa el pool unificado (remanente) como "disponible" y
  // los comprometidos como "colocadas" para la barra de progreso.
  const available = byClass.poolShares;
  const assigned = byClass.committedShares;

  // ─── KPIs operativos (lo que requiere atención hoy) ───────────────
  // Secuencial: con connection_limit=1 los 3 paralelos pelean por la única
  // conexión (la query del project ya consumió cupo en este request). Cada
  // KPI tiene fallback 0 — si falla, el widget muestra 0 y el dashboard sigue.
  const [openLeadsCount, pendingInfoRequestsCount, membersCount] =
    await sequentialPrisma([
      {
        run: () =>
          prisma.lead.count({
            where: { projectId: project.id, status: { in: ["OPEN", "CONTACTED"] } },
          }),
        fallback: 0,
        tag: "founderDashboard:openLeads",
      },
      {
        run: () =>
          prisma.infoRequest.count({
            where: { projectId: project.id, status: "PENDING" },
          }),
        fallback: 0,
        tag: "founderDashboard:pendingInfoRequests",
      },
      {
        run: () =>
          prisma.participation
            .findMany({
              where: {
                projectId: project.id,
                isPlatformStake: false,
                currentOwnerId: { not: null },
                status: {
                  in: [
                    "ASSIGNED",
                    "IN_RESALE",
                    "TRANSFER_PENDING",
                    "IN_NEGOTIATION",
                  ],
                },
              },
              select: { currentOwnerId: true },
            })
            .then((rows) => new Set(rows.map((r) => r.currentOwnerId)).size),
        fallback: 0,
        tag: "founderDashboard:membersCount",
      },
    ] as const);

  const pendingActions = openLeadsCount + pendingInfoRequestsCount;

  // ─── Checklist de completitud ─────────────────────────────────────
  const checklist = [
    {
      label: t.checklist.itemBasicLabel,
      done: Boolean(sp?.oneLiner && sp?.problemStatement && sp?.solutionStatement),
      href: `/founder/${project.slug}/editar` as Route,
      hint: t.checklist.itemBasicHint,
    },
    {
      label: t.checklist.itemTeamLabel,
      done: (sp?.founders.length ?? 0) > 0,
      href: `/founder/${project.slug}/equipo` as Route,
      hint: t.checklist.itemTeamHint,
    },
    {
      label: t.checklist.itemMilestonesLabel,
      done: (sp?.milestones.length ?? 0) > 0,
      href: `/founder/${project.slug}/hitos` as Route,
      hint: t.checklist.itemMilestonesHint,
    },
    {
      label: t.checklist.itemPitchLabel,
      done: Boolean(sp?.pitchDeckStorageKey || sp?.videoUrl),
      href: `/founder/${project.slug}/editar` as Route,
      hint: t.checklist.itemPitchHint,
    },
    {
      label: t.checklist.itemValuationLabel,
      done: Boolean(sp?.preMoneyValuation && Number(sp.preMoneyValuation) > 0),
      href: `/founder/${project.slug}/editar` as Route,
      hint: t.checklist.itemValuationHint,
    },
    {
      label: t.checklist.itemDocLabel,
      done: project.documents.length > 0,
      href: `/founder/${project.slug}?addDoc=1#documentos` as Route,
      hint: t.checklist.itemDocHint,
    },
    {
      label: t.checklist.itemCapLabel,
      done:
        project._count.shareholderClasses > 0 ||
        project._count.externalHoldings > 0,
      href: `/founder/${project.slug}/composicion` as Route,
      hint: t.checklist.itemCapHint,
    },
  ];

  const pricePerShare =
    sp?.preMoneyValuation && totalShares > 0
      ? Number(sp.preMoneyValuation) / totalShares
      : null;

  // ─────────────────────────────────────────────────────────────────
  // Layout: dos columnas (main editorial + sidebar de control).
  // El sidebar tiene sticky-top en desktop para acompañar el scroll.
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-x-10 xl:gap-x-14 gap-y-10">
      {/* ════════════════════════════════════════════════════════════
          COLUMNA PRINCIPAL — contenido editorial del proyecto
          ════════════════════════════════════════════════════════════ */}
      <div className="min-w-0">
        {/* ─── HERO ──────────────────────────────────────────────── */}
        <header className="pt-5 sm:pt-7 hairline-b pb-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="eyebrow !text-navy/40 min-w-0 break-words">
              {t.eyebrowRole}
              {sp?.sector && ` · ${sp.sector}`}
              {sp?.stage && ` · ${sp.stage}`}
            </p>
            <StatusBadge status={project.status} />
          </div>

          <h1 className="font-sans mt-4 text-h1 text-navy">{project.name}</h1>

          {sp?.oneLiner || project.shortPitch ? (
            <p className="mt-3 text-navy/75 leading-relaxed max-w-2xl">
              "{sp?.oneLiner ?? project.shortPitch}"
            </p>
          ) : null}

          {/* Acciones primarias del owner. "Editar información" sale primero
              como acción principal del dueño; "Abrir chat" outline al lado.
              "Ver ficha pública" y "+ Otro proyecto" quedan como links
              discretos al lado. */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`/founder/${project.slug}/editar` as Route}
              className="btn-primary"
            >
              {t.editBtn}
            </Link>
            <Link
              href={`/proyectos/${project.slug}/chat` as Route}
              className="btn-outline"
            >
              {t.chatBtn}
            </Link>
            <span className="eyebrow !text-navy/30">·</span>
            <Link
              href={`/proyectos/${project.slug}` as Route}
              className="eyebrow hover:!text-gold transition-colors"
            >
              {t.viewPublicLink}
            </Link>
            <Link
              href={"/founder/nuevo-proyecto" as Route}
              className="eyebrow hover:!text-gold transition-colors"
            >
              {t.newProjectLink}
            </Link>
          </div>
        </header>

        {/* ─── 01 · Resumen ─────────────────────────────────────── */}
        <FounderSection
          n="01"
          title={t.sectionResumen}
          editHref={`/founder/${project.slug}/editar` as Route}
          editLabel={t.editLabelEditar}
          flush
        >
          {sp?.problemStatement ||
          sp?.solutionStatement ||
          sp?.businessModel ||
          project.description ? (
            <dl className="space-y-5">
              {sp?.problemStatement && (
                <SummaryField label={t.summary.problem} value={sp.problemStatement} />
              )}
              {sp?.solutionStatement && (
                <SummaryField label={t.summary.solution} value={sp.solutionStatement} />
              )}
              {sp?.businessModel && (
                <SummaryField label={t.summary.businessModel} value={sp.businessModel} />
              )}
              {project.description && (
                <SummaryField label={t.summary.description} value={project.description} />
              )}
            </dl>
          ) : (
            <EmptyState
              text={t.summary.empty}
              href={`/founder/${project.slug}/editar` as Route}
              cta={t.summary.cta}
            />
          )}
        </FounderSection>

        {/* ─── 02 · Equipo fundador ─────────────────────────────── */}
        <FounderSection
          n="02"
          title={t.sectionEquipo}
          editHref={`/founder/${project.slug}/equipo` as Route}
          editLabel={t.editLabelEquipo}
          flush={!!sp?.founders.length}
        >
          {sp?.founders.length ? (
            <ul className="hairline-t">
              {sp.founders.map((f) => (
                <li
                  key={f.id}
                  className="grid grid-cols-12 items-baseline gap-3 hairline-b py-3"
                >
                  <span className="col-span-7 sm:col-span-5 text-navy break-words">
                    {f.fullName}
                    {!f.isActive && (
                      <span className="ml-2 eyebrow !text-navy/40">
                        {t.team.inactive}
                      </span>
                    )}
                  </span>
                  <span className="col-span-5 sm:col-span-5 eyebrow !text-navy/60 text-right sm:text-left">
                    {f.role}
                  </span>
                  <span className="col-span-12 sm:col-span-2 font-mono text-navy text-right">
                    {formatPercent(Number(f.equityPercent), 2, locale)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              text={t.team.empty}
              href={`/founder/${project.slug}/equipo` as Route}
              cta={t.team.cta}
            />
          )}
        </FounderSection>

        {/* ─── 03 · Hitos del roadmap ───────────────────────────── */}
        <FounderSection
          n="03"
          title={t.sectionHitos}
          editHref={`/founder/${project.slug}/hitos` as Route}
          editLabel={t.editLabelHitos}
          flush={!!sp?.milestones.length}
        >
          {sp?.milestones.length ? (
            <ul className="hairline-t">
              {sp.milestones.map((m) => {
                const isDone = m.status === "ACHIEVED";
                const statusLabel = isDone ? t.milestones.statusAchieved : t.milestones.statusPlanned;
                return (
                  <li
                    key={m.id}
                    className="hairline-b py-3 flex items-baseline gap-4 flex-wrap sm:flex-nowrap"
                  >
                    {/* Status: dot + label compactos, no se empujan al extremo */}
                    <span className="inline-flex items-baseline gap-2 shrink-0 min-w-[6.5rem]">
                      <span
                        className={`font-mono text-sm leading-none ${
                          isDone ? "text-gold" : "text-navy/30"
                        }`}
                        aria-hidden
                      >
                        {isDone ? "●" : "○"}
                      </span>
                      <span className="eyebrow !text-navy/60">{statusLabel}</span>
                    </span>
                    {/* Fecha al lado del status, no en el otro extremo */}
                    <span className="eyebrow !text-navy/40 font-mono shrink-0 min-w-[5.5rem]">
                      {m.targetDate ? formatDate(m.targetDate, locale) : "—"}
                    </span>
                    {/* Título + descripción — ocupa el espacio restante */}
                    <span className="text-navy flex-1 min-w-0">
                      {m.title}
                      {m.description && (
                        <span className="block mt-1 text-sm text-navy/60 leading-relaxed">
                          {m.description}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              text={t.milestones.empty}
              href={`/founder/${project.slug}/hitos` as Route}
              cta={t.milestones.cta}
            />
          )}
        </FounderSection>

        {/* ─── 04 · Interés de compra (micro-panel) ─────────────── */}
        <FounderSection
          n="04"
          title={t.sectionInteres}
          editHref={`/founder/${project.slug}/leads` as Route}
          editLabel={t.editLabelLeads}
          urgent={pendingActions > 0}
          flush
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line">
            <MicroKpi
              label={t.leads.openLabel}
              value={openLeadsCount}
              hint={
                openLeadsCount === 0
                  ? t.leads.openHintEmpty
                  : t.leads.openHintFmt.replace("{n}", String(openLeadsCount))
              }
              urgent={openLeadsCount > 0}
            />
            <MicroKpi
              label={t.leads.requestsLabel}
              value={pendingInfoRequestsCount}
              hint={
                pendingInfoRequestsCount === 0
                  ? t.leads.requestsHintEmpty
                  : t.leads.requestsHintFmt.replace(
                      "{n}",
                      String(pendingInfoRequestsCount)
                    )
              }
              urgent={pendingInfoRequestsCount > 0}
            />
          </div>
        </FounderSection>

        {/* ─── 05 · Métricas ────────────────────────────────────── */}
        {/* Las 4 métricas de comunidad/valuación, iguales que la ficha
            pública. Son calculadas (no editables) → sin link "Actualizar". */}
        <FounderSection n="05" title={t.sectionMetricas} flush>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricStat
              label={t.metricSociosDirectivos}
              value={formatNumber(
                sp?.founders.filter((f) => f.isActive).length ?? 0,
                undefined,
                locale,
              )}
            />
            <MetricStat
              label={t.metricSociosEmbajadores}
              value={formatNumber(0, undefined, locale)}
            />
            <MetricStat
              label={t.metricSociosTotales}
              value={formatNumber(membersCount, undefined, locale)}
            />
            <MetricStat
              label={t.metricValuacionActual}
              value={
                sp?.preMoneyValuation
                  ? formatCurrency(
                      Number(sp.preMoneyValuation),
                      sp.valuationCurrency,
                      0,
                      locale,
                    )
                  : "—"
              }
            />
          </div>
        </FounderSection>

        {/* ─── 06 · Documentos ──────────────────────────────────── */}
        <FounderSection
          n="06"
          title={t.sectionDocumentos}
          id="documentos"
          editHref={`/founder/${project.slug}?addDoc=1#documentos` as Route}
          editLabel={dict.documentsPanel.newDocEyebrow}
          flush={project.documents.length > 0}
        >
          <DocumentsPanel
            projectSlug={project.slug}
            documents={project.documents.map((d) => ({
              id: d.id,
              title: d.title,
              storageKey: d.storageKey,
              createdAt: d.createdAt.toISOString(),
            }))}
            dict={dict.documentsPanel}
            uploadDict={dict.fileUpload}
            locale={locale}
          />
        </FounderSection>

        {/* ─── 07 · Avisos a miembros ───────────────────────────── */}
        <FounderSection
          n="07"
          title={t.sectionAvisos}
          editHref={`/founder/${project.slug}/avisos` as Route}
          editLabel={membersCount > 0 ? t.editLabelAvisos : undefined}
        >
          <p className="text-navy/75 leading-relaxed">
            {membersCount > 0
              ? (membersCount === 1
                  ? t.notices.activeMembersSingleFmt
                  : t.notices.activeMembersPluralFmt
                ).replace("{n}", String(membersCount))
              : t.notices.empty}
          </p>
        </FounderSection>
      </div>

      {/* ════════════════════════════════════════════════════════════
          COLUMNA LATERAL — métricas financieras + control operativo
          Mismo lenguaje visual que las secciones del main column:
          header mono con número + dot + título sans.
          ════════════════════════════════════════════════════════════ */}
      <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start lg:pt-5">
        {/* ─── 00 · Fondeo (medidor + KPIs cortos) ──────────────── */}
        <div className="hairline bg-paper">
          <div className="px-5 pt-5 pb-5 hairline-b">
            <WidgetHeader n="00" title={t.sectionFondeo} />
            <div className="mt-4">
              <p className="eyebrow !text-navy/50">{t.funding.placedLabel}</p>
              <p className="mt-1.5 font-mono text-2xl text-navy leading-none">
                {formatNumber(assigned, undefined, locale)}
                <span className="text-navy/30"> / {formatNumber(totalShares, undefined, locale)}</span>
              </p>
            </div>
            {/* Barra de progreso: contenedor pill h-2 con relleno gold. */}
            <div className="mt-4 h-2 rounded-full bg-line/70 overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (assigned / Math.max(totalShares, 1)) * 100)}%`,
                }}
                aria-hidden
              />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-px bg-line">
            <SidebarStat
              label={t.funding.availableLabel}
              value={formatNumber(available, undefined, locale)}
            />
            <SidebarStat
              label={t.funding.suggestedValueLabel}
              value={
                pricePerShare
                  ? formatCurrency(
                      pricePerShare,
                      sp?.valuationCurrency ?? "USD",
                      2,
                      locale,
                    )
                  : t.funding.empty
              }
              mono
            />
            <SidebarStat
              label={t.funding.valuationLabel}
              value={
                sp?.preMoneyValuation
                  ? formatCurrency(
                      Number(sp.preMoneyValuation),
                      sp.valuationCurrency,
                      2,
                      locale,
                    )
                  : t.funding.empty
              }
              fullWidth
              mono
            />
          </dl>
        </div>

        {/* ─── 08 · Cap table detallado por holder ──────────────── */}
        <div className="hairline bg-paper">
          <div className="px-5 pt-5 pb-5 hairline-b">
            <WidgetHeader n="08" title={t.sectionCapTable} />
          </div>
          {/* Filas con hairline-b explícito (0.5px) — match con el header
              de arriba y con el resto del sistema editorial. Renderiza TODAS
              las filas del cap table AGRUPADO POR CLASE: pool, plataforma, una
              fila por clase de accionista (founders + externas + asignados de
              esa clase) y "sin clasificar". */}
          <ul>
            {byClass.rows.map((row) => (
              <CapHolderRow
                key={row.key}
                name={
                  row.name === "__pool__"
                    ? t.capTable.poolName
                    : row.name === "__platform__"
                      ? t.capTable.platformName
                      : row.name === "__reserved__"
                        ? t.capTable.reservedLabel
                        : row.name === "__uncl__"
                          ? t.capTable.unassignedClass
                          : row.name
                }
                shares={row.shares}
                totalShares={totalShares}
                muted={
                  row.kind === "pool" ||
                  row.kind === "unclassified" ||
                  row.kind === "reserved"
                }
                gold={row.kind === "platform"}
                locale={locale}
              />
            ))}
          </ul>
          <div className="px-5 py-3 hairline-t">
            <Link
              href={`/founder/${project.slug}/composicion` as Route}
              className="eyebrow !text-gold hover:!text-navy transition-colors"
            >
              {t.capTable.manageLink}
            </Link>
          </div>
        </div>

        {/* ─── 09 · Checklist owner ─────────────────────────────── */}
        <div className="hairline bg-paper">
          <div className="px-5 pt-5 pb-5 hairline-b">
            <WidgetHeader n="09" title={t.sectionEstado} />
          </div>
          <ChecklistInline items={checklist} completeBtn={t.checklist.completeBtn} />
        </div>
      </aside>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Subcomponentes
// ════════════════════════════════════════════════════════════════════

/**
 * Header de sección — mismo lenguaje para main column y sidebar widgets.
 * Mono "NN" gold + `·` navy/30 + título sans navy. Tracking wider, text-sm.
 */
function WidgetHeader({ n, title }: { n: string; title: string }) {
  return (
    <h2 className="font-mono text-sm tracking-wider text-navy">
      <span className="text-gold">{n}</span>
      <span className="text-navy/30"> · </span>
      <span className="font-sans text-navy">{title}</span>
    </h2>
  );
}

/**
 * Sección del founder dashboard (main column). Reusa WidgetHeader para
 * mantener consistencia con los widgets del sidebar. El trigger de edición
 * va a la derecha del título — sin emojis ni iconos extra.
 */
function FounderSection({
  n,
  title,
  editHref,
  editLabel,
  id,
  flush,
  children,
}: {
  n: string;
  title: string;
  editHref?: Route;
  editLabel?: string;
  urgent?: boolean;
  id?: string;
  /** Anula el hairline-b de cierre de la sección. Se usa cuando el contenido ya
   *  cierra con su propia divisoria (última fila de una lista) o cuando se
   *  prefiere la sección sin línea divisoria. */
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`py-8 sm:py-10${flush ? "" : " hairline-b last:border-b-0"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <WidgetHeader n={n} title={title} />
        {editHref && editLabel && (
          <Link
            href={editHref}
            className="eyebrow !text-navy/50 hover:!text-gold transition-colors shrink-0"
          >
            {editLabel} →
          </Link>
        )}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * Checklist inline para encajar dentro de un widget con su propio
 * header. Versión compacta del ProjectChecklist standalone.
 */
function ChecklistInline({
  items,
  completeBtn,
}: {
  items: Array<{ label: string; done: boolean; href: Route; hint?: string }>;
  completeBtn: string;
}) {
  return (
    <ul>
      {items.map((it) => (
        <li key={it.label} className="hairline-b last:border-b-0">
          <div className="flex items-start gap-3 px-5 py-3">
            <span
              aria-hidden
              className={`mt-0.5 font-mono text-sm leading-none shrink-0 ${
                it.done ? "text-gold" : "text-navy/30"
              }`}
            >
              {it.done ? "●" : "○"}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm leading-snug ${
                  it.done ? "text-navy/55" : "text-navy"
                }`}
              >
                {it.label}
              </p>
            </div>
            {!it.done && (
              <Link
                href={it.href}
                className="eyebrow !text-gold hover:!text-navy transition-colors shrink-0 self-center"
              >
                {completeBtn}
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-2 sm:gap-6">
      <dt className="eyebrow !text-navy/40">{label}</dt>
      <dd className="text-navy/85 leading-relaxed whitespace-pre-line">
        {value}
      </dd>
    </div>
  );
}

function EmptyState({
  text,
  href,
  cta,
}: {
  text: string;
  href: Route;
  cta: string;
}) {
  return (
    <div className="hairline p-5 bg-paper-light">
      <p className="text-navy/65 leading-relaxed">{text}</p>
      <Link
        href={href}
        className="mt-3 inline-block eyebrow !text-gold hover:!text-navy transition-colors"
      >
        {cta}
      </Link>
    </div>
  );
}

function MicroKpi({
  label,
  value,
  hint,
  urgent,
}: {
  label: string;
  value: number;
  hint?: string;
  urgent?: boolean;
}) {
  return (
    <div className="bg-paper p-5">
      <p className="eyebrow !text-navy/40">{label}</p>
      <p
        className={`mt-2 font-mono text-3xl leading-none ${
          urgent ? "text-gold" : "text-navy"
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-2 eyebrow !text-navy/50">{hint}</p>
      )}
    </div>
  );
}

function SidebarStat({
  label,
  value,
  mono,
  fullWidth,
}: {
  label: string;
  value: string;
  mono?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div className={`bg-paper p-4 ${fullWidth ? "col-span-2" : ""}`}>
      <p className="eyebrow !text-navy/40">{label}</p>
      <p
        className={`mt-1.5 text-navy ${mono ? "font-mono text-sm" : "font-sans"}`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Tarjeta de métrica — mismo look que el StatCard de la ficha pública
 * (hairline + eyebrow label + valor mono). Para las 4 métricas de comunidad.
 */
function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hairline bg-paper py-3 px-4">
      <p className="eyebrow !text-navy/40 truncate">{label}</p>
      <p className="mt-1.5 font-mono text-lg leading-none text-navy">{value}</p>
    </div>
  );
}

function CapHolderRow({
  name,
  shares,
  totalShares,
  muted,
  gold,
  locale,
}: {
  name: string;
  shares: number;
  totalShares: number;
  muted?: boolean;
  gold?: boolean;
  locale: string;
}) {
  const pct = totalShares > 0 ? (shares / totalShares) * 100 : 0;
  return (
    <li className="hairline-b last:border-b-0">
      <div className="flex items-baseline justify-between gap-3 px-5 py-3 text-sm">
        <span
          className={`min-w-0 truncate ${
            muted ? "text-navy/50" : "text-navy"
          }`}
        >
          {name}
          {gold && <span className="ml-2 text-gold">◆</span>}
        </span>
        <span className="flex items-baseline gap-2 shrink-0 font-mono">
          <span className="text-navy/40 text-xs">{formatPercent(pct, 1, locale)}</span>
          <span className="text-navy">{formatNumber(shares, undefined, locale)}</span>
        </span>
      </div>
    </li>
  );
}
