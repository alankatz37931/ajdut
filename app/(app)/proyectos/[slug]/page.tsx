import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { getInfoRequest } from "@/lib/services/info-request";
import { getUserPreferences } from "@/lib/preferences";
import { getDict, getLocale, localeFor } from "@/lib/i18n";
import { KpiCard } from "@/components/ui/KpiCard";
import { InterestForm } from "./InterestForm";
import { InfoRequestForm } from "./InfoRequestForm";
import { AdminApprovalActions } from "./AdminApprovalActions";
import { ProjectBody } from "./ProjectBody";
import { ProjectHero } from "@/components/project/ProjectHero";
import { ProjectVideo } from "@/components/project/ProjectVideo";
import { FundingBar } from "@/components/project/FundingBar";
import { ProjectSection } from "@/components/project/ProjectSection";
import { CapTableViz } from "@/components/project/CapTableViz";
import { InlineParticipateCta } from "@/components/project/InlineParticipateCta";
import { ParticipateFooterCta } from "@/components/project/ParticipateFooterCta";
import { embedUrl } from "@/lib/utils/embed";
import {
  formatCurrency,
  formatDate,
  formatDualCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/utils/format";

type Params = { params: Promise<{ slug: string }> };

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
    },
  });
  if (!project) notFound();

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

  // Métricas con visibility según rol.
  const metrics = await prisma.startupMetric.findMany({
    where: {
      startupProfileId: project.startupProfile?.id,
      ...(access.canSeePrivateMetrics ? {} : { visibility: "PUBLIC_TO_HOLDERS" }),
    },
    orderBy: { asOf: "desc" },
  });

  // Reportes publicados por el founder.
  const reports = await prisma.report.findMany({
    where: { projectId: project.id },
    orderBy: { publishedAt: "desc" },
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

  // Snapshot de participaciones.
  const totalShares = project.totalShares;
  const platformShares = project.participations
    .filter((p) => p.isPlatformStake)
    .reduce((s, p) => s + p.shareCount, 0);
  const assignedShares = project.participations
    .filter((p) => ["ASSIGNED", "IN_RESALE", "TRANSFER_PENDING"].includes(p.status))
    .reduce((s, p) => s + p.shareCount, 0);
  const availableShares = project.participations
    .filter((p) => p.status === "AVAILABLE")
    .reduce((s, p) => s + p.shareCount, 0);

  // Cap table agrupado por dueño (solo para roles permitidos).
  type CapRow = { holder: string; isPlatform: boolean; shares: number };
  const capTable: CapRow[] = [];
  if (access.canSeeCapTable) {
    const byOwner = new Map<string, { name: string; isPlatform: boolean; shares: number }>();
    for (const p of project.participations) {
      if (!p.currentOwnerId || !p.currentOwner) continue;
      const existing = byOwner.get(p.currentOwnerId);
      if (existing) {
        existing.shares += p.shareCount;
      } else {
        const displayName = p.isPlatformStake
          ? t.capTable.platform
          : p.currentOwner.alias ?? p.currentOwner.fullName;
        byOwner.set(p.currentOwnerId, {
          name: displayName,
          isPlatform: p.isPlatformStake,
          shares: p.shareCount,
        });
      }
    }
    capTable.push(
      ...Array.from(byOwner.values()).map((v) => ({
        holder: v.name,
        isPlatform: v.isPlatform,
        shares: v.shares,
      }))
    );
    if (availableShares > 0) {
      capTable.push({
        holder: t.capTable.unassigned,
        isPlatform: false,
        shares: availableShares,
      });
    }
    capTable.sort((a, b) => b.shares - a.shares);
  }

  // Métricas: agrupar por kind y mostrar el último valor.
  type MetricRow = { kind: string; label: string; value: string; unit: string; asOf: Date };
  const latestByKind = new Map<string, MetricRow>();
  for (const m of metrics) {
    if (!latestByKind.has(m.kind)) {
      latestByKind.set(m.kind, {
        kind: m.kind,
        label: m.customLabel ?? METRIC_LABEL[m.kind] ?? m.kind,
        value: Number(m.value).toLocaleString(locale),
        unit: m.unit,
        asOf: m.asOf,
      });
    }
  }

  // ¿Tiene el viewer participaciones en este proyecto?
  const myParticipations =
    access.role === "PARTNER" ||
    access.role === "ADMIN" ||
    access.role === "OWNER" ||
    access.role === "CO_ADMIN"
      ? project.participations.filter((p) => p.currentOwnerId === user.id)
      : [];

  const myShares = myParticipations.reduce((s, p) => s + p.shareCount, 0);

  // Valor de la posición del viewer si hay valoración declarada.
  const valuationNum = project.startupProfile?.preMoneyValuation
    ? Number(project.startupProfile.preMoneyValuation)
    : null;
  const pricePerShare =
    valuationNum && totalShares > 0 ? valuationNum / totalShares : null;
  const myValue = pricePerShare !== null ? myShares * pricePerShare : null;
  const projectCurrency = project.startupProfile?.valuationCurrency ?? "USD";

  // Fondeo: el bar visible refleja lo que el viewer puede ver.
  const visibleAssigned = access.canSeeCapTable
    ? assignedShares
    : assignedShares - platformShares;
  const fundedPct =
    totalShares > 0
      ? Math.min(100, Math.max(0, (visibleAssigned / totalShares) * 100))
      : 0;

  function humanReportPeriod(period: string, year: number): string {
    if (period === "ANNUAL") return `${t.reports.annual} ${year}`;
    if (period === "EXTRAORDINARY") return `${t.reports.extraordinary} ${year}`;
    return `${period} ${year}`;
  }

  function reportKindLabel(kind: string): string {
    switch (kind) {
      case "QUARTERLY_FINANCIAL":
        return t.reports.kindQuarterly;
      case "INVESTOR_UPDATE":
        return t.reports.kindInvestorUpdate;
      case "ANNUAL_AUDIT":
        return t.reports.kindAnnualAudit;
      case "EXTRAORDINARY":
        return t.reports.kindExtraordinary;
      default:
        return kind;
    }
  }

  // ───────────── Gating de secciones de letra-chica ──────────────────
  const isPrivilegedReaderForPolicies =
    access.role === "OWNER" ||
    access.role === "CO_ADMIN" ||
    access.role === "ADMIN";
  const canSeePoliciesGated =
    isPrivilegedReaderForPolicies || partnerHasApprovedInfo || myShares > 0;

  const canSeeTeam = access.role !== "PARTNER";

  const isPrivilegedReader =
    access.role === "OWNER" ||
    access.role === "CO_ADMIN" ||
    access.role === "ADMIN";
  const canSeePrivateDocs =
    isPrivilegedReader || partnerHasApprovedInfo || myShares > 0;

  // ───────────── CTA principal: ¿qué pintamos en el hero? ────────────
  // Logica: la prioridad es PARTNER → InfoRequest → InterestForm; el resto
  // (admin/owner) entra directo a "Me interesa participar". Si no hay
  // acciones, el botón no aparece (la sección de cierre lo explica).
  type HeroCta = { kind: "primary"; label: string; href?: string; asText?: boolean };
  const heroCtas: HeroCta[] = [];
  const canCtaShow = access.canManifestInterest && availableShares > 0;
  if (canCtaShow) {
    if (access.role === "PARTNER") {
      if (myInfoRequest?.status === "PENDING") {
        heroCtas.push({ kind: "primary", label: t.waitingApproval, asText: true });
      } else if (myInfoRequest?.status === "APPROVED") {
        heroCtas.push({ kind: "primary", label: t.interest, href: "#comprar" });
      } else {
        heroCtas.push({ kind: "primary", label: t.requestInfo, href: "#info-request" });
      }
    } else {
      heroCtas.push({ kind: "primary", label: t.interest, href: "#comprar" });
    }
  }

  // Acciones satélite (esquinita superior). Editar y chat.
  type SatAct = { kind: "outline" | "ghost"; label: string; href?: string };
  const satellite: SatAct[] = [];
  if (
    myShares > 0 ||
    access.role === "OWNER" ||
    access.role === "CO_ADMIN" ||
    access.role === "ADMIN"
  ) {
    satellite.push({
      kind: "ghost",
      label: t.openChat,
      href: `/proyectos/${project.slug}/chat`,
    });
  }
  if (access.canEdit) {
    satellite.push({
      kind: "outline",
      label: t.editInfo,
      href: `/founder/${project.slug}/editar`,
    });
  }

  // ───────────── Stats de la banda unificada ────────────────────────
  const fundingStats: { label: string; value: string; hint?: string }[] = [
    {
      label: t.participations.available,
      value: formatNumber(availableShares, undefined, locale),
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
    node: React.ReactNode;
  };
  const sections: SectionDef[] = [];

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
      node: (
        <>
          {hasAnySummary ? (
            <div className="grid grid-cols-1 gap-8 sm:gap-10 md:grid-cols-3">
              <Block title={t.summary.problem} body={project.startupProfile.problemStatement} />
              <Block title={t.summary.solution} body={project.startupProfile.solutionStatement} />
              <Block title={t.summary.businessModel} body={project.startupProfile.businessModel} />
            </div>
          ) : (
            <p className="text-navy/60 leading-relaxed">{t.emptySection}</p>
          )}
          {project.description && project.description.trim() !== "" && (
            <div className="mt-10 hairline-t pt-8 max-w-3xl">
              <p className="eyebrow mb-3">{t.summary.description}</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.description}
              </p>
            </div>
          )}
        </>
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
        <div className="grid grid-cols-1 gap-8 sm:gap-10 md:grid-cols-2">
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
        <ul className="space-y-10 max-w-3xl">
          {project.startupProfile!.founders.map((f) => (
            <li key={f.id} className="space-y-3">
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
                  {/* TODO i18n: campo libre del founder; mantenemos label en es por scope. */}
                  <p className="eyebrow mb-1">Referencias</p>
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
  if ((project.startupProfile?.milestones.length ?? 0) > 0) {
    sections.push({
      title: t.sections.milestones,
      tone: "vitrina",
      node: (
        <ul className="hairline-t">
          {project.startupProfile!.milestones.map((m) => (
            <li
              key={m.id}
              className="hairline-b grid grid-cols-12 items-baseline gap-3 py-4"
            >
              <span className="col-span-12 sm:col-span-6 text-navy">
                {m.title}
              </span>
              <span className="col-span-6 sm:col-span-3 eyebrow !text-navy">
                {t.milestoneStatus[m.status] ?? m.status}
              </span>
              <span className="col-span-6 sm:col-span-3 eyebrow text-right">
                {m.achievedAt
                  ? formatDate(m.achievedAt, locale)
                  : m.targetDate
                  ? `${t.milestonesTargetPrefix} ${formatDate(m.targetDate, locale)}`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
      ),
    });
  }

  // — Tu participación (ref, solo si tenés acciones).
  if (myShares > 0) {
    sections.push({
      title: t.sections.yourParticipation,
      tone: "ref",
      node: (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-line">
            <KpiCard
              label={t.yours.shares}
              value={formatNumber(myShares, undefined, locale)}
              hint={`${formatNumber(myShares, undefined, locale)} ${dict.projectList.of} ${formatNumber(totalShares, undefined, locale)}`}
              highlight
              className="bg-paper-light"
            />
            <KpiCard
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
              className="bg-paper-light"
            />
            <KpiCard
              label={t.yours.participations}
              value={String(myParticipations.length)}
              hint={
                myParticipations.length === 1
                  ? t.yours.oneRecord
                  : `${myParticipations.length} ${t.yours.manyRecordsSuffix}`
              }
              className="bg-paper-light"
            />
          </div>

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
                  <div className="col-span-6 sm:col-span-3">
                    <p className="eyebrow sm:hidden">{t.yours.colShares}</p>
                    <p className="mt-1 sm:mt-0 font-mono text-navy">
                      {formatNumber(p.shareCount, undefined, locale)}
                    </p>
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <p className="eyebrow sm:hidden">
                      {dict.projectList.of} {formatNumber(totalShares, undefined, locale)}
                    </p>
                    <p className="mt-1 sm:mt-0 font-mono text-navy">
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

          {!access.canSeeCapTable && (
            <p className="mt-6 eyebrow !text-navy/40 max-w-2xl">
              {t.yours.partnersOnlyOwnPositionNote}
            </p>
          )}
        </>
      ),
    });
  }

  // — Métricas (ref).
  if (latestByKind.size > 0) {
    sections.push({
      title: t.sections.metrics,
      tone: "ref",
      node: (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
          {Array.from(latestByKind.values()).map((m) => (
            <KpiCard
              key={m.kind}
              label={m.label}
              value={`${m.value} ${m.unit}`}
              hint={`${dict.partner.lastPayment.replace(":", "")} ${formatDate(m.asOf, locale)}`}
            />
          ))}
        </div>
      ),
    });
  }

  // — Documentos (ref, gated).
  if (
    canSeePrivateDocs &&
    (project.startupProfile?.pitchDeckStorageKey ||
      project.startupProfile?.dataRoomStorageKey ||
      project.startupProfile?.projectionsUrl ||
      project.startupProfile?.planNegociosUrl ||
      project.startupProfile?.estrategiasPeriodicasUrl ||
      project.startupProfile?.estadosFinancierosUrl ||
      project.startupProfile?.estrategiaEmisionUrl)
  ) {
    sections.push({
      title: t.sections.documents,
      tone: "ref",
      node: (
        <ul className="hairline-t">
          {project.startupProfile.pitchDeckStorageKey && (
            <DocRow label={t.documents.pitchDeck} href={project.startupProfile.pitchDeckStorageKey} openLabel={t.documents.openLink} />
          )}
          {project.startupProfile.dataRoomStorageKey && (
            <DocRow label={t.documents.dataRoom} href={project.startupProfile.dataRoomStorageKey} openLabel={t.documents.openLink} />
          )}
          {project.startupProfile.projectionsUrl && (
            <DocRow label={t.documents.projections} href={project.startupProfile.projectionsUrl} openLabel={t.documents.openLink} />
          )}
          {project.startupProfile.planNegociosUrl && (
            <DocRow label={t.documents.businessPlan} href={project.startupProfile.planNegociosUrl} openLabel={t.documents.openLink} />
          )}
          {project.startupProfile.estrategiasPeriodicasUrl && (
            <DocRow label={t.documents.periodicStrategies} href={project.startupProfile.estrategiasPeriodicasUrl} openLabel={t.documents.openLink} />
          )}
          {project.startupProfile.estadosFinancierosUrl && (
            <DocRow label={t.documents.financials} href={project.startupProfile.estadosFinancierosUrl} openLabel={t.documents.openLink} />
          )}
          {project.startupProfile.estrategiaEmisionUrl && (
            <DocRow label={t.documents.issuanceStrategy} href={project.startupProfile.estrategiaEmisionUrl} openLabel={t.documents.openLink} />
          )}
        </ul>
      ),
    });
  }

  // — Reportes (ref, gated).
  if (canSeePrivateDocs && reports.length > 0) {
    sections.push({
      title: t.sections.reports,
      tone: "ref",
      node: (
        <ul className="hairline-t">
          {reports.map((r) => (
            <li
              key={r.id}
              className="hairline-b grid grid-cols-12 items-baseline gap-x-3 gap-y-1 py-4"
            >
              <span className="col-span-12 sm:col-span-6 text-navy break-words">
                {r.title}
              </span>
              <span className="col-span-6 sm:col-span-3 eyebrow !text-navy">
                {reportKindLabel(r.kind)} · {humanReportPeriod(r.period, r.fiscalYear)}
              </span>
              <span className="col-span-6 sm:col-span-2 eyebrow text-right">
                {formatDate(r.publishedAt, locale)}
              </span>
              <a
                href={r.storageKey}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-12 sm:col-span-1 eyebrow hover:!text-gold text-right"
              >
                {t.documents.openLink}
              </a>
              {r.summary.trim().length > 0 && (
                <p className="col-span-12 text-navy/75 text-sm leading-relaxed whitespace-pre-line">
                  {r.summary}
                </p>
              )}
            </li>
          ))}
        </ul>
      ),
    });
  }

  // — Políticas (ref, gated).
  if (
    canSeePoliciesGated &&
    (project.startupProfile?.policyShares ||
      project.startupProfile?.policyDividends ||
      project.startupProfile?.dividendsFrequency)
  ) {
    sections.push({
      title: t.sections.policies,
      tone: "ref",
      node: (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 max-w-4xl">
          {project.startupProfile.policyShares && (
            <Block title={t.policies.shares} body={project.startupProfile.policyShares} />
          )}
          {project.startupProfile.policyDividends && (
            <Block
              title={t.policies.dividends}
              body={project.startupProfile.policyDividends}
            />
          )}
          {project.startupProfile.dividendsFrequency && (
            <Block
              title={t.policies.frequency}
              body={project.startupProfile.dividendsFrequency}
            />
          )}
        </div>
      ),
    });
  }

  // — Cap table (ref, gated). Visualización tipo histograma horizontal.
  if (access.canSeeCapTable && capTable.length > 0) {
    sections.push({
      title: t.sections.capTable,
      tone: "ref",
      node: (
        <CapTableViz
          rows={capTable}
          totalShares={totalShares}
          ofTotalLabel={`${dict.projectList.of} ${formatNumber(totalShares, undefined, locale)}`}
          formatShares={(n) => formatNumber(n, undefined, locale)}
          formatPct={(p) => formatPercent(p, 2, locale)}
          othersLabel={t.capTable.others}
        />
      ),
    });
  }

  // Embed del video — visible para cualquier viewer del proyecto.
  const videoEmbed = project.startupProfile?.videoUrl
    ? embedUrl(project.startupProfile.videoUrl)
    : null;

  return (
    <div>
      <Link href={backLinkFor(user.role)} className="eyebrow hover:!text-gold">
        {t.back}
      </Link>

      <div className="mt-4">
        <ProjectHero
          contextEyebrow={t.heroContextEyebrow}
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
            location: project.startupProfile?.location,
          }}
          name={project.name}
          oneLiner={project.startupProfile?.oneLiner}
          founderName={project.owner.fullName}
          founderRoleLabel={t.founderLabel}
          websiteUrl={project.startupProfile?.websiteUrl}
          actions={heroCtas}
          satellite={satellite}
        />
      </div>

      {/* Video como primera impresión, justo bajo el hero — solo si hay URL. */}
      {project.startupProfile?.videoUrl && (
        <ProjectVideo
          embedSrc={videoEmbed}
          rawUrl={project.startupProfile.videoUrl}
          titlePrefix={t.videoTitlePrefix}
          projectName={project.name}
          openLabel={t.openVideo}
        />
      )}

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
          {/* TODO i18n: panel admin queda en español por scope. */}
          <AdminApprovalActions projectSlug={project.slug} />
        </div>
      )}

      {/* Forms — viven antes del cuerpo y, cuando abren su hash, ProjectBody
          oculta el resto del scroll para foco total. */}
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

          {(access.role !== "PARTNER" || partnerHasApprovedInfo) && (
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
          )}
        </>
      )}

      {/* Cuerpo de la ficha — focus mode oculta esto si hay form abierto. */}
      <ProjectBody hideOnHash={["#comprar", "#info-request"]}>
        {/* Banda de números: el headline grande, la barra y los KPIs juntos. */}
        <section className="mt-12 sm:mt-16">
          <p className="font-mono text-sm tracking-wider mb-5">
            <span className="text-gold">00</span>
            <span className="ml-2 text-navy">· {t.sections.funding}</span>
          </p>
          <FundingBar
            headline={{
              placed: formatNumber(visibleAssigned, undefined, locale),
              total: formatNumber(totalShares, undefined, locale),
              suffix: t.funding.placedHeadlineSuffix,
            }}
            percent={fundedPct}
            stats={fundingStats}
          />
        </section>

        {sections.map((s, i) => (
          <ProjectSection
            key={i}
            index={i + 1}
            title={s.title}
            tone={s.tone}
            isFirst={false}
            trailingCta={
              s.withInlineCta && heroCtas[0]?.href ? (
                <InlineParticipateCta
                  label={heroCtas[0].label}
                  href={heroCtas[0].href}
                  eyebrow={t.nextStep}
                />
              ) : undefined
            }
          >
            {s.node}
          </ProjectSection>
        ))}

        {/* Cierre marketing: pregunta + botón grande. */}
        {canCtaShow ? (
          <ParticipateFooterCta
            eyebrow={t.footerCta.eyebrow}
            question={t.footerCta.question}
            body={t.footerCta.body}
            actions={
              heroCtas[0]?.href
                ? [
                    { kind: "primary", label: heroCtas[0].label, href: heroCtas[0].href },
                  ]
                : heroCtas[0]?.asText
                ? [{ kind: "muted", label: heroCtas[0].label }]
                : []
            }
          />
        ) : (
          <ParticipateFooterCta
            eyebrow={t.footerCta.notAvailableEyebrow}
            question={t.footerCta.notAvailableTitle}
            body={t.footerCta.notAvailableBody}
            actions={[]}
          />
        )}
      </ProjectBody>
    </div>
  );
}

const METRIC_LABEL: Record<string, string> = {
  // TODO i18n: nombres de métrica admin/internal; quedan en español por scope.
  MRR: "MRR",
  ARR: "ARR",
  GMV: "GMV",
  ACTIVE_USERS: "Usuarios activos",
  PAYING_CUSTOMERS: "Clientes de pago",
  CHURN_RATE: "Churn",
  BURN_RATE: "Burn rate",
  RUNWAY_MONTHS: "Runway",
  CAC: "CAC",
  LTV: "LTV",
  GROSS_MARGIN: "Margen bruto",
  HEADCOUNT: "Headcount",
  CUSTOM: "Custom",
};

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

function DocRow({ label, href, openLabel }: { label: string; href: string; openLabel: string }) {
  return (
    <li className="hairline-b grid grid-cols-12 items-baseline gap-3 py-4">
      <span className="col-span-6 sm:col-span-9 text-navy">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="col-span-6 sm:col-span-3 eyebrow hover:!text-gold text-right"
      >
        {openLabel}
      </a>
    </li>
  );
}
