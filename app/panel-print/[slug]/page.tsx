import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getDict, getLocale } from "@/lib/i18n";
import { getProjectReport, type ProjectReportData } from "@/lib/services/project-report";
import { Sparkline } from "@/components/report/Sparkline";
import { AutoPrint, PrintButton } from "@/components/report/PrintControls";
import { formatCurrency, formatNumber, formatDate, formatPercent } from "@/lib/utils/format";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.reportPrint.metaTitle, robots: "noindex,nofollow" };
}

export default async function ReportPrintPage({ params }: Params) {
  const user = await requireSession();
  const { slug } = await params;
  const report = await getProjectReport(slug);
  if (!report) notFound();

  // Acceso: solo el dueño del proyecto o un admin de plataforma.
  if (report.ownerId !== user.id && user.role !== "ADMIN") notFound();

  const dict = await getDict();
  const t = dict.reportPrint;
  const locale = await getLocale();
  const { project } = report;

  const stageLabel = project.stage
    ? (dict.projectList.stage as Record<string, string>)[project.stage] ?? project.stage
    : null;

  const PRINT_CSS = `
    @page { size: A4; margin: 14mm; }
    @media print {
      html, body { background: #fff !important; }
      .no-print { display: none !important; }
      .report-doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; width: 100% !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .avoid-break { break-inside: avoid; }
    }
  `;

  return (
    <div className="min-h-screen bg-paper-dark py-0 sm:py-8 print:py-0 print:bg-white">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <AutoPrint />

      {/* Barra superior — solo en pantalla. */}
      <div className="no-print mx-auto mb-4 flex max-w-[800px] items-center justify-between gap-4 px-4">
        <p className="eyebrow !text-navy/50">AJDUT · {t.docTitle}</p>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-navy/50 sm:inline">{t.toolbarHint}</span>
          <PrintButton label={t.downloadBtn} />
        </div>
      </div>

      {/* Documento. */}
      <article className="report-doc mx-auto max-w-[800px] bg-white px-10 py-12 text-navy shadow-sm sm:px-12">
        {/* ─── Encabezado ─────────────────────────────────────────── */}
        <header className="hairline-b pb-8">
          <p className="eyebrow !text-gold">AJDUT · {t.docTitle}</p>
          <h1 className="mt-3 text-h1 text-navy">{project.name}</h1>
          {project.oneLiner && (
            <p className="mt-2 max-w-2xl text-lg italic text-navy/70">
              {`"${project.oneLiner}"`}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1">
            <Meta label={t.periodLabel}>
              {formatDate(report.window.from, locale)} — {formatDate(report.window.to, locale)}
            </Meta>
            <Meta label={t.generatedLabel}>{formatDate(report.generatedAt, locale)}</Meta>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <Chip>{project.kind}</Chip>
            {project.sector && <Chip>{project.sector}</Chip>}
            {stageLabel && <Chip>{stageLabel}</Chip>}
            {project.location && <Chip>{project.location}</Chip>}
          </div>
        </header>

        {/* ─── 01 · La empresa ────────────────────────────────────── */}
        <Section eyebrow="01" title={t.companyEyebrow}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Tile
              label={t.valuationLabel}
              value={
                project.valuation != null
                  ? formatCurrency(project.valuation, project.currency, 0, locale)
                  : "—"
              }
              hint={project.valuation == null ? t.noValuation : undefined}
            />
            <Tile
              label={t.totalSharesLabel}
              value={formatNumber(project.totalShares, undefined, locale)}
            />
            <Tile
              label={t.committedLabel}
              value={formatNumber(report.capTable.committedShares, undefined, locale)}
              hint={`${t.ofLabel} ${formatNumber(project.totalShares, undefined, locale)}`}
            />
          </div>
          {project.description && (
            <p className="mt-6 max-w-3xl whitespace-pre-line leading-relaxed text-navy/80">
              {truncate(project.description, 600)}
            </p>
          )}
        </Section>

        {/* ─── 02 · Composición de capital ────────────────────────── */}
        <Section eyebrow="02" title={t.capTableEyebrow}>
          {report.capTable.rows.filter((r) => r.shares > 0).length === 0 ? (
            <Empty>{t.capEmpty}</Empty>
          ) : (
            <ul className="space-y-3">
              {report.capTable.rows
                .filter((r) => r.shares > 0)
                .map((r, i) => {
                  const pct =
                    report.capTable.totalShares > 0
                      ? (r.shares / report.capTable.totalShares) * 100
                      : 0;
                  const muted =
                    r.kind === "pool" || r.kind === "reserved" || r.kind === "unclassified";
                  const name =
                    r.kind === "pool"
                      ? t.capPool
                      : r.kind === "reserved"
                        ? t.capReserved
                        : r.kind === "unclassified"
                          ? t.capUnclassified
                          : r.name;
                  return (
                    <li key={i} className="avoid-break">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={muted ? "text-navy/50" : "text-navy"}>{name}</span>
                        <span className="font-mono text-sm text-navy/70">
                          {formatPercent(pct, 1, locale)} ·{" "}
                          {formatNumber(r.shares, undefined, locale)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line/50">
                        <div
                          className={muted ? "h-full bg-navy/25" : "h-full bg-gold"}
                          style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </Section>

        {/* ─── 03 · Equipo ────────────────────────────────────────── */}
        {report.team.length > 0 && (
          <Section eyebrow="03" title={t.teamEyebrow}>
            <ul className="hairline-t">
              {report.team.map((m, i) => (
                <li
                  key={i}
                  className="avoid-break hairline-b flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5"
                >
                  <span className="text-navy">{m.name}</span>
                  <span className="eyebrow !text-navy/50">{m.role}</span>
                  <span className="font-mono text-sm text-navy">
                    {formatPercent(m.equityPercent, 2, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ─── 04 · Métricas · últimos 3 meses ────────────────────── */}
        <Section eyebrow="04" title={t.metricsEyebrow}>
          {report.metrics.length === 0 ? (
            <Empty>{t.metricsEmpty}</Empty>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {report.metrics.map((s) => (
                <div key={s.key} className="avoid-break hairline p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="eyebrow !text-navy/50">{s.label}</p>
                      <p className="mt-1 font-mono text-xl text-navy">
                        {formatMetricValue(s.latest, s.unit, locale)}
                      </p>
                    </div>
                    {s.deltaPct != null && (
                      <span
                        className={`shrink-0 font-mono text-sm ${
                          s.deltaPct >= 0 ? "text-gold-deep" : "text-navy/50"
                        }`}
                      >
                        {s.deltaPct >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(s.deltaPct), 1, locale)}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-gold">
                    <Sparkline values={s.values} width={320} height={44} ariaLabel={s.label} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ─── 05 · Actividad del período ─────────────────────────── */}
        <Section eyebrow="05" title={t.activityEyebrow}>
          {report.milestones.length === 0 &&
          report.newHolders.count === 0 &&
          report.dividends.length === 0 &&
          report.uploadedDocs.length === 0 ? (
            <Empty>{t.activityEmpty}</Empty>
          ) : (
            <div className="space-y-5">
              {report.milestones.length > 0 && (
                <ActivityBlock title={t.milestonesLabel}>
                  <ul className="space-y-1.5">
                    {report.milestones.map((m, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3">
                        <span className="text-navy/85">{m.title}</span>
                        <span className="shrink-0 font-mono text-xs text-navy/50">
                          {formatDate(m.achievedAt, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ActivityBlock>
              )}

              {report.newHolders.count > 0 && (
                <ActivityBlock title={t.newHoldersLabel}>
                  <p className="text-navy/85">
                    {t.newHoldersFmt
                      .replace("{count}", formatNumber(report.newHolders.count, undefined, locale))
                      .replace("{shares}", formatNumber(report.newHolders.shares, undefined, locale))}
                  </p>
                </ActivityBlock>
              )}

              {report.dividends.length > 0 && (
                <ActivityBlock title={t.dividendsLabel}>
                  <ul className="space-y-1.5">
                    {report.dividends.map((d, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3">
                        <span className="text-navy/85">{d.title}</span>
                        <span className="shrink-0 font-mono text-sm text-navy">
                          {formatCurrency(d.totalAmount, d.currency, 2, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ActivityBlock>
              )}

              {report.uploadedDocs.length > 0 && (
                <ActivityBlock title={t.docsLabel}>
                  <ul className="space-y-1.5">
                    {report.uploadedDocs.map((d, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3">
                        <span className="text-navy/85">{d.title}</span>
                        <span className="shrink-0 font-mono text-xs text-navy/50">
                          {formatDate(d.createdAt, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ActivityBlock>
              )}
            </div>
          )}
        </Section>

        {/* ─── Pie ────────────────────────────────────────────────── */}
        <footer className="hairline-t mt-10 pt-5">
          <p className="text-xs leading-relaxed text-navy/45">{t.disclaimer}</p>
          <p className="mt-2 eyebrow !text-navy/40">
            AJDUT · {formatDate(report.generatedAt, locale)}
          </p>
        </footer>
      </article>
    </div>
  );
}

// ─── Helpers de presentación ────────────────────────────────────────

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-9">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-xs text-gold">{eyebrow}</span>
        <h2 className="eyebrow !text-navy">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="text-sm">
      <span className="eyebrow !text-navy/40">{label}: </span>
      <span className="font-mono text-navy/70">{children}</span>
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow !text-navy/45">{children}</span>;
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="hairline bg-paper-light px-4 py-3">
      <p className="eyebrow !text-navy/40">{label}</p>
      <p className="mt-1.5 font-mono text-lg text-navy">{value}</p>
      {hint && <p className="mt-1 font-mono text-[11px] text-navy/40">{hint}</p>}
    </div>
  );
}

function ActivityBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="avoid-break">
      <p className="eyebrow !text-navy/50 mb-2">{title}</p>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-navy/50">{children}</p>;
}

// ─── Formato de valores ─────────────────────────────────────────────

const CURRENCY_UNITS = new Set(["USD", "MXN", "EUR", "ARS"]);

function formatMetricValue(value: number, unit: string, locale: string): string {
  if (CURRENCY_UNITS.has(unit)) return formatCurrency(value, unit, 2, locale);
  if (unit === "%") return `${formatNumber(value, undefined, locale)}%`;
  const num = formatNumber(value, undefined, locale);
  return unit ? `${num} ${unit}` : num;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max).trimEnd()}…`;
}
