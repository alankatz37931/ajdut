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

export default async function PartnerDashboardPage() {
  const user = await requireSession();
  const prefs = await getUserPreferences();
  const prefersMxn = prefs.currency === "MXN";
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.partner;

  const participations = await prisma.participation.findMany({
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
  });

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

  const certificatesCount = rows.reduce((s, r) => s + r.certificates.length, 0);

  return (
    <div>
      <div className="pt-5 pb-5 sm:pt-7 sm:pb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
          <p className="mt-4 max-w-xl text-navy/75 leading-relaxed">{t.intro}</p>
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
              const currency =
                p.project.startupProfile?.valuationCurrency ?? "USD";
              const cert = p.certificates[0];
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
                            ? formatCurrency(
                                p.valueInProjectCurrency,
                                currency,
                                2,
                                locale
                              )
                            : "—"}
                        </p>
                        {prefersMxn &&
                          currency === "USD" &&
                          p.valueInProjectCurrency !== null && (
                            <p className="mt-0.5 font-mono text-xs text-navy/40">
                              {
                                formatDualCurrency(
                                  p.valueInProjectCurrency,
                                  true
                                ).secondary
                              }
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

                    {cert && (
                      <div className="mt-3 hairline-t pt-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="font-mono text-xs text-navy/70">
                          {t.certificateLabel}{" "}
                          <span className="text-navy">{cert.serialCode}</span> ·{" "}
                          {t.issuedAt} {formatDate(cert.issuedAt, locale)}
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
    </div>
  );
}
