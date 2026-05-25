import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { StatusBadge } from "@/components/founder/StatusBadge";
import { DocumentsPanel } from "./DocumentsPanel";
import { getDict, getLocale } from "@/lib/i18n";
import {
  formatNumber,
  formatPercent,
  formatCurrency,
  formatDate,
} from "@/lib/utils/format";

type Params = { params: Promise<{ projectSlug: string }> };

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
      _count: { select: { shareholderClasses: true, externalHoldings: true } },
    },
  });

  if (!project) notFound();

  // El workspace del founder es estrictamente del dueño del proyecto.
  if (project.ownerId !== user.id) notFound();

  const sp = project.startupProfile;

  // ─── Cap table (estructural + por holder individual) ──────────────
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

  // Lista detallada para el sidebar: agrupamos por holder (excluyendo
  // disponibles y la cuota de plataforma — esos van como filas dedicadas).
  const individualHoldings = new Map<string, { name: string; shares: number }>();
  for (const p of project.participations) {
    if (p.isPlatformStake) continue;
    if (p.status === "AVAILABLE") continue;
    if (!p.currentOwner) continue;
    const key = p.currentOwner.id;
    const name = p.currentOwner.alias ?? p.currentOwner.fullName;
    const prev = individualHoldings.get(key);
    individualHoldings.set(key, {
      name,
      shares: (prev?.shares ?? 0) + p.shareCount,
    });
  }
  const individualRows = Array.from(individualHoldings.values()).sort(
    (a, b) => b.shares - a.shares,
  );

  // ─── KPIs operativos (lo que requiere atención hoy) ───────────────
  const [openLeadsCount, pendingInfoRequestsCount, membersCount] =
    await Promise.all([
      prisma.lead.count({
        where: { projectId: project.id, status: { in: ["OPEN", "CONTACTED"] } },
      }),
      prisma.infoRequest.count({
        where: { projectId: project.id, status: "PENDING" },
      }),
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
    ]);

  const pendingActions = openLeadsCount + pendingInfoRequestsCount;

  // ─── Checklist de completitud ─────────────────────────────────────
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
      label: "Primer documento compartido",
      done: project.documents.length > 0,
      href: `/founder/${project.slug}` as Route,
      hint: "Reportes, estados financieros, lo que quieras compartir.",
    },
    {
      label: "Composición accionaria",
      done:
        project._count.shareholderClasses > 0 ||
        project._count.externalHoldings > 0,
      href: `/founder/${project.slug}/composicion` as Route,
      hint: "Clases de accionistas y tenencias pre-existentes.",
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
          <div className="flex items-start justify-between gap-4">
            <p className="eyebrow !text-navy/40">
              Project owner
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

          {/* Acciones primarias del owner. El "Abrir chat" sale primero —
              es la acción frecuente. "Editar" como botón outline contiguo.
              "Ver ficha pública" y "+ Otro proyecto" quedan como links
              discretos al lado. */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`/proyectos/${project.slug}/chat` as Route}
              className="btn-primary"
            >
              Abrir chat →
            </Link>
            <Link
              href={`/founder/${project.slug}/editar` as Route}
              className="btn-outline"
            >
              Editar información
            </Link>
            <span className="eyebrow !text-navy/30">·</span>
            <Link
              href={`/proyectos/${project.slug}` as Route}
              className="eyebrow hover:!text-gold transition-colors"
            >
              Ver ficha pública
            </Link>
            <Link
              href={"/founder/nuevo-proyecto" as Route}
              className="eyebrow hover:!text-gold transition-colors"
            >
              + Otro proyecto
            </Link>
          </div>
        </header>

        {/* ─── 01 · Resumen ─────────────────────────────────────── */}
        <FounderSection
          n="01"
          title="Resumen"
          editHref={`/founder/${project.slug}/editar` as Route}
          editLabel="Editar"
        >
          {sp?.problemStatement ||
          sp?.solutionStatement ||
          sp?.businessModel ||
          project.description ? (
            <dl className="space-y-5">
              {sp?.problemStatement && (
                <SummaryField label="Problema" value={sp.problemStatement} />
              )}
              {sp?.solutionStatement && (
                <SummaryField label="Solución" value={sp.solutionStatement} />
              )}
              {sp?.businessModel && (
                <SummaryField label="Modelo de negocio" value={sp.businessModel} />
              )}
              {project.description && (
                <SummaryField label="Descripción" value={project.description} />
              )}
            </dl>
          ) : (
            <EmptyState
              text="Sin información cargada todavía."
              href={`/founder/${project.slug}/editar` as Route}
              cta="Cargar resumen →"
            />
          )}
        </FounderSection>

        {/* ─── 02 · Equipo fundador ─────────────────────────────── */}
        <FounderSection
          n="02"
          title="Equipo fundador"
          editHref={`/founder/${project.slug}/equipo` as Route}
          editLabel="+ Invitar / Modificar"
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
                        inactivo
                      </span>
                    )}
                  </span>
                  <span className="col-span-5 sm:col-span-5 eyebrow !text-navy/60 text-right sm:text-left">
                    {f.role}
                  </span>
                  <span className="col-span-12 sm:col-span-2 font-mono text-navy text-right">
                    {formatPercent(Number(f.equityPercent))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              text="Cargá quiénes están detrás del proyecto."
              href={`/founder/${project.slug}/equipo` as Route}
              cta="Cargar equipo →"
            />
          )}
        </FounderSection>

        {/* ─── 03 · Hitos del roadmap ───────────────────────────── */}
        <FounderSection
          n="03"
          title="Hitos del roadmap"
          editHref={`/founder/${project.slug}/hitos` as Route}
          editLabel="+ Hito / Editar"
        >
          {sp?.milestones.length ? (
            <ul className="hairline-t">
              {sp.milestones.map((m) => {
                const isDone = m.status === "ACHIEVED";
                const statusLabel = isDone ? "Logrado" : "Planeado";
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
                      {m.targetDate ? formatDate(m.targetDate) : "—"}
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
              text="Marcá tu roadmap — lo prometido y lo cumplido."
              href={`/founder/${project.slug}/hitos` as Route}
              cta="Agregar primer hito →"
            />
          )}
        </FounderSection>

        {/* ─── 04 · Interés de compra (micro-panel) ─────────────── */}
        <FounderSection
          n="04"
          title="Interés de compra"
          editHref={`/founder/${project.slug}/leads` as Route}
          editLabel="Ver leads"
          urgent={pendingActions > 0}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line">
            <MicroKpi
              label="Leads sin atender"
              value={openLeadsCount}
              hint={
                openLeadsCount === 0
                  ? "Sin solicitudes activas"
                  : `${openLeadsCount} esperando contacto`
              }
              urgent={openLeadsCount > 0}
            />
            <MicroKpi
              label="Solicitudes de info pendientes"
              value={pendingInfoRequestsCount}
              hint={
                pendingInfoRequestsCount === 0
                  ? "Bandeja al día"
                  : `${pendingInfoRequestsCount} sin resolver`
              }
              urgent={pendingInfoRequestsCount > 0}
            />
          </div>
        </FounderSection>

        {/* ─── 05 · Métricas ────────────────────────────────────── */}
        <FounderSection
          n="05"
          title="Métricas"
          editHref={`/founder/${project.slug}/metricas` as Route}
          editLabel="Actualizar"
        >
          {sp?.metrics.length ? (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-line">
              {sp.metrics.slice(0, 6).map((m) => (
                <li key={m.id} className="bg-paper p-4">
                  <p className="eyebrow !text-navy/40 truncate">
                    {m.customLabel ?? m.kind}
                  </p>
                  <p className="mt-2 font-mono text-lg text-navy">
                    {m.unit === "CURRENCY"
                      ? formatCurrency(Number(m.value), sp.valuationCurrency)
                      : m.unit === "PERCENT"
                        ? `${Number(m.value).toFixed(1)}%`
                        : formatNumber(Number(m.value))}
                  </p>
                  <p className="mt-1 eyebrow !text-navy/40">
                    {formatDate(m.asOf)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              text="Subí tu primera medición (MRR, DAU, runway, etc.)."
              href={`/founder/${project.slug}/metricas` as Route}
              cta="Cargar métrica →"
            />
          )}
        </FounderSection>

        {/* ─── 06 · Documentos ──────────────────────────────────── */}
        <FounderSection n="06" title="Documentos">
          <DocumentsPanel
            projectSlug={project.slug}
            documents={project.documents.map((d) => ({
              id: d.id,
              title: d.title,
              storageKey: d.storageKey,
              createdAt: d.createdAt.toISOString(),
            }))}
            dict={dict.documentsPanel}
            locale={locale}
          />
        </FounderSection>

        {/* ─── 07 · Avisos a miembros ───────────────────────────── */}
        <FounderSection
          n="07"
          title="Avisos a miembros"
          editHref={`/founder/${project.slug}/avisos` as Route}
          editLabel={membersCount > 0 ? "Nuevo aviso" : undefined}
        >
          <p className="text-navy/75 leading-relaxed">
            {membersCount > 0
              ? `Tenés ${membersCount} miembro${membersCount === 1 ? "" : "s"} activo${membersCount === 1 ? "" : "s"} en este proyecto. Podés mandarles un email desde acá.`
              : "Cuando un miembro reciba acciones del proyecto, vas a poder enviarle avisos por email desde acá."}
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
            <WidgetHeader n="00" title="Fondeo" />
            <div className="mt-4">
              <p className="eyebrow !text-navy/50">Acciones colocadas hasta hoy</p>
              <p className="mt-1.5 font-mono text-2xl text-navy leading-none">
                {formatNumber(assigned)}
                <span className="text-navy/30"> / {formatNumber(totalShares)}</span>
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
              label="Disponibles"
              value={formatNumber(available)}
            />
            <SidebarStat
              label="Valor sugerido"
              value={
                pricePerShare
                  ? formatCurrency(
                      pricePerShare,
                      sp?.valuationCurrency ?? "USD",
                    )
                  : "—"
              }
              mono
            />
            <SidebarStat
              label="Valoración"
              value={
                sp?.preMoneyValuation
                  ? formatCurrency(
                      Number(sp.preMoneyValuation),
                      sp.valuationCurrency,
                    )
                  : "—"
              }
              fullWidth
              mono
            />
          </dl>
        </div>

        {/* ─── 08 · Cap table detallado por holder ──────────────── */}
        <div className="hairline bg-paper">
          <div className="px-5 pt-5 pb-5 hairline-b flex items-baseline justify-between gap-3">
            <WidgetHeader n="08" title="Cap table" />
            <Link
              href={`/proyectos/${project.slug}` as Route}
              className="eyebrow !text-navy/50 hover:!text-gold transition-colors shrink-0"
            >
              Detalle →
            </Link>
          </div>
          {/* Filas con hairline-b explícito (0.5px) — match con el header
              de arriba y con el resto del sistema editorial. */}
          <ul>
            {available > 0 && (
              <CapHolderRow
                name="Disponible (pool)"
                shares={available}
                totalShares={totalShares}
                muted
              />
            )}
            {platform > 0 && (
              <CapHolderRow
                name="AJDUT plataforma"
                shares={platform}
                totalShares={totalShares}
                gold
              />
            )}
            {individualRows.map((row) => (
              <CapHolderRow
                key={row.name}
                name={row.name}
                shares={row.shares}
                totalShares={totalShares}
              />
            ))}
          </ul>
          <div className="px-5 py-3 hairline-t">
            <Link
              href={`/founder/${project.slug}/composicion` as Route}
              className="eyebrow !text-gold hover:!text-navy transition-colors"
            >
              Gestionar clases de accionistas →
            </Link>
          </div>
        </div>

        {/* ─── 09 · Checklist owner ─────────────────────────────── */}
        <div className="hairline bg-paper">
          <div className="px-5 pt-5 pb-5 hairline-b">
            <WidgetHeader n="09" title="Estado del proyecto" />
          </div>
          <ChecklistInline items={checklist} />
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
  children,
}: {
  n: string;
  title: string;
  editHref?: Route;
  editLabel?: string;
  urgent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="py-8 sm:py-10 hairline-b last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
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
}: {
  items: Array<{ label: string; done: boolean; href: Route; hint?: string }>;
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
                Completar →
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

function CapHolderRow({
  name,
  shares,
  totalShares,
  muted,
  gold,
}: {
  name: string;
  shares: number;
  totalShares: number;
  muted?: boolean;
  gold?: boolean;
}) {
  const pct = totalShares > 0 ? (shares / totalShares) * 100 : 0;
  // Mismo px-5 que el header del widget (Fondeo/Cap table), por lo que los
  // bordes hairline-b de cada fila se alinean visualmente con el divisor
  // del header sin "tocar abruptamente" el borde del contenedor.
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
          <span className="text-navy/40 text-xs">{pct.toFixed(1)}%</span>
          <span className="text-navy">{formatNumber(shares)}</span>
        </span>
      </div>
    </li>
  );
}
