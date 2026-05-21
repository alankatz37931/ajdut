import Link from "next/link";
import type { Route } from "next";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Section } from "@/components/ui/Section";
import { KpiCard } from "@/components/ui/KpiCard";
import { getUserPreferences } from "@/lib/preferences";
import { getDict, getLocale } from "@/lib/i18n";
import {
  formatCurrency,
  formatDate,
  formatDualCurrency,
  formatNumber,
} from "@/lib/utils/format";

const PAYMENT_STATUS_SYMBOL: Record<string, string> = {
  PENDING: "○",
  SENT: "◐",
  RECEIVED: "●",
  DISPUTED: "✕",
  WAIVED: "◇",
};

// Cantidad máxima de pagos a mostrar en la lista cronológica del histórico.
const HISTORY_PAGE_SIZE = 20;

export default async function PartnerDashboardPage() {
  const user = await requireSession();
  const prefs = await getUserPreferences();
  const prefersMxn = prefs.currency === "MXN";
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.partner;

  const [participations, dividendPayments] = await Promise.all([
    prisma.participation.findMany({
      where: { currentOwnerId: user.id },
      include: {
        project: {
          select: {
            id: true,
            slug: true,
            name: true,
            shortPitch: true,
            totalShares: true,
            startupProfile: {
              select: {
                preMoneyValuation: true,
                valuationCurrency: true,
                policyDividends: true,
                dividendsFrequency: true,
              },
            },
          },
        },
        certificates: {
          where: { revokedAt: null },
          orderBy: { issuedAt: "desc" },
          select: {
            id: true,
            serialCode: true,
            issuedAt: true,
            pdfStorageKey: true,
          },
        },
      },
      orderBy: { acquiredAt: "desc" },
    }),
    prisma.dividendPayment.findMany({
      where: { recipientId: user.id },
      orderBy: [{ receivedAt: "desc" }, { sentAt: "desc" }, { createdAt: "desc" }],
      include: {
        distribution: {
          select: {
            id: true,
            title: true,
            fiscalPeriod: true,
            recordDate: true,
            project: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
  ]);

  type Row = (typeof participations)[number] & {
    pricePerShare: number | null;
    valueInProjectCurrency: number | null;
  };

  const rows: Row[] = participations.map((p) => {
    const val = p.project.startupProfile?.preMoneyValuation
      ? Number(p.project.startupProfile.preMoneyValuation)
      : null;
    const pricePerShare =
      val && p.project.totalShares > 0 ? val / p.project.totalShares : null;
    const valueInProjectCurrency =
      pricePerShare !== null ? pricePerShare * p.shareCount : null;
    return { ...p, pricePerShare, valueInProjectCurrency };
  });

  const totalsByCurrency = new Map<string, number>();
  let activeProjectsCount = 0;
  for (const r of rows) {
    if (r.valueInProjectCurrency === null) continue;
    activeProjectsCount += 1;
    const currency = r.project.startupProfile?.valuationCurrency ?? "USD";
    totalsByCurrency.set(
      currency,
      (totalsByCurrency.get(currency) ?? 0) + r.valueInProjectCurrency
    );
  }

  const totalShares = rows.reduce((s, r) => s + r.shareCount, 0);
  const projectsCount = rows.length;
  const primaryCurrency = totalsByCurrency.has("USD")
    ? "USD"
    : Array.from(totalsByCurrency.keys())[0] ?? "USD";
  const primaryTotal = totalsByCurrency.get(primaryCurrency) ?? 0;
  const otherCurrencies = Array.from(totalsByCurrency.entries()).filter(
    ([c]) => c !== primaryCurrency
  );

  const now = new Date();
  const days = (n: number) => n * 24 * 60 * 60 * 1000;
  const last30 = new Date(now.getTime() - days(30));
  const last90 = new Date(now.getTime() - days(90));
  const last180 = new Date(now.getTime() - days(180));

  function paymentDate(p: (typeof dividendPayments)[number]): Date {
    return p.receivedAt ?? p.sentAt ?? p.distribution.recordDate;
  }

  type ByCurrency = Map<string, number>;
  const sumReceivedSince = (since: Date): ByCurrency => {
    const m = new Map<string, number>();
    for (const p of dividendPayments) {
      if (p.status !== "RECEIVED") continue;
      const d = paymentDate(p);
      if (d < since) continue;
      m.set(p.currency, (m.get(p.currency) ?? 0) + Number(p.amount));
    }
    return m;
  };
  const sumReceivedTotal = (): ByCurrency => {
    const m = new Map<string, number>();
    for (const p of dividendPayments) {
      if (p.status !== "RECEIVED") continue;
      m.set(p.currency, (m.get(p.currency) ?? 0) + Number(p.amount));
    }
    return m;
  };

  const totals1m = sumReceivedSince(last30);
  const totals3m = sumReceivedSince(last90);
  const totals6m = sumReceivedSince(last180);
  const totalsAll = sumReceivedTotal();

  function renderByCurrency(m: ByCurrency, fallback = "—"): string {
    if (m.size === 0) return fallback;
    const entries = Array.from(m.entries()).sort((a, b) => {
      if (a[0] === "USD") return -1;
      if (b[0] === "USD") return 1;
      return a[0].localeCompare(b[0]);
    });
    return entries.map(([c, v]) => formatCurrency(v, c, 2, locale)).join(" + ");
  }

  function dualHint(m: ByCurrency, hint: string): string {
    if (!prefersMxn) return hint;
    const usd = m.get("USD");
    if (!usd) return hint;
    const dual = formatDualCurrency(usd, true).secondary;
    return dual ?? hint;
  }

  const dividendsPendingByCurrency: ByCurrency = new Map();
  for (const p of dividendPayments) {
    if (p.status === "PENDING" || p.status === "SENT") {
      dividendsPendingByCurrency.set(
        p.currency,
        (dividendsPendingByCurrency.get(p.currency) ?? 0) + Number(p.amount)
      );
    }
  }

  type ProjectBreakdown = {
    projectId: string;
    projectSlug: string;
    projectName: string;
    receivedByCurrency: ByCurrency;
    lastPaymentAt: Date | null;
    lastPaymentAmount: number | null;
    lastPaymentCurrency: string | null;
    paymentsCount: number;
    policyDividends: string | null;
    dividendsFrequency: string | null;
  };

  const breakdownByProject = new Map<string, ProjectBreakdown>();

  for (const p of participations) {
    const proj = p.project;
    if (!breakdownByProject.has(proj.id)) {
      breakdownByProject.set(proj.id, {
        projectId: proj.id,
        projectSlug: proj.slug,
        projectName: proj.name,
        receivedByCurrency: new Map(),
        lastPaymentAt: null,
        lastPaymentAmount: null,
        lastPaymentCurrency: null,
        paymentsCount: 0,
        policyDividends: proj.startupProfile?.policyDividends ?? null,
        dividendsFrequency: proj.startupProfile?.dividendsFrequency ?? null,
      });
    }
  }

  for (const p of dividendPayments) {
    const projId = p.distribution.project.id;
    let entry = breakdownByProject.get(projId);
    if (!entry) {
      entry = {
        projectId: projId,
        projectSlug: p.distribution.project.slug,
        projectName: p.distribution.project.name,
        receivedByCurrency: new Map(),
        lastPaymentAt: null,
        lastPaymentAmount: null,
        lastPaymentCurrency: null,
        paymentsCount: 0,
        policyDividends: null,
        dividendsFrequency: null,
      };
      breakdownByProject.set(projId, entry);
    }
    entry.paymentsCount += 1;
    if (p.status === "RECEIVED") {
      const amt = Number(p.amount);
      entry.receivedByCurrency.set(
        p.currency,
        (entry.receivedByCurrency.get(p.currency) ?? 0) + amt
      );
      const d = paymentDate(p);
      if (!entry.lastPaymentAt || d > entry.lastPaymentAt) {
        entry.lastPaymentAt = d;
        entry.lastPaymentAmount = amt;
        entry.lastPaymentCurrency = p.currency;
      }
    }
  }

  const breakdownList = Array.from(breakdownByProject.values()).sort((a, b) => {
    if (a.lastPaymentAt && b.lastPaymentAt) {
      return b.lastPaymentAt.getTime() - a.lastPaymentAt.getTime();
    }
    if (a.lastPaymentAt) return -1;
    if (b.lastPaymentAt) return 1;
    return a.projectName.localeCompare(b.projectName);
  });

  type ParticipationStats = {
    receivedByCurrency: ByCurrency;
    lastPaymentAt: Date | null;
  };
  const statsByParticipation = new Map<string, ParticipationStats>();
  for (const p of dividendPayments) {
    if (p.status !== "RECEIVED") continue;
    const k = p.participationId;
    let s = statsByParticipation.get(k);
    if (!s) {
      s = { receivedByCurrency: new Map(), lastPaymentAt: null };
      statsByParticipation.set(k, s);
    }
    s.receivedByCurrency.set(
      p.currency,
      (s.receivedByCurrency.get(p.currency) ?? 0) + Number(p.amount)
    );
    const d = paymentDate(p);
    if (!s.lastPaymentAt || d > s.lastPaymentAt) s.lastPaymentAt = d;
  }

  const certificatesCount = rows.reduce((s, r) => s + r.certificates.length, 0);

  const historyRows = dividendPayments.slice(0, HISTORY_PAGE_SIZE);

  return (
    <div>
      <div className="pt-5 pb-5 sm:pt-7 sm:pb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
          <p className="mt-4 max-w-xl text-navy/75 leading-relaxed">
            {t.intro}
          </p>
        </div>
        <Link href={"/proyectos" as Route} className="btn-outline shrink-0">
          {t.exploreBtn}
        </Link>
      </div>

      {participations.length > 0 && (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <KpiCard
            label={t.portfolioValue}
            value={formatCurrency(primaryTotal, primaryCurrency, 2, locale)}
            hint={
              prefersMxn && primaryCurrency === "USD"
                ? (formatDualCurrency(primaryTotal, true).secondary ??
                  (otherCurrencies.length > 0
                    ? `+ ${otherCurrencies
                        .map(([c, v]) => formatCurrency(v, c, 2, locale))
                        .join(" + ")}`
                    : projectsCount === 1
                      ? t.portfolioValueHintOneProject
                      : `${projectsCount} ${t.portfolioValueHintManyProjectsSuffix}`))
                : otherCurrencies.length > 0
                  ? `+ ${otherCurrencies
                      .map(([c, v]) => formatCurrency(v, c, 2, locale))
                      .join(" + ")}`
                  : projectsCount === 1
                    ? t.portfolioValueHintOneProject
                    : `${projectsCount} ${t.portfolioValueHintManyProjectsSuffix}`
            }
            highlight
          />
          <KpiCard
            label={t.totalShares}
            value={formatNumber(totalShares, undefined, locale)}
            hint={t.totalSharesHint}
          />
          <KpiCard
            label={t.activeProjects}
            value={String(projectsCount)}
            hint={
              activeProjectsCount < projectsCount
                ? `${projectsCount - activeProjectsCount} ${t.activeProjectsHintMissingSuffix}`
                : t.activeProjectsHintAll
            }
          />
          <KpiCard
            label={t.certificates}
            value={String(certificatesCount)}
            hint={
              certificatesCount > 0
                ? t.certificatesHintIssued
                : t.certificatesHintEmpty
            }
          />
        </div>
      )}

      <Section title={t.activeParticipationsTitle}>
        {rows.length === 0 ? (
          <p className="text-navy/60">{t.noParticipations}</p>
        ) : (
          <ul className="hairline-t">
            {rows.map((p) => {
              const currency = p.project.startupProfile?.valuationCurrency ?? "USD";
              const cert = p.certificates[0];
              const stats = statsByParticipation.get(p.id);
              const hasDividendStats =
                stats && (stats.receivedByCurrency.size > 0 || stats.lastPaymentAt);
              return (
                <li key={p.id} className="hairline-b">
                  <div className="block py-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <Link
                            href={`/proyectos/${p.project.slug}` as Route}
                            className="font-sans text-navy hover:!text-gold"
                          >
                            {p.project.name}
                          </Link>
                          <Link
                            href={`/proyectos/${p.project.slug}/chat` as Route}
                            className="eyebrow hover:!text-gold shrink-0"
                          >
                            {t.chatShort}
                          </Link>
                          <Link
                            href={`/proyectos/${p.project.slug}/reventa` as Route}
                            className="eyebrow hover:!text-gold shrink-0"
                          >
                            Reventa
                          </Link>
                        </div>
                        <p className="mt-1 eyebrow">{p.project.shortPitch}</p>
                      </div>
                      <Link
                        href={`/proyectos/${p.project.slug}` as Route}
                        className="eyebrow text-gold shrink-0"
                      >
                        {t.seeProject}
                      </Link>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      <div>
                        <p className="eyebrow">{t.colShares}</p>
                        <p className="mt-1 font-mono text-navy">
                          {formatNumber(p.shareCount, undefined, locale)}
                        </p>
                      </div>
                      <div>
                        <p className="eyebrow">{t.colValue}</p>
                        <p className="mt-1 font-mono text-navy">
                          {p.valueInProjectCurrency !== null
                            ? formatCurrency(p.valueInProjectCurrency, currency, 2, locale)
                            : "—"}
                        </p>
                        {prefersMxn &&
                          currency === "USD" &&
                          p.valueInProjectCurrency !== null && (
                            <p className="mt-0.5 font-mono text-xs text-navy/40">
                              {formatDualCurrency(
                                p.valueInProjectCurrency,
                                true
                              ).secondary}
                            </p>
                          )}
                      </div>
                      <div>
                        <p className="eyebrow">{t.colStatus}</p>
                        <p className="mt-1 eyebrow !text-navy">
                          {t.participationStatus[p.status] ?? p.status}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="eyebrow">{t.colAcquired}</p>
                        <p className="mt-1 eyebrow !text-navy">
                          {p.acquiredAt ? formatDate(p.acquiredAt, locale) : "—"}
                        </p>
                      </div>
                    </div>

                    {hasDividendStats && (
                      <p className="mt-3 eyebrow !text-navy/60">
                        {t.receivedTotal}{" "}
                        <span className="text-navy">
                          {renderByCurrency(stats!.receivedByCurrency)}
                        </span>
                        {stats!.lastPaymentAt && (
                          <>
                            {" · "}
                            {t.lastPayment}{" "}
                            <span className="text-navy">
                              {formatDate(stats!.lastPaymentAt, locale)}
                            </span>
                          </>
                        )}
                      </p>
                    )}

                    {cert && (
                      <div className="mt-3 hairline-t pt-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="font-mono text-xs text-navy/70">
                          {t.certificateLabel}{" "}
                          <span className="text-navy">{cert.serialCode}</span> · {t.issuedAt}{" "}
                          {formatDate(cert.issuedAt, locale)}
                        </div>
                        <Link
                          href={`/certificado/${cert.id}` as Route}
                          className="eyebrow hover:!text-gold"
                        >
                          {t.seeCertificate}
                        </Link>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t.dividendsHistoryTitle}>
        {dividendPayments.length === 0 && breakdownList.length === 0 ? (
          <p className="text-navy/60">{t.dividendsEmpty}</p>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
              <KpiCard
                label={t.lastMonth}
                value={renderByCurrency(totals1m)}
                hint={dualHint(totals1m, t.lastMonthHint)}
              />
              <KpiCard
                label={t.last3Months}
                value={renderByCurrency(totals3m)}
                hint={dualHint(totals3m, t.last3MonthsHint)}
              />
              <KpiCard
                label={t.last6Months}
                value={renderByCurrency(totals6m)}
                hint={dualHint(totals6m, t.last6MonthsHint)}
              />
              <KpiCard
                label={t.historicTotal}
                value={renderByCurrency(totalsAll)}
                hint={dualHint(totalsAll, t.historicTotalHint)}
                highlight
              />
            </div>

            {dividendsPendingByCurrency.size > 0 && (
              <div className="grid grid-cols-1 gap-px bg-line">
                <KpiCard
                  label={t.pending}
                  value={renderByCurrency(dividendsPendingByCurrency)}
                  hint={t.pendingHint}
                />
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="eyebrow !text-navy/60">{t.historyDescription}</p>
              <a
                href="/api/dividends/export"
                download
                className="btn-outline shrink-0"
              >
                {t.downloadCsv}
              </a>
            </div>

            {breakdownList.length > 0 && (
              <div>
                <p className="eyebrow mb-4">{t.byProject}</p>
                <ul className="hairline-t">
                  {breakdownList.map((b) => {
                    const hasReceived = b.receivedByCurrency.size > 0;
                    return (
                      <li key={b.projectId} className="hairline-b py-5">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <Link
                              href={`/proyectos/${b.projectSlug}` as Route}
                              className="font-sans text-navy hover:!text-gold"
                            >
                              {b.projectName}
                            </Link>
                            <p className="mt-1 eyebrow">
                              {b.paymentsCount === 0
                                ? t.noDistributionsYet
                                : `${b.paymentsCount} ${b.paymentsCount === 1 ? t.paymentRegistered : t.paymentsRegistered}`}
                            </p>
                          </div>
                          <a
                            href={`/api/projects/${b.projectSlug}/dividends-policy`}
                            download
                            className="eyebrow hover:!text-gold shrink-0"
                          >
                            {t.downloadPolicy}
                          </a>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                          <div>
                            <p className="eyebrow">{t.receivedTotalLabel}</p>
                            <p className="mt-1 font-mono text-navy">
                              {hasReceived
                                ? renderByCurrency(b.receivedByCurrency)
                                : "—"}
                            </p>
                            {prefersMxn && hasReceived && b.receivedByCurrency.has("USD") && (
                              <p className="mt-0.5 font-mono text-xs text-navy/40">
                                {
                                  formatDualCurrency(
                                    b.receivedByCurrency.get("USD") ?? 0,
                                    true
                                  ).secondary
                                }
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="eyebrow">{t.lastPaymentLabel}</p>
                            <p className="mt-1 eyebrow !text-navy">
                              {b.lastPaymentAt ? formatDate(b.lastPaymentAt, locale) : "—"}
                            </p>
                            {b.lastPaymentAmount !== null && b.lastPaymentCurrency && (
                              <p className="mt-0.5 font-mono text-xs text-navy/60">
                                {formatCurrency(b.lastPaymentAmount, b.lastPaymentCurrency, 2, locale)}
                              </p>
                            )}
                          </div>
                          <div className="sm:text-right">
                            <p className="eyebrow">{t.frequencyLabel}</p>
                            <p className="mt-1 eyebrow !text-navy">
                              {b.dividendsFrequency?.trim()
                                ? b.dividendsFrequency
                                : t.notDeclared}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 hairline-t pt-3">
                          <p className="eyebrow !text-navy/40 mb-1">
                            {t.dividendsPolicyLabel}
                          </p>
                          {b.policyDividends?.trim() ? (
                            <p className="text-sm text-navy/85 leading-relaxed whitespace-pre-line">
                              {b.policyDividends}
                            </p>
                          ) : (
                            <p className="text-sm text-navy/60 italic">
                              {t.noPolicyDeclared}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {historyRows.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-4">
                  <p className="eyebrow">
                    {t.historyTitlePrefix} {Math.min(historyRows.length, HISTORY_PAGE_SIZE)} {t.historyTitleSuffix}
                  </p>
                  {dividendPayments.length > historyRows.length && (
                    <p className="eyebrow !text-navy/40">
                      {dividendPayments.length} {t.historyInTotalSuffix}
                    </p>
                  )}
                </div>
                <ul className="hairline-t">
                  {historyRows.map((dp) => (
                    <li key={dp.id} className="hairline-b py-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <Link
                            href={`/proyectos/${dp.distribution.project.slug}` as Route}
                            className="font-sans text-navy hover:!text-gold"
                          >
                            {dp.distribution.project.name}
                          </Link>
                          <p className="mt-1 eyebrow">
                            {dp.distribution.title}
                            {dp.distribution.fiscalPeriod && ` · ${dp.distribution.fiscalPeriod}`}
                          </p>
                        </div>
                        <span className="eyebrow inline-flex items-center gap-1.5 shrink-0">
                          <span aria-hidden className="text-base leading-none">
                            {PAYMENT_STATUS_SYMBOL[dp.status] ?? "·"}
                          </span>
                          {t.paymentStatusLabel[dp.status] ?? dp.status}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        <div>
                          <p className="eyebrow">{t.colAmount}</p>
                          <p className="mt-1 font-mono text-navy">
                            {formatCurrency(Number(dp.amount), dp.currency, 2, locale)}
                          </p>
                        </div>
                        <div>
                          <p className="eyebrow">{t.colShares}</p>
                          <p className="mt-1 font-mono text-navy">
                            {formatNumber(dp.shareCount, undefined, locale)}
                          </p>
                        </div>
                        <div>
                          <p className="eyebrow">{t.colRecordDate}</p>
                          <p className="mt-1 eyebrow !text-navy">
                            {formatDate(dp.distribution.recordDate, locale)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="eyebrow">
                            {dp.status === "RECEIVED"
                              ? t.colCollected
                              : dp.status === "SENT"
                                ? t.colSent
                                : t.colState}
                          </p>
                          <p className="mt-1 eyebrow !text-navy">
                            {dp.receivedAt
                              ? formatDate(dp.receivedAt, locale)
                              : dp.sentAt
                                ? formatDate(dp.sentAt, locale)
                                : "—"}
                          </p>
                        </div>
                      </div>
                      {dp.sentNote && (
                        <p className="mt-3 text-sm text-navy/70 italic">“{dp.sentNote}”</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
