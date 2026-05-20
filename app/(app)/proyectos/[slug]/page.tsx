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
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { InterestForm } from "./InterestForm";
import { InfoRequestForm } from "./InfoRequestForm";
import { AdminApprovalActions } from "./AdminApprovalActions";
import { ProjectBody } from "./ProjectBody";
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

  // Preferencias del viewer (MXN dual display + locale)
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

  // Métricas con visibility según rol
  const metrics = await prisma.startupMetric.findMany({
    where: {
      startupProfileId: project.startupProfile?.id,
      ...(access.canSeePrivateMetrics ? {} : { visibility: "PUBLIC_TO_HOLDERS" }),
    },
    orderBy: { asOf: "desc" },
  });

  // Reportes publicados por el founder. Visibles para cualquier viewer
  // del proyecto.
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

  // Snapshot de participaciones
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

  // Cap table agrupado por dueño (solo para roles permitidos)
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

  // Métricas: agrupar por kind y mostrar el último valor
  type MetricRow = { kind: string; label: string; value: string; unit: string; asOf: Date };
  const latestByKind = new Map<string, MetricRow>();
  for (const m of metrics) {
    if (!latestByKind.has(m.kind)) {
      latestByKind.set(m.kind, {
        kind: m.kind,
        label: m.customLabel ?? METRIC_LABEL[m.kind] ?? m.kind,
        // Mantenemos es-MX en raw value para no romper tests existentes que
        // matchean strings con separadores específicos. El UI render usa
        // `formatNumber(value, undefined, locale)` directamente en otros lados.
        value: Number(m.value).toLocaleString(locale),
        unit: m.unit,
        asOf: m.asOf,
      });
    }
  }

  // ¿Tiene el viewer participaciones en este proyecto?
  const myParticipations =
    access.role === "PARTNER" || access.role === "ADMIN" || access.role === "OWNER" || access.role === "CO_ADMIN"
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

  // ─── Opción A: scroll único.
  const sections: { title?: string; node: React.ReactNode }[] = [];

  const visibleAssigned = access.canSeeCapTable
    ? assignedShares
    : assignedShares - platformShares;
  const fundedPct =
    totalShares > 0
      ? Math.min(100, Math.max(0, (visibleAssigned / totalShares) * 100))
      : 0;

  // Participaciones: los números del proyecto.
  const hasValuation = !!project.startupProfile?.preMoneyValuation;
  const hasTargetRaise = !!project.startupProfile?.targetRaiseAmount;
  const participationsCols = 3 + (hasValuation ? 1 : 0) + (hasTargetRaise ? 1 : 0);
  const participationsColClass =
    participationsCols >= 5
      ? "lg:grid-cols-5"
      : participationsCols === 4
      ? "lg:grid-cols-4"
      : "lg:grid-cols-3";
  sections.push({
    title: t.sections.participations,
    node: (
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-px bg-line ${participationsColClass}`}
      >
        <KpiCard
          label={t.participations.total}
          value={formatNumber(totalShares, undefined, locale)}
          hint={t.participations.totalHint}
        />
        <KpiCard
          label={t.participations.assigned}
          value={formatNumber(
            access.canSeeCapTable ? assignedShares : assignedShares - platformShares,
            undefined,
            locale
          )}
          hint={`${formatNumber(
            access.canSeeCapTable ? assignedShares : assignedShares - platformShares,
            undefined,
            locale
          )} ${dict.projectList.of} ${formatNumber(totalShares, undefined, locale)}`}
        />
        <KpiCard
          label={t.participations.available}
          value={formatNumber(availableShares, undefined, locale)}
          hint={`${formatNumber(availableShares, undefined, locale)} ${dict.projectList.of} ${formatNumber(totalShares, undefined, locale)}`}
        />
        {project.startupProfile?.preMoneyValuation && (() => {
          const amt = Number(project.startupProfile.preMoneyValuation);
          const dual = showMxnDual
            ? formatDualCurrency(amt, true, 0)
            : null;
          return (
            <KpiCard
              label={t.participations.valuation}
              value={formatCurrency(
                amt,
                project.startupProfile.valuationCurrency,
                0,
                locale
              )}
              hint={dual?.secondary ?? t.participations.valuationHint}
            />
          );
        })()}
        {project.startupProfile?.targetRaiseAmount && (() => {
          const amt = Number(project.startupProfile.targetRaiseAmount);
          const dual = showMxnDual
            ? formatDualCurrency(amt, true, 0)
            : null;
          return (
            <KpiCard
              label={t.participations.targetRaise}
              value={formatCurrency(
                amt,
                project.startupProfile.valuationCurrency,
                0,
                locale
              )}
              hint={dual?.secondary ?? t.participations.targetRaiseHint}
            />
          );
        })()}
      </div>
    ),
  });

  // Barra de fondeo: cuánto del total ya está colocado.
  sections.push({
    title: t.sections.funding,
    node: (
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow !text-navy/40">
            {formatNumber(visibleAssigned, undefined, locale)} {dict.projectList.of}{" "}
            {formatNumber(totalShares, undefined, locale)} {t.funding.placedOf}
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full bg-line">
          <div
            className="h-full bg-navy transition-[width]"
            style={{ width: `${fundedPct}%` }}
          />
        </div>

        {pricePerShare !== null && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line">
            <KpiCard
              label={t.funding.pricePerShare}
              value={formatCurrency(pricePerShare, projectCurrency, 2, locale)}
              hint={
                showMxnDual
                  ? (formatDualCurrency(pricePerShare, true).secondary ??
                    t.funding.pricePerShareHint)
                  : t.funding.pricePerShareHint
              }
            />
            <KpiCard
              label={t.funding.annualReturnPerShare}
              value="—"
              hint={t.funding.annualReturnPerShareHint}
            />
          </div>
        )}
      </div>
    ),
  });

  // Resumen: problema / solución / modelo + descripción.
  if (project.startupProfile) {
    sections.push({
      title: t.sections.summary,
      node: (
        <>
          <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            <Block title={t.summary.problem} body={project.startupProfile.problemStatement} />
            <Block title={t.summary.solution} body={project.startupProfile.solutionStatement} />
            <Block
              title={t.summary.businessModel}
              body={project.startupProfile.businessModel}
            />
          </div>
          {project.description && (
            <div className="mt-6">
              <p className="eyebrow mb-3">{t.summary.description}</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.description}
              </p>
            </div>
          )}
        </>
      ),
    });
    // "Resumen" va primero
    sections.unshift(sections.pop()!);
  }

  if (myShares > 0) {
    sections.push({
      title: t.sections.yourParticipation,
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
            <ul className="mt-4 space-y-5">
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
                <li
                  key={p.id}
                  className="grid grid-cols-12 items-center gap-3"
                >
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
            <p className="mt-4 eyebrow !text-navy/40">
              {t.yours.partnersOnlyOwnPositionNote}
            </p>
          )}
        </>
      ),
    });
  }

  if (
    project.startupProfile?.assetBackingNote ||
    project.startupProfile?.equityStructureNote
  ) {
    sections.push({
      title: t.sections.structure,
      node: (
        <div className="space-y-6">
          {project.startupProfile.assetBackingNote && (
            <div>
              <p className="eyebrow mb-3">{t.structure.assetBacking}</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.startupProfile.assetBackingNote}
              </p>
            </div>
          )}
          {project.startupProfile.equityStructureNote && (
            <div>
              <p className="eyebrow mb-3">{t.structure.equityStructure}</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.startupProfile.equityStructureNote}
              </p>
            </div>
          )}
        </div>
      ),
    });
  }

  const isPrivilegedReaderForPolicies =
    access.role === "OWNER" ||
    access.role === "CO_ADMIN" ||
    access.role === "ADMIN";
  const canSeePoliciesGated =
    isPrivilegedReaderForPolicies || partnerHasApprovedInfo || myShares > 0;
  if (
    canSeePoliciesGated &&
    (project.startupProfile?.policyShares ||
      project.startupProfile?.policyDividends ||
      project.startupProfile?.dividendsFrequency)
  ) {
    sections.push({
      title: t.sections.policies,
      node: (
        <div className="space-y-6">
          {project.startupProfile.policyShares && (
            <div>
              <p className="eyebrow mb-3">{t.policies.shares}</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.startupProfile.policyShares}
              </p>
            </div>
          )}
          {project.startupProfile.policyDividends && (
            <div>
              <p className="eyebrow mb-3">{t.policies.dividends}</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.startupProfile.policyDividends}
              </p>
            </div>
          )}
          {project.startupProfile.dividendsFrequency && (
            <div>
              <p className="eyebrow mb-3">{t.policies.frequency}</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.startupProfile.dividendsFrequency}
              </p>
            </div>
          )}
        </div>
      ),
    });
  }

  const canSeeTeam = access.role !== "PARTNER";

  if (canSeeTeam && (project.startupProfile?.founders.length ?? 0) > 0) {
    sections.push({
      title: t.sections.team,
      node: (
        <ul className="space-y-6">
          {project.startupProfile!.founders.map((f) => (
            <li key={f.id} className="space-y-3">
              <div className="grid grid-cols-12 items-baseline gap-3">
                <span className="col-span-12 sm:col-span-6 text-navy break-words">
                  {f.fullName}
                </span>
                <span className="col-span-6 sm:col-span-3 eyebrow">
                  {f.role}
                </span>
                <span className="col-span-6 sm:col-span-3 font-mono text-navy text-right">
                  {formatPercent(Number(f.equityPercent), 2, locale)}
                </span>
              </div>
              {f.bio && (
                <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                  {f.bio}
                </p>
              )}
              {f.references && (
                <div>
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

  if ((project.startupProfile?.milestones.length ?? 0) > 0) {
    sections.push({
      title: t.sections.milestones,
      node: (
        <ul className="space-y-4">
          {project.startupProfile!.milestones.map((m) => (
            <li
              key={m.id}
              className="grid grid-cols-12 items-baseline gap-3"
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

  if (latestByKind.size > 0) {
    sections.push({
      title: t.sections.metrics,
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

  const isPrivilegedReader =
    access.role === "OWNER" ||
    access.role === "CO_ADMIN" ||
    access.role === "ADMIN";
  const canSeePrivateDocs =
    isPrivilegedReader || partnerHasApprovedInfo || myShares > 0;

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
      node: (
        <ul className="space-y-4">
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

  if (canSeePrivateDocs && reports.length > 0) {
    sections.push({
      title: t.sections.reports,
      node: (
        <ul className="space-y-4">
          {reports.map((r) => (
            <li key={r.id} className="grid grid-cols-12 items-baseline gap-x-3 gap-y-1">
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

  if (access.canSeeCapTable && capTable.length > 0) {
    sections.push({
      title: t.sections.capTable,
      node: (
        <ul className="space-y-4">
          {capTable.map((r, i) => (
            <li
              key={i}
              className="grid grid-cols-12 items-baseline gap-3"
            >
              <span className="col-span-12 sm:col-span-6 text-navy break-words">
                {r.holder}
                {r.isPlatform && <span className="ml-2 text-gold">◆</span>}
              </span>
              <span className="col-span-12 sm:col-span-6 font-mono text-navy text-right">
                {formatNumber(r.shares, undefined, locale)} {dict.projectList.of}{" "}
                {formatNumber(totalShares, undefined, locale)}
              </span>
            </li>
          ))}
        </ul>
      ),
    });
  }

  return (
    <div>
      <Link href={backLinkFor(user.role)} className="eyebrow hover:!text-gold">
        {t.back}
      </Link>

      <header className="mt-4 hairline-b pb-5 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="max-w-2xl min-w-0">
          <p className="eyebrow">
            {t.kind[project.kind] ?? project.kind}
            {project.startupProfile?.sector ? ` · ${project.startupProfile.sector}` : ""}
            {project.startupProfile?.stage && (() => {
              const stageKey = project.startupProfile.stage;
              const stageLabel = dict.projectList.stage[stageKey] ?? stageKey;
              const info = t.stageInfo[stageKey];
              return (
                <>
                  {" · "}
                  {stageLabel}
                  {info && <InfoTooltip text={info} />}
                </>
              );
            })()}
            {project.startupProfile?.location ? ` · ${project.startupProfile.location}` : ""}
          </p>
          <h1 className="font-sans mt-4 text-h1 text-navy">{project.name}</h1>
          {project.startupProfile?.oneLiner && (
            <p className="mt-3 text-navy/75 leading-relaxed text-lg">
              “{project.startupProfile.oneLiner}”
            </p>
          )}
          <p className="mt-3">
            <span className="eyebrow !text-navy/40">{t.founderLabel}</span>{" "}
            <span className="ml-2 text-navy">{project.owner.fullName}</span>
          </p>
          {project.startupProfile?.websiteUrl && (
            <a
              href={project.startupProfile.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block eyebrow hover:!text-gold"
            >
              {project.startupProfile.websiteUrl
                .replace(/^https?:\/\//, "")
                .replace(/\/$/, "")}{" "}
              ↗
            </a>
          )}
        </div>
        <div className="flex flex-col gap-3 shrink-0 sm:flex-row sm:items-center">
          {(myShares > 0 ||
            access.role === "OWNER" ||
            access.role === "CO_ADMIN" ||
            access.role === "ADMIN") && (
            <Link
              href={`/proyectos/${project.slug}/chat` as Route}
              className="eyebrow hover:!text-gold self-end sm:self-center"
            >
              {t.openChat}
            </Link>
          )}
          {access.canManifestInterest && availableShares > 0 && (
            <>
              {access.role === "PARTNER" ? (
                myInfoRequest?.status === "PENDING" ? (
                  <span className="eyebrow !text-navy/60">
                    {t.waitingApproval}
                  </span>
                ) : myInfoRequest?.status === "APPROVED" ? (
                  <a href="#comprar" className="btn-primary text-center">
                    {t.interest}
                  </a>
                ) : (
                  <a href="#info-request" className="btn-primary text-center">
                    {t.requestInfo}
                  </a>
                )
              ) : (
                <a href="#comprar" className="btn-primary text-center">
                  {t.interest}
                </a>
              )}
            </>
          )}
          {access.canEdit && (
            <Link
              href={`/founder/${project.slug}/editar` as Route}
              className="btn-outline text-center"
            >
              {t.editInfo}
            </Link>
          )}
        </div>
      </header>

      {/* PARTNER con InfoRequest REJECTED: mensaje visible debajo del header. */}
      {access.role === "PARTNER" && myInfoRequest?.status === "REJECTED" && (
        <div className="mt-5 hairline p-4 bg-paper-light">
          <p className="eyebrow">{t.requestNotApproved}</p>
          {myInfoRequest.reviewNote && (
            <p className="mt-2 text-navy/75 leading-relaxed whitespace-pre-line text-sm">
              {myInfoRequest.reviewNote}
            </p>
          )}
        </div>
      )}

      {/* Video del proyecto: visible para cualquier viewer con canView. */}
      {project.startupProfile?.videoUrl && (() => {
        const embed = embedUrl(project.startupProfile.videoUrl);
        if (embed) {
          return (
            <div className="mt-6">
              <div className="hairline relative" style={{ paddingTop: "56.25%" }}>
                <iframe
                  src={embed}
                  title={`${t.videoTitlePrefix} ${project.name}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </div>
          );
        }
        return (
          <p className="mt-6">
            <a
              href={project.startupProfile.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="eyebrow hover:!text-gold"
            >
              {t.openVideo}
            </a>
          </p>
        );
      })()}

      {/* Panel de moderación: admin viendo un proyecto PENDING_APPROVAL */}
      {access.role === "ADMIN" && project.status === "PENDING_APPROVAL" && (
        <div className="mt-5">
          {/* TODO i18n: panel admin queda en español por scope */}
          <AdminApprovalActions projectSlug={project.slug} />
        </div>
      )}

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

      {sections.length > 0 && (
        <ProjectBody hideOnHash={["#comprar", "#info-request"]}>
          {sections.map((s, i) => (
            <section
              key={i}
              className={
                i === 0
                  ? "pt-6 sm:pt-7"
                  : "hairline-t mt-7 pt-6 sm:mt-8 sm:pt-7"
              }
            >
              {s.title && (
                <p className="font-mono text-sm tracking-wider mb-4">
                  <span className="text-gold">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  <span className="text-navy">· {s.title}</span>
                </p>
              )}
              {s.node}
            </section>
          ))}
        </ProjectBody>
      )}
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
    <li className="grid grid-cols-12 items-baseline gap-3">
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
