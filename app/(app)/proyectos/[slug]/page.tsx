import Link from "next/link";
import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { getInfoRequest } from "@/lib/services/info-request";
import { getUserPreferences } from "@/lib/preferences";
import { getDict, getLocale, localeFor } from "@/lib/i18n";
import { InterestForm } from "./InterestForm";
import { InfoRequestForm } from "./InfoRequestForm";
import { AdminApprovalActions } from "./AdminApprovalActions";
import { AdminModerationActions } from "./AdminModerationActions";
import { ProjectBody } from "./ProjectBody";
import { ProjectHero } from "@/components/project/ProjectHero";
import { ProjectVideo } from "@/components/project/ProjectVideo";
import { ProjectSection } from "@/components/project/ProjectSection";
import { CapTableByClassCompact } from "@/components/project/CapTableByClassCompact";
import { computeCapTable, computeCapTableByClass } from "@/lib/services/cap-table";
import { BackLink } from "@/components/app/BackLink";
import { embedUrl } from "@/lib/utils/embed";
import {
  formatCurrency,
  formatDate,
  formatDualCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/utils/format";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const dict = await getDict();
  // Fetch barato: solo el name para meter en el title del browser.
  const project = await prisma.project
    .findUnique({ where: { slug }, select: { name: true } })
    .catch(() => null);
  return {
    title: project
      ? `${project.name} · AJDUT`
      : dict.metaTitles.proyectoDetailFallback,
  };
}

export default async function ProjectPage({ params }: Params) {
  const user = await requireSession();
  const { slug } = await params;
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.projectDetail;

  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, fullName: true } },
      startupProfile: {
        include: {
          founders: { orderBy: { joinedAt: "asc" } },
          milestones: { orderBy: { targetDate: "asc" } },
        },
      },
      participations: {
        include: {
          currentOwner: { select: { id: true, fullName: true, alias: true, role: true } },
        },
      },
      shareholderClasses: { orderBy: { order: "asc" } },
      externalHoldings: true,
    },
  });
  // Soft-delete: si el proyecto fue eliminado, tratamos como notFound — no
  // se exponen ni la ficha pública ni los datos del cap table.
  if (!project || project.deletedAt) notFound();

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canView) notFound();

  // Preferencias del viewer (MXN dual display + locale).
  const prefs = await getUserPreferences();
  const prefersMxn = prefs.currency === "MXN";
  const projectCurrencyForPrefs =
    project.startupProfile?.valuationCurrency ?? "USD";
  const showMxnDual = prefersMxn && projectCurrencyForPrefs === "USD";

  // InfoRequest del viewer para este proyecto (etapa 1 del flujo).
  const myInfoRequest =
    access.role === "PARTNER"
      ? await getInfoRequest(project.id, user.id)
      : null;
  const partnerHasApprovedInfo = myInfoRequest?.status === "APPROVED";


  // Snapshot de participaciones.
  //
  // ─── Notas sobre el "desfase del cap table" ────────────────────────
  // Hay DOS inventarios paralelos de acciones en este proyecto:
  //   (a) Participations administradas por AJDUT (Platform stake + Pool
  //       AVAILABLE + asignaciones a miembros). Estas SIEMPRE suman
  //       `project.totalShares`.
  //   (b) ExternalHoldings: accionistas pre-existentes declarados por el
  //       founder en /composicion (founders, inversores previos). Se
  //       contabilizan con `shareCount` por bucket, pero NO ajustan el pool
  //       AVAILABLE de AJDUT — viven afuera del sistema de Participations.
  //
  // Si el founder declara, p. ej., un 50% de fundadores en ExternalHoldings,
  // el cap table mostraba "Disponible 90%" + "Fundadores 50%" → suma 140%
  // y eso es el desfase que reportó el cliente.
  //
  // Fix de display vía cap table UNIFICADO (lib/services/cap-table):
  //   · El helper junta equipo fundador (equity%), tenencias externas, stake
  //     de plataforma, asignados vía AJDUT y el pool disponible (remanente)
  //     sobre `totalShares`. El equipo fundador AHORA descuenta del pool.
  //   · `poolShares` = total − comprometido (clamp a 0); reemplaza el viejo
  //     `availableForDisplay = available − external`.
  //   · `overcommit`/`verificationPct` alimentan la fila "Verificación" + aviso.
  //   · Mismos inputs que el founder dashboard (/founder/[projectSlug]) → ambas
  //     vistas muestran EXACTAMENTE el mismo cap table.
  const totalShares = project.totalShares;
  const sp = project.startupProfile;
  // Input UNIFICADO con clase de accionista. `computeCapTable` se usa para las
  // métricas/fondeo (pool, committed, plataforma); la distribución que se MUESTRA
  // es la agregada por clase (`computeCapTableByClass`) en formato compacto, igual
  // para los 3 tipos de usuario (CapTableByClassCompact).
  const capInput = {
    totalShares,
    founders: (sp?.founders ?? [])
      .filter((f) => f.isActive)
      .map((f) => ({
        name: f.fullName,
        equityPercent: Number(f.equityPercent),
        classId: f.shareholderClassId ?? null,
      })),
    externalHoldings: project.externalHoldings.map((h) => ({
      label:
        h.label && h.label.trim() !== ""
          ? h.label
          : t.capTable.preExistingFallback,
      shareCount: h.shareCount,
      peopleCount: h.peopleCount,
      classId: h.shareholderClassId ?? null,
    })),
    participations: project.participations.map((p) => ({
      status: p.status,
      shareCount: p.shareCount,
      isPlatformStake: p.isPlatformStake,
      classId: p.shareholderClassId ?? null,
      currentOwner: p.currentOwner
        ? {
            id: p.currentOwner.id,
            alias: p.currentOwner.alias,
            fullName: p.currentOwner.fullName,
          }
        : null,
    })),
  };
  const capTable = computeCapTable(capInput);

  const platformShares = capTable.platformShares;
  // `availableShares` es el pool AVAILABLE CRUDO de participaciones — se usa
  // para gatear el CTA "Me interesa" y el InterestForm (hay inventario real
  // que vender). Distinto del pool unificado de display (`availableForDisplay`),
  // que ya descuenta equipo + externas.
  const availableShares = project.participations
    .filter((p) => p.status === "AVAILABLE")
    .reduce((s, p) => s + p.shareCount, 0);
  // El "disponible" que se muestra es el remanente del cap table unificado.
  const availableForDisplay = capTable.poolShares;


  // Cap table por clase (anonimizado) — lo ve el miembro normal: composición
  // por clase de accionista (cantidad de personas + %), sin nombres. El
  // owner/admin ven el cap table nominal de arriba.
  //
  // Usa el MISMO helper unificado (`computeCapTableByClass`) que el dashboard
  // del founder, así que AHORA incluye al equipo fundador (equity% → shares,
  // por su clase) además de externas y asignados. Pool y "sin clasificar" van
  // como filas propias (tone muted). La participación de AJDUT Platform NO se
  // muestra en la vista anónima del miembro — se filtra la fila "platform".
  // Solo las 4 clases canónicas (con kind); AJDUT se fold en Inversor pasivo.
  const byClass = computeCapTableByClass(
    capInput,
    project.shareholderClasses
      .filter((c) => c.kind)
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
  );
  // Distribución por clase en formato compacto — la ven los 3 tipos de usuario.
  // Pool / reservado / sin-clasificar van atenuados; la plataforma ya está
  // foldeada en Inversor pasivo, así que filtramos cualquier fila "platform".
  const capCompactRows = byClass.rows
    .filter((row) => row.kind !== "platform")
    .map((row) => ({
      key: row.key,
      name:
        row.kind === "pool"
          ? t.capTable.unassigned
          : row.kind === "reserved"
            ? t.capTable.reserved
            : row.kind === "unclassified"
              ? t.capTable.unclassified
              : row.name,
      shares: row.shares,
      muted:
        row.kind === "pool" ||
        row.kind === "reserved" ||
        row.kind === "unclassified",
    }));

  // ¿Tiene el viewer participaciones en este proyecto?
  const myParticipations =
    access.role === "PARTNER" ||
    access.role === "ADMIN" ||
    access.role === "OWNER" ||
    access.role === "CO_ADMIN"
      ? project.participations.filter((p) => p.currentOwnerId === user.id)
      : [];

  const myShares = myParticipations.reduce((s, p) => s + p.shareCount, 0);

  // Gate de fecha de reventa: si el project owner definió una fecha de inicio
  // que todavía no llegó, deshabilitamos el botón "Revender" y comunicamos la
  // fecha. Fecha pasada (o null) → reventa habilitada normal.
  const resaleLocked =
    project.resaleAllowedFrom !== null &&
    new Date() < project.resaleAllowedFrom;

  // ───────────── Métricas de composición (siempre visibles) ─────────
  // "Socios totales" — distinct currentOwnerId sobre todas las
  // participations no AVAILABLE de este proyecto. Cuenta también la stake
  // de plataforma como un "socio" institucional para mantener el alineamiento
  // con la spec del SQL (where currentOwnerId is not null).
  const distinctOwnerIds = new Set<string>();
  for (const p of project.participations) {
    if (p.currentOwnerId) distinctOwnerIds.add(p.currentOwnerId);
  }
  const sociosTotales = distinctOwnerIds.size;
  // "Socios directivos y operativos" — founders/team ACTIVOS del StartupProfile.
  const sociosDirectivos =
    project.startupProfile?.founders.filter((f) => f.isActive).length ?? 0;
  // "Socios embajadores" — personas en la clase EMBAJADOR del cap table por
  // clase (founders + externas + asignados de esa clase). 0 si no existe la
  // clase o no tiene gente.
  const embajadorClassId = project.shareholderClasses.find(
    (c) => c.kind === "EMBAJADOR"
  )?.id;
  const sociosEmbajadores = embajadorClassId
    ? (byClass.rows.find((r) => r.key === embajadorClassId)?.people ?? 0)
    : 0;

  // Valor de la posición del viewer si hay valoración declarada.
  const valuationNum = project.startupProfile?.preMoneyValuation
    ? Number(project.startupProfile.preMoneyValuation)
    : null;
  const pricePerShare =
    valuationNum && totalShares > 0 ? valuationNum / totalShares : null;
  const myValue = pricePerShare !== null ? myShares * pricePerShare : null;
  const projectCurrency = project.startupProfile?.valuationCurrency ?? "USD";

  // Fondeo: el bar visible refleja lo que el viewer puede ver, derivado del
  // cap table UNIFICADO para que "colocadas" + "disponible (pool)" = total.
  //
  // "Colocadas" = todo lo comprometido (equipo fundador + externas + plataforma
  // + asignados vía AJDUT). Para el viewer privilegiado es `committedShares`
  // exacto (= total − poolShares). El miembro común NO ve el stake de Platform,
  // así que se le resta de las colocadas.
  const visibleAssigned = access.canSeeCapTable
    ? capTable.committedShares
    : capTable.committedShares - platformShares;
  const fundedPct =
    totalShares > 0
      ? Math.min(100, Math.max(0, (visibleAssigned / totalShares) * 100))
      : 0;

  // ───────────── Gating de secciones de letra-chica ──────────────────
  const isPrivilegedReaderForPolicies =
    access.role === "OWNER" ||
    access.role === "CO_ADMIN" ||
    access.role === "ADMIN";
  const canSeePoliciesGated =
    isPrivilegedReaderForPolicies || partnerHasApprovedInfo || myShares > 0;

  const canSeeTeam = access.role !== "PARTNER";

  // ───────────── CTAs del hero ───────────────────────────────────────
  // Hero: "Me interesa participar" (primario) + "Abrir chat" (secundario,
  // outline) para quien tiene acceso al chat. "Quiero más información" NO
  // va en el hero — vive en el sidebar como acción secundaria.
  type HeroCta = {
    kind: "primary" | "outline";
    label: string;
    href?: string;
    asText?: boolean;
  };
  const canCtaShow = access.canManifestInterest && availableShares > 0;
  const hasChatAccess =
    myShares > 0 ||
    access.role === "OWNER" ||
    access.role === "CO_ADMIN" ||
    access.role === "ADMIN";

  const heroCtas: HeroCta[] = [];
  if (access.canEdit) {
    // Founder / admin en su propia ficha: Editar información como primario
    // (acción principal del dueño), Abrir chat como outline a la derecha.
    heroCtas.push({
      kind: "primary",
      label: t.editInfo,
      href: `/founder/${project.slug}/editar`,
    });
    if (hasChatAccess) {
      heroCtas.push({
        kind: "outline",
        label: t.openChat,
        href: `/proyectos/${project.slug}/chat`,
      });
    }
  } else {
    if (canCtaShow) {
      heroCtas.push({ kind: "primary", label: t.interest, href: "#comprar" });
    }
    if (hasChatAccess) {
      heroCtas.push({
        kind: "outline",
        label: t.openChat,
        href: `/proyectos/${project.slug}/chat`,
      });
    }
  }

  // "Quiero más información" — CTA secundario que se renderiza en el
  // sidebar, debajo del botón de participar. Solo para el PARTNER que
  // todavía no tiene info aprobada.
  const moreInfoCta:
    | { pending: true; label: string }
    | { pending: false; label: string; href: string }
    | null =
    canCtaShow && access.role === "PARTNER" && !partnerHasApprovedInfo
      ? myInfoRequest?.status === "PENDING"
        ? { pending: true, label: t.waitingApproval }
        : { pending: false, label: t.requestInfo, href: "#info-request" }
      : null;

  // Editar información ahora vive en heroCtas como primario para el owner —
  // se quitó del satellite para no duplicar el botón abajo del hero.
  type SatAct = { kind: "outline" | "ghost"; label: string; href?: string };
  const satellite: SatAct[] = [];

  // ───────────── Stats de la banda unificada ────────────────────────
  // "Disponibles" muestra el pool YA descontado por externalHoldings — así
  // el founder no ve "Disponibles 90%" cuando en realidad ya comprometió un
  // 40% de pre-existentes. El stat queda coherente con el cap table de abajo.
  const fundingStats: { label: string; value: string; hint?: string }[] = [
    {
      label: t.participations.available,
      value: formatNumber(availableForDisplay, undefined, locale),
      hint: `${dict.projectList.of} ${formatNumber(totalShares, undefined, locale)}`,
    },
  ];
  if (pricePerShare !== null) {
    fundingStats.push({
      label: t.funding.pricePerShare,
      value: formatCurrency(pricePerShare, projectCurrency, 2, locale),
      hint:
        showMxnDual
          ? (formatDualCurrency(pricePerShare, true).secondary ??
            t.funding.pricePerShareHint)
          : t.funding.pricePerShareHint,
    });
  }
  if (project.startupProfile?.preMoneyValuation) {
    const amt = Number(project.startupProfile.preMoneyValuation);
    const dual = showMxnDual ? formatDualCurrency(amt, true, 0) : null;
    fundingStats.push({
      label: t.participations.valuation,
      value: formatCurrency(amt, projectCurrency, 0, locale),
      hint: dual?.secondary ?? t.participations.valuationHint,
    });
  }
  if (project.startupProfile?.targetRaiseAmount) {
    const amt = Number(project.startupProfile.targetRaiseAmount);
    const dual = showMxnDual ? formatDualCurrency(amt, true, 0) : null;
    fundingStats.push({
      label: t.participations.targetRaise,
      value: formatCurrency(amt, projectCurrency, 0, locale),
      hint: dual?.secondary ?? t.participations.targetRaiseHint,
    });
  }

  // ───────────── Composición de secciones ────────────────────────────
  // Definimos las secciones como una lista plana con tono. Se renderiza en
  // orden, con número de orden automático. El tono dicta el peso visual.
  type SectionDef = {
    /** `string | undefined` porque `t.sections` es `Record<string, string>` y
     *  bajo noUncheckedIndexedAccess los lookups devuelven posible undefined. */
    title: string | undefined;
    tone: "vitrina" | "ref";
    /** Pegamos el "próximo paso" inline solo en algunas secciones vitrina. */
    withInlineCta?: boolean;
    /** Ancla para links internos del sidebar (ej. "politicas"). */
    anchorId?: string;
    /** Acción alineada a la derecha del header (ej. botón Revender). */
    headerAction?: React.ReactNode;
    node: React.ReactNode;
  };
  const sections: SectionDef[] = [];

  // ¿El proyecto tiene políticas propias visibles? Lo reusamos para la
  // sección y para el link del sidebar (que ancla a ella).
  const hasProjectPolicies =
    canSeePoliciesGated &&
    !!(
      project.startupProfile?.policyShares ||
      project.startupProfile?.policyDividends ||
      project.startupProfile?.dividendsFrequency
    );

  // — Resumen — la sección que más "vende".
  if (project.startupProfile) {
    const hasAnySummary =
      !!project.startupProfile.problemStatement ||
      !!project.startupProfile.solutionStatement ||
      !!project.startupProfile.businessModel ||
      !!project.description;
    sections.push({
      title: t.sections.summary,
      tone: "vitrina",
      withInlineCta: hasAnySummary && canCtaShow,
      node: hasAnySummary ? (
        // Lista de definición apilada: label a la izquierda, cuerpo a la
        // derecha. Más legible que 3 columnas angostas — el texto respira.
        <dl className="hairline-t">
          {project.startupProfile.problemStatement && (
            <SummaryRow
              label={t.summary.problem}
              body={project.startupProfile.problemStatement}
            />
          )}
          {project.startupProfile.solutionStatement && (
            <SummaryRow
              label={t.summary.solution}
              body={project.startupProfile.solutionStatement}
            />
          )}
          {project.startupProfile.businessModel && (
            <SummaryRow
              label={t.summary.businessModel}
              body={project.startupProfile.businessModel}
            />
          )}
          {project.description && project.description.trim() !== "" && (
            <SummaryRow
              label={t.summary.description}
              body={project.description}
            />
          )}
        </dl>
      ) : (
        <p className="text-navy/60 leading-relaxed">{t.emptySection}</p>
      ),
    });
  }

  // — Estructura y respaldo (vitrina).
  if (
    project.startupProfile?.assetBackingNote ||
    project.startupProfile?.equityStructureNote
  ) {
    sections.push({
      title: t.sections.structure,
      tone: "vitrina",
      withInlineCta: canCtaShow,
      node: (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {project.startupProfile.assetBackingNote && (
            <Block
              title={t.structure.assetBacking}
              body={project.startupProfile.assetBackingNote}
            />
          )}
          {project.startupProfile.equityStructureNote && (
            <Block
              title={t.structure.equityStructure}
              body={project.startupProfile.equityStructureNote}
            />
          )}
        </div>
      ),
    });
  }

  // — Equipo (vitrina, gated).
  if (canSeeTeam && (project.startupProfile?.founders.length ?? 0) > 0) {
    sections.push({
      title: t.sections.team,
      tone: "vitrina",
      node: (
        <ul className="hairline-t max-w-3xl">
          {project.startupProfile!.founders.map((f) => (
            <li key={f.id} className="hairline-b last:border-b-0 py-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-navy text-lg break-words">{f.fullName}</span>
                <span className="font-mono text-navy text-sm">
                  {formatPercent(Number(f.equityPercent), 2, locale)}
                </span>
              </div>
              <p className="eyebrow !text-navy/60">{f.role}</p>
              {f.bio && (
                <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                  {f.bio}
                </p>
              )}
              {f.references && (
                <div className="mt-3 hairline-t pt-3">
                  <p className="eyebrow mb-1">{t.team.references}</p>
                  <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                    {f.references}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      ),
    });
  }

  // — Hitos (vitrina).
  // Estructura tabular: fecha (col-2) | badge de status (col-3) | título (col-7).
  // Status como micro-badge con bg de baja opacidad — verde para "Logrado"
  // (achieved), neutro para el resto. La fecha mono en navy/50.
  if ((project.startupProfile?.milestones.length ?? 0) > 0) {
    sections.push({
      title: t.sections.milestones,
      tone: "vitrina",
      node: (
        <ul className="hairline-t">
          {project.startupProfile!.milestones.map((m) => {
            const isDone = m.status === "ACHIEVED";
            // Badge: verde sutil para logrados, neutro para el resto.
            const badgeCls = isDone
              ? "bg-emerald-500/10 text-emerald-700"
              : "bg-navy/[0.04] text-navy/60";
            return (
              <li
                key={m.id}
                className="hairline-b last:border-b-0 grid grid-cols-12 items-center gap-x-3 gap-y-1 py-2.5"
              >
                <span className="col-span-5 sm:col-span-2 font-mono text-xs tracking-wider text-navy/50">
                  {m.achievedAt
                    ? formatDate(m.achievedAt, locale)
                    : m.targetDate
                      ? formatDate(m.targetDate, locale)
                      : "—"}
                </span>
                <span className="col-span-7 sm:col-span-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[10px] tracking-[0.16em] uppercase ${badgeCls}`}
                  >
                    {t.milestoneStatus[m.status] ?? m.status}
                  </span>
                </span>
                <span className="col-span-12 sm:col-span-7 text-navy text-sm leading-snug">
                  {m.title}
                </span>
              </li>
            );
          })}
        </ul>
      ),
    });
  }

  // — Tu participación (ref, solo si tenés acciones).
  if (myShares > 0) {
    // CTA Revender — vive arriba a la derecha del header de la sección.
    // Si el project owner definió una fecha de inicio de reventa que todavía
    // no llegó, el botón queda deshabilitado (la fecha se muestra bajo las
    // tarjetas). Fecha pasada (o null) → botón habilitado normal.
    // Mismo estilo que las acciones del header del owner en su dashboard
    // (eyebrow gold + flecha, p. ej. "NUEVO REPORTE →").
    const revenderAction = resaleLocked ? (
      <span
        className="eyebrow !text-navy/30 shrink-0 whitespace-nowrap cursor-not-allowed"
        aria-disabled="true"
      >
        {t.revenderBtn} →
      </span>
    ) : (
      <Link
        href={`/proyectos/${project.slug}/reventa` as Route}
        className="eyebrow !text-navy/50 hover:!text-gold transition-colors shrink-0 whitespace-nowrap"
      >
        {t.revenderBtn} →
      </Link>
    );
    sections.push({
      title: t.sections.yourParticipation,
      tone: "ref",
      headerAction: revenderAction,
      node: (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              label={t.yours.shares}
              value={formatNumber(myShares, undefined, locale)}
              hint={`${dict.projectList.of} ${formatNumber(totalShares, undefined, locale)}`}
              highlight
            />
            <StatCard
              label={t.yours.value}
              value={myValue !== null ? formatCurrency(myValue, projectCurrency, 2, locale) : "—"}
              hint={
                showMxnDual && myValue !== null
                  ? (formatDualCurrency(myValue, true).secondary ??
                    (pricePerShare !== null
                      ? `${formatCurrency(pricePerShare, projectCurrency, 2, locale)} ${t.yours.pricePerShareSuffix}`
                      : t.yours.noValuation))
                  : pricePerShare !== null
                    ? `${formatCurrency(pricePerShare, projectCurrency, 2, locale)} ${t.yours.pricePerShareSuffix}`
                    : t.yours.noValuation
              }
            />
            <StatCard
              label={t.yours.participations}
              value={String(myParticipations.length)}
              hint={
                myParticipations.length === 1
                  ? t.yours.oneRecord
                  : `${myParticipations.length} ${t.yours.manyRecordsSuffix}`
              }
            />
          </div>

          {/* El botón Revender vive en el header de la sección (headerAction).
              Acá solo dejamos el aviso de fecha cuando la reventa todavía no
              está habilitada por el project owner. */}
          {resaleLocked && (
            <p className="mt-4 eyebrow !text-gold">
              {t.resaleLockedFmt.replace(
                "{date}",
                formatDate(project.resaleAllowedFrom!, locale)
              )}
            </p>
          )}

          {myParticipations.length > 0 && (
            <ul className="mt-6 space-y-5">
              <li className="hidden sm:grid grid-cols-12 gap-3 pb-1">
                <span className="sm:col-span-5 eyebrow !text-navy/40">
                  {t.yours.colSerial}
                </span>
                <span className="sm:col-span-3 eyebrow !text-navy/40">
                  {t.yours.colShares}
                </span>
                <span className="sm:col-span-2 eyebrow !text-navy/40">
                  {dict.projectList.of} {formatNumber(totalShares, undefined, locale)}
                </span>
                <span className="sm:col-span-2 eyebrow !text-navy/40 text-right">
                  {t.yours.colAcquired}
                </span>
              </li>
              {myParticipations.map((p) => (
                <li key={p.id} className="grid grid-cols-12 items-center gap-3">
                  <div className="col-span-12 sm:col-span-5 min-w-0">
                    <p className="font-mono text-sm text-navy break-all">
                      {p.serialCode}
                    </p>
                    <p className="mt-1 eyebrow">
                      {t.participationStatus[p.status] ?? p.status}
                    </p>
                  </div>
                  <div className="col-span-12 sm:col-span-3">
                    <p className="eyebrow sm:hidden">{t.yours.colShares}</p>
                    <p className="mt-1 sm:mt-0 font-mono text-navy">
                      {formatNumber(p.shareCount, undefined, locale)}
                    </p>
                  </div>
                  {/* "de N total" — solo visible en sm+: el header de la
                      tabla ya pinta el contexto, repetir en mobile mete
                      ruido y duplica el label encima del valor. */}
                  <div className="hidden sm:block sm:col-span-2">
                    <p className="font-mono text-navy">
                      {dict.projectList.of} {formatNumber(totalShares, undefined, locale)}
                    </p>
                  </div>
                  <div className="col-span-12 sm:col-span-2 text-right">
                    <p className="eyebrow sm:hidden">{t.yours.colAcquired}</p>
                    <p className="mt-1 sm:mt-0 eyebrow !text-navy">
                      {p.acquiredAt ? formatDate(p.acquiredAt, locale) : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    });
  }

  // — Métricas (ref). Solo las 4 métricas de comunidad/valuación. Las
  // métricas operativas (MRR/DAU/etc.) se removieron a pedido — el foco
  // es la composición de socios y la valuación. Con exactamente 4 tarjetas
  // el grid queda 2×2 en mobile y una fila de 4 en desktop.
  {
    const valuationLabel =
      valuationNum !== null
        ? formatCurrency(valuationNum, projectCurrency, 0, locale)
        : "—";
    sections.push({
      title: t.sections.metrics,
      tone: "ref",
      node: (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label={t.metricSociosDirectivos}
            value={formatNumber(sociosDirectivos, undefined, locale)}
          />
          <StatCard
            label={t.metricSociosEmbajadores}
            value={formatNumber(sociosEmbajadores, undefined, locale)}
          />
          <StatCard
            label={t.metricSociosTotales}
            value={formatNumber(sociosTotales, undefined, locale)}
          />
          <StatCard
            label={t.metricValuacionActual}
            value={valuationLabel}
            hint={
              valuationNum !== null && showMxnDual
                ? (formatDualCurrency(valuationNum, true, 0).secondary ?? undefined)
                : undefined
            }
          />
        </div>
      ),
    });
  }

  // — Políticas (ref, gated).
  if (hasProjectPolicies) {
    sections.push({
      title: t.sections.policies,
      tone: "ref",
      anchorId: "politicas",
      node: (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 max-w-4xl">
          {project.startupProfile?.policyShares && (
            <Block title={t.policies.shares} body={project.startupProfile.policyShares} />
          )}
          {project.startupProfile?.policyDividends && (
            <Block
              title={t.policies.dividends}
              body={project.startupProfile.policyDividends}
            />
          )}
          {project.startupProfile?.dividendsFrequency && (
            <Block
              title={t.policies.frequency}
              body={project.startupProfile.dividendsFrequency}
            />
          )}
        </div>
      ),
    });
  }

  // Embed del video — visible para cualquier viewer del proyecto.
  const videoEmbed = project.startupProfile?.videoUrl
    ? embedUrl(project.startupProfile.videoUrl)
    : null;

  return (
    <div>
      <div className="mt-4">
        <ProjectHero
          contextEyebrow={
            <BackLink fallback={backLinkFor(user.role)}>
              {t.heroContextEyebrow.replace(/^—\s*/, "")}
            </BackLink>
          }
          eyebrow={{
            kind: t.kind[project.kind] ?? project.kind,
            sector: project.startupProfile?.sector,
            stage: project.startupProfile?.stage
              ? {
                  key: project.startupProfile.stage,
                  label:
                    dict.projectList.stage[project.startupProfile.stage] ??
                    project.startupProfile.stage,
                }
              : null,
            stageInfo: t.stageInfo,
            stageInfoAriaLabel: dict.common.moreInfo,
            location: project.startupProfile?.location,
          }}
          name={project.name}
          oneLiner={project.startupProfile?.oneLiner}
          founderName={project.owner.fullName}
          founderRoleLabel={t.founderLabel}
          websiteUrl={project.startupProfile?.websiteUrl}
          actions={heroCtas}
          satellite={satellite}
          /* Video integrado al hero (columna derecha) — solo si hay URL. */
          video={
            project.startupProfile?.videoUrl ? (
              <ProjectVideo
                embedSrc={videoEmbed}
                rawUrl={project.startupProfile.videoUrl}
                titlePrefix={t.videoTitlePrefix}
                projectName={project.name}
                openLabel={t.openVideo}
                bare
              />
            ) : undefined
          }
        />
      </div>

      {/* PARTNER con InfoRequest REJECTED: aviso visible. */}
      {access.role === "PARTNER" && myInfoRequest?.status === "REJECTED" && (
        <div className="mt-8 hairline p-4 bg-paper-light">
          <p className="eyebrow">{t.requestNotApproved}</p>
          {myInfoRequest.reviewNote && (
            <p className="mt-2 text-navy/75 leading-relaxed whitespace-pre-line text-sm">
              {myInfoRequest.reviewNote}
            </p>
          )}
        </div>
      )}

      {/* Panel de moderación: admin sobre un proyecto PENDING_APPROVAL. */}
      {access.role === "ADMIN" && project.status === "PENDING_APPROVAL" && (
        <div className="mt-8">
          <AdminApprovalActions projectSlug={project.slug} dict={dict.adminApproval} />
        </div>
      )}


      {/* Forms — viven antes del cuerpo y, cuando abren su hash, ProjectBody
          oculta el resto del scroll para foco total.
          · InterestForm (#comprar): disponible para TODOS los que pueden
            manifestar interés — sin gate de InfoRequest.
          · InfoRequestForm (#info-request): opción secundaria para el
            PARTNER que aún no tiene info aprobada. */}
      {access.canManifestInterest && availableShares > 0 && (
        <>
          {access.role === "PARTNER" && !partnerHasApprovedInfo && (
            <div id="info-request">
              <InfoRequestForm
                projectSlug={project.slug}
                projectName={project.name}
                viewerName={user.name}
                dict={dict.infoRequestForm}
              />
            </div>
          )}

          <div id="comprar">
            <InterestForm
              projectSlug={project.slug}
              projectName={project.name}
              viewerName={user.name}
              availableShares={availableShares}
              valuation={
                project.startupProfile?.preMoneyValuation
                  ? Number(project.startupProfile.preMoneyValuation)
                  : null
              }
              totalShares={project.totalShares}
              currency={project.startupProfile?.valuationCurrency ?? "USD"}
              dict={dict.interestForm}
              locale={localeFor(prefs.language)}
            />
          </div>
        </>
      )}

      {/* Cuerpo: grid de 2 columnas. Main editorial a la izquierda
          (sections.map) — sidebar pegajoso a la derecha con Fondeo,
          Cap Table y CTA. Sin huecos blancos en el scroll inferior. */}
      <ProjectBody hideOnHash={["#comprar", "#info-request"]}>
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-x-10 xl:gap-x-14 gap-y-8">
          {/* ─── COLUMNA PRINCIPAL ──────────────────────────────── */}
          {/* Sin space-y: cada ProjectSection ya trae su pt + hairline-t.
              El CTA "Me interesa participar" vive solo en el hero y en el
              sidebar sticky — sin repetirlo inline ni en un footer. */}
          <div className="min-w-0">
            {sections.map((s, i) => (
              <ProjectSection
                key={i}
                index={i + 1}
                title={s.title}
                tone={s.tone}
                isFirst={i === 0}
                anchorId={s.anchorId}
                headerAction={s.headerAction}
              >
                {s.node}
              </ProjectSection>
            ))}
          </div>

          {/* ─── SIDEBAR PEGAJOSO ───────────────────────────────── */}
          {/* Panel de control — sin numeración (esa es del main column).
              Headers como eyebrow para distinguirlo del flujo editorial. */}
          <aside className="lg:sticky lg:top-6 lg:self-start lg:h-fit space-y-5">
            {/* Bloque Fondeo compacto. */}
            <div className="hairline bg-paper p-5">
              <p className="eyebrow !text-navy/40 mb-4">{t.sections.funding}</p>
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-navy/50">
                {t.funding.placedHeadlineSuffix}
              </p>
              <p className="mt-1.5 font-mono text-2xl text-navy leading-none">
                <span className="text-gold">
                  {formatNumber(visibleAssigned, undefined, locale)}
                </span>
                <span className="text-navy/40"> / {formatNumber(totalShares, undefined, locale)}</span>
              </p>
              <div className="mt-4 h-2.5 w-full rounded-full bg-line/60 overflow-hidden">
                <div
                  className="h-full bg-gold rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${fundedPct}%` }}
                  aria-hidden
                />
              </div>
              {fundingStats.length > 0 && (
                <dl className="mt-5 space-y-2.5">
                  {fundingStats.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt className="eyebrow !text-navy/50 truncate">{s.label}</dt>
                      <dd className="font-mono text-sm text-navy text-right shrink-0">
                        {s.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {/* Comunicación a compradores potenciales: si la reventa de este
                  proyecto todavía no está habilitada, avisamos desde cuándo
                  podrán adquirirse participaciones en el tablón de reventa.
                  Solo para quien no es holder (el holder ve el aviso propio en
                  "Tu participación"). */}
              {resaleLocked && myShares === 0 && (
                <p className="mt-5 eyebrow !text-navy/50 leading-relaxed normal-case tracking-normal">
                  {t.resaleStartsFmt.replace(
                    "{date}",
                    formatDate(project.resaleAllowedFrom!, locale)
                  )}
                </p>
              )}
            </div>

            {/* Distribución de capital por clase (compacta) — la ven los 3
                tipos de usuario por igual. */}
            {capCompactRows.length > 0 && (
              <div className="hairline bg-paper">
                <p className="px-5 pt-5 pb-3 eyebrow !text-navy/40 hairline-b">
                  {t.sections.capTable}
                </p>
                <CapTableByClassCompact
                  rows={capCompactRows}
                  totalShares={totalShares}
                  locale={locale}
                />
              </div>
            )}

            {/* CTA del sidebar: "Me interesa participar" como botón
                primario + "Quiero más información" como acción secundaria
                debajo (solo PARTNER sin info aprobada). */}
            {canCtaShow && (
              <div className="pt-2 space-y-3">
                <a href="#comprar" className="btn-primary w-full">
                  {t.interest}
                </a>
                {moreInfoCta &&
                  (moreInfoCta.pending ? (
                    <p className="eyebrow !text-navy/40 text-center">
                      {moreInfoCta.label}
                    </p>
                  ) : (
                    <a
                      href={moreInfoCta.href}
                      className="block text-center eyebrow !text-navy/50 hover:!text-gold transition-colors"
                    >
                      {moreInfoCta.label}
                    </a>
                  ))}
              </div>
            )}

            {/* Moderación del admin (inactivar / reactivar / eliminar) — barra
                fina debajo del CTA, solo para admin sobre proyectos aprobados. */}
            {access.role === "ADMIN" &&
              (project.status === "ACTIVE" || project.status === "SUSPENDED") && (
                <AdminModerationActions
                  projectSlug={project.slug}
                  status={project.status}
                  dict={dict.adminApproval}
                />
              )}

            {/* Link a las políticas DEL PROYECTO (participaciones, dividendos,
                frecuencia) — ancla a la sección de políticas más abajo en la
                misma ficha. Solo se muestra si el proyecto las cargó y el
                viewer puede verlas. Las políticas generales de AJDUT viven en
                el footer del sitio, no acá. */}
            {hasProjectPolicies && (
              <div className="pt-1">
                <a
                  href="#politicas"
                  className="block text-center eyebrow !text-navy/40 hover:!text-gold transition-colors"
                >
                  {t.politicasLink}
                </a>
              </div>
            )}
          </aside>
        </div>
      </ProjectBody>
    </div>
  );
}


function backLinkFor(role: string): Route {
  if (role === "ADMIN") return "/admin/projects" as Route;
  return "/proyectos" as Route;
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="eyebrow mb-3">{title}</p>
      <p className="text-navy/85 leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  );
}

/**
 * Fila de definición — label eyebrow a la izquierda, cuerpo a la derecha.
 * Patrón editorial usado en el Resumen: legible para textos largos.
 */
function SummaryRow({ label, body }: { label: string; body: string }) {
  return (
    <div className="hairline-b last:border-b-0 grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-1.5 sm:gap-6 py-4">
      <dt className="eyebrow !text-navy/40 sm:pt-0.5">{label}</dt>
      <dd className="text-navy/85 leading-relaxed whitespace-pre-line">{body}</dd>
    </div>
  );
}

/**
 * Tarjeta compacta de métrica/dato — el ÚNICO estilo de card de la ficha.
 * Usada en "Tu participación" y en "Métricas" para que sean idénticas.
 * `highlight` pinta el valor en oro (acento para el dato propio del viewer).
 */
function StatCard({
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
    <div className="hairline bg-paper py-3 px-4">
      <p className="eyebrow !text-navy/40 truncate">{label}</p>
      <p
        className={`mt-1.5 font-mono text-lg leading-none ${
          highlight ? "text-gold" : "text-navy"
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1.5 font-mono text-[11px] tracking-wider text-navy/40 truncate">
          {hint}
        </p>
      )}
    </div>
  );
}

