import Link from "next/link";
import type { Metadata, Route } from "next";
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

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.partner };
}

export default async function PartnerDashboardPage() {
  const user = await requireSession();
  const prefs = await getUserPreferences();
  const prefersMxn = prefs.currency === "MXN";
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.partner;

  // Soft-delete: si el proyecto del que el usuario es socio fue eliminado, no
  // debe seguir apareciendo en su portafolio (rompería links a /proyectos/[slug]
  // que ya devuelven notFound). Filtramos la relación project por deletedAt: null.
  const participations = await prisma.participation.findMany({
    where: { currentOwnerId: user.id, project: { deletedAt: null } },
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

  // Equity como fundador: founders vinculados a esta cuenta (Founder.userId).
  // Su % se refleja acá SIN crear participaciones — el mismo equity se cuenta
  // una sola vez (sigue siendo equity de founder en el cap table del proyecto).
  // Es read-only: no es transferible ni emite certificado.
  const founderLinks = await prisma.founder.findMany({
    where: {
      userId: user.id,
      isActive: true,
      startupProfile: { project: { deletedAt: null } },
    },
    select: {
      id: true,
      role: true,
      equityPercent: true,
      startupProfile: {
        select: {
          preMoneyValuation: true,
          valuationCurrency: true,
          project: {
            select: {
              id: true,
              slug: true,
              name: true,
              shortPitch: true,
              totalShares: true,
            },
          },
        },
      },
    },
  });

  type FounderRow = {
    id: string;
    role: string;
    equityPercent: number;
    shares: number;
    currency: string;
    value: number | null;
    project: { id: string; slug: string; name: string; shortPitch: string | null };
  };

  const founderRows: FounderRow[] = founderLinks
    .filter((f) => f.startupProfile?.project)
    .map((f) => {
      const sp = f.startupProfile!;
      const project = sp.project!;
      const equityPercent = Number(f.equityPercent);
      const shares = Math.round((equityPercent / 100) * project.totalShares);
      const val = sp.preMoneyValuation ? Number(sp.preMoneyValuation) : null;
      const value = val !== null ? (val * equityPercent) / 100 : null;
      return {
        id: f.id,
        role: f.role,
        equityPercent,
        shares,
        currency: sp.valuationCurrency ?? "USD",
        value,
        project: {
          id: project.id,
          slug: project.slug,
          name: project.name,
          shortPitch: project.shortPitch,
        },
      };
    });

  // Conteos por PROYECTO DISTINTO — un socio puede tener varias
  // participaciones del mismo proyecto y eso no son "N proyectos".
  const totalsByCurrency = new Map<string, number>();
  const valuedProjectIds = new Set<string>();
  for (const r of rows) {
    if (r.valueInProjectCurrency === null) continue;
    valuedProjectIds.add(r.project.id);
    const currency = r.project.startupProfile?.valuationCurrency ?? "USD";
    totalsByCurrency.set(
      currency,
      (totalsByCurrency.get(currency) ?? 0) + r.valueInProjectCurrency
    );
  }
  // Equity de founder suma al valor del portafolio igual que las participaciones.
  for (const f of founderRows) {
    if (f.value === null) continue;
    valuedProjectIds.add(f.project.id);
    totalsByCurrency.set(
      f.currency,
      (totalsByCurrency.get(f.currency) ?? 0) + f.value
    );
  }
  // Proyectos distintos con valoración informada (el valor del portafolio
  // solo puede calcularse sobre estos).
  const activeProjectsCount = valuedProjectIds.size;

  const totalShares =
    rows.reduce((s, r) => s + r.shareCount, 0) +
    founderRows.reduce((s, f) => s + f.shares, 0);
  // Proyectos distintos del portafolio (participaciones + equity de founder).
  const projectsCount = new Set([
    ...rows.map((r) => r.project.id),
    ...founderRows.map((f) => f.project.id),
  ]).size;
  const primaryCurrency = totalsByCurrency.has("USD")
    ? "USD"
    : Array.from(totalsByCurrency.keys())[0] ?? "USD";
  const primaryTotal = totalsByCurrency.get(primaryCurrency) ?? 0;
  const otherCurrencies = Array.from(totalsByCurrency.entries()).filter(
    ([c]) => c !== primaryCurrency
  );

  return (
    <div>
      <div className="pt-5 pb-5 sm:pt-7 sm:pb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy break-words">
            {t.title}
          </h1>
          <p className="mt-4 max-w-xl text-navy/75 leading-relaxed">{t.intro}</p>
        </div>
        <Link href={"/proyectos" as Route} className="btn-outline shrink-0">
          {t.exploreBtn}
        </Link>
      </div>

      {(participations.length > 0 || founderRows.length > 0) && (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-3">
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
        </div>
      )}

      <Section title={t.activeParticipationsTitle}>
        {rows.length === 0 ? (
          <p className="text-navy/60">{t.noParticipations}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((p) => {
              const currency =
                p.project.startupProfile?.valuationCurrency ?? "USD";
              const cert = p.certificates[0];
              return (
                <li key={p.id} className="hairline bg-paper p-5 sm:p-6">
                  <div>
                    <Link
                      href={`/proyectos/${p.project.slug}` as Route}
                      className="font-sans text-navy hover:!text-gold break-words"
                    >
                      {p.project.name}
                    </Link>
                    <p className="mt-1 eyebrow">{p.project.shortPitch}</p>
                  </div>

                  <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
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
                    <div className="sm:text-right">
                      <p className="eyebrow">{t.colAcquired}</p>
                      <p className="mt-1 eyebrow !text-navy">
                        {p.acquiredAt ? formatDate(p.acquiredAt, locale) : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={`/proyectos/${p.project.slug}` as Route}
                      className="btn-primary"
                    >
                      {t.seeProjectBtn}
                    </Link>
                    <Link
                      href={`/proyectos/${p.project.slug}/chat` as Route}
                      className="btn-outline"
                    >
                      {t.chatBtn}
                    </Link>
                    <Link
                      href={`/proyectos/${p.project.slug}/reventa` as Route}
                      className="btn-outline"
                    >
                      {t.resellBtn}
                    </Link>
                  </div>

                  {cert && (
                    <div className="mt-5 hairline-t pt-4 flex items-center justify-between gap-3 flex-wrap">
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
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {founderRows.length > 0 && (
        <Section title={t.founderEquityTitle}>
          <p className="mb-4 text-navy/70 leading-relaxed">{t.founderEquityNote}</p>
          <ul className="flex flex-col gap-4">
            {founderRows.map((f) => (
              <li key={f.id} className="hairline bg-paper p-5 sm:p-6">
                <div>
                  <Link
                    href={`/proyectos/${f.project.slug}` as Route}
                    className="font-sans text-navy hover:!text-gold break-words"
                  >
                    {f.project.name}
                  </Link>
                  {f.project.shortPitch && (
                    <p className="mt-1 eyebrow">{f.project.shortPitch}</p>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                  <div>
                    <p className="eyebrow">{t.founderColRole}</p>
                    <p className="mt-1 eyebrow !text-navy">{f.role}</p>
                  </div>
                  <div>
                    <p className="eyebrow">{t.founderColEquity}</p>
                    <p className="mt-1 font-mono text-navy">
                      {f.equityPercent.toLocaleString(locale)}%
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow">{t.colShares}</p>
                    <p className="mt-1 font-mono text-navy">
                      {formatNumber(f.shares, undefined, locale)}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="eyebrow">{t.colValue}</p>
                    <p className="mt-1 font-mono text-navy">
                      {f.value !== null
                        ? formatCurrency(f.value, f.currency, 2, locale)
                        : "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={`/proyectos/${f.project.slug}` as Route}
                    className="btn-primary"
                  >
                    {t.seeProjectBtn}
                  </Link>
                  <Link
                    href={`/proyectos/${f.project.slug}/chat` as Route}
                    className="btn-outline"
                  >
                    {t.chatBtn}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
