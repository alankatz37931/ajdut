import Link from "next/link";
import type { Route } from "next";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Section } from "@/components/ui/Section";
import { KpiCard } from "@/components/ui/KpiCard";
import { getUserPreferences } from "@/lib/preferences";
import {
  formatCurrency,
  formatDate,
  formatDualCurrency,
  formatNumber,
} from "@/lib/utils/format";

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Asignada",
  IN_RESALE: "En reventa",
  TRANSFER_PENDING: "Transferencia pendiente",
  AVAILABLE: "Disponible",
  IN_NEGOTIATION: "En negociación",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  SENT: "Enviado por founder",
  RECEIVED: "Confirmado",
  DISPUTED: "En disputa",
  WAIVED: "Renunciado",
};

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
  // Cualquier usuario con sesión puede ver SUS participaciones (la query
  // filtra por currentOwnerId === user.id, no expone nada de terceros).
  const user = await requireSession();
  const prefs = await getUserPreferences();
  const prefersMxn = prefs.currency === "MXN";

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

  // Cálculos del portafolio
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

  // Agrupamos por moneda para no sumar peras con manzanas
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

  // ─── Histórico de dividendos: agregaciones ─────────────────────────
  //
  // Filosofía AJDUT: el socio ve sus números reales — lo que cobró, lo que
  // está pendiente y la traza temporal. Sumamos solo lo confirmado
  // (RECEIVED) por moneda. Pendiente: PENDING + SENT.
  const now = new Date();
  const days = (n: number) => n * 24 * 60 * 60 * 1000;
  const last30 = new Date(now.getTime() - days(30));
  const last90 = new Date(now.getTime() - days(90));
  const last180 = new Date(now.getTime() - days(180));

  // Fecha de referencia del pago: la confirmada si existe; si no, la enviada
  // por el founder; si no, recordDate.
  function paymentDate(p: (typeof dividendPayments)[number]): Date {
    return p.receivedAt ?? p.sentAt ?? p.distribution.recordDate;
  }

  // Sumas por período. Solo contamos pagos confirmados (RECEIVED) — la idea
  // es "cuánto cobré realmente". Por moneda.
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

  // Helper de render: convierte ByCurrency en string "USD 123 + MXN 456",
  // ordenado, eligiendo USD primero. Si vacío devuelve "—".
  function renderByCurrency(m: ByCurrency, fallback = "—"): string {
    if (m.size === 0) return fallback;
    const entries = Array.from(m.entries()).sort((a, b) => {
      if (a[0] === "USD") return -1;
      if (b[0] === "USD") return 1;
      return a[0].localeCompare(b[0]);
    });
    return entries.map(([c, v]) => formatCurrency(v, c)).join(" + ");
  }

  // Hint adicional con equivalente MXN cuando el viewer prefiere MXN
  // y hay total en USD.
  function dualHint(m: ByCurrency, hint: string): string {
    if (!prefersMxn) return hint;
    const usd = m.get("USD");
    if (!usd) return hint;
    const dual = formatDualCurrency(usd, true).secondary;
    return dual ?? hint;
  }

  // Pendiente / por cobrar (PENDING + SENT)
  const dividendsPendingByCurrency: ByCurrency = new Map();
  for (const p of dividendPayments) {
    if (p.status === "PENDING" || p.status === "SENT") {
      dividendsPendingByCurrency.set(
        p.currency,
        (dividendsPendingByCurrency.get(p.currency) ?? 0) + Number(p.amount)
      );
    }
  }

  // ─── Breakdown por proyecto (solo confirmados) ─────────────────────
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

  // Sembrar el breakdown con los proyectos en los que el socio tiene
  // participaciones (así mostramos política aunque todavía no haya cobrado
  // dividendos). Si tiene pagos de un proyecto que ya no posee, igual lo
  // sumamos más abajo — el socio puede haber vendido y conserva su histórico.
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
        // No traemos startupProfile para proyectos donde el socio ya no posee;
        // dejamos política en null y se muestra "No declarada".
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
    // Proyectos con pagos primero, ordenados por último pago descendente.
    if (a.lastPaymentAt && b.lastPaymentAt) {
      return b.lastPaymentAt.getTime() - a.lastPaymentAt.getTime();
    }
    if (a.lastPaymentAt) return -1;
    if (b.lastPaymentAt) return 1;
    return a.projectName.localeCompare(b.projectName);
  });

  // ─── Stats por participation (para la card de "Participaciones activas")
  // Necesitamos mostrar "Recibido total: USD X · Último pago: fecha".
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

  // Histórico cronológico (últimos 20). Los pagos ya vienen ordenados por
  // fecha de recepción / envío descendente.
  const historyRows = dividendPayments.slice(0, HISTORY_PAGE_SIZE);

  return (
    <div>
      <div className="pt-5 pb-5 sm:pt-7 sm:pb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">— Mi cartera</p>
          <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Mis participaciones</h1>
          <p className="mt-4 max-w-xl text-navy/75 leading-relaxed">
            Acceso exclusivo a los proyectos que respaldas. No verás otros miembros ni montos
            agregados de terceros.
          </p>
        </div>
        <Link href={"/proyectos" as Route} className="btn-outline shrink-0">
          Explorar proyectos →
        </Link>
      </div>

      {/* KPIs del portafolio */}
      {participations.length > 0 && (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <KpiCard
            label="Valor total del portafolio"
            value={formatCurrency(primaryTotal, primaryCurrency)}
            hint={
              prefersMxn && primaryCurrency === "USD"
                ? (formatDualCurrency(primaryTotal, true).secondary ??
                  (otherCurrencies.length > 0
                    ? `+ ${otherCurrencies
                        .map(([c, v]) => formatCurrency(v, c))
                        .join(" + ")}`
                    : `${projectsCount} proyecto${projectsCount === 1 ? "" : "s"}`))
                : otherCurrencies.length > 0
                  ? `+ ${otherCurrencies
                      .map(([c, v]) => formatCurrency(v, c))
                      .join(" + ")}`
                  : `${projectsCount} proyecto${projectsCount === 1 ? "" : "s"}`
            }
            highlight
          />
          <KpiCard
            label="Acciones totales"
            value={formatNumber(totalShares)}
            hint="en todos los proyectos"
          />
          <KpiCard
            label="Proyectos activos"
            value={String(projectsCount)}
            hint={
              activeProjectsCount < projectsCount
                ? `${projectsCount - activeProjectsCount} sin valoración informada`
                : "con valoración informada"
            }
          />
          <KpiCard
            label="Certificados"
            value={String(certificatesCount)}
            hint={
              certificatesCount > 0
                ? "emitidos a tu nombre"
                : "se emiten al asignar acciones"
            }
          />
        </div>
      )}

      <Section title="Participaciones activas">
        {rows.length === 0 ? (
          <p className="text-navy/60">
            Aún no tienes participaciones asignadas. Cuando AJDUT te las asigne, aparecerán aquí.
          </p>
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
                        <Link
                          href={`/proyectos/${p.project.slug}` as Route}
                          className="font-sans text-navy hover:!text-gold"
                        >
                          {p.project.name}
                        </Link>
                        <p className="mt-1 eyebrow">{p.project.shortPitch}</p>
                      </div>
                      <Link
                        href={`/proyectos/${p.project.slug}` as Route}
                        className="eyebrow text-gold shrink-0"
                      >
                        Ver proyecto →
                      </Link>
                    </div>
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      <div>
                        <p className="eyebrow">Acciones</p>
                        <p className="mt-1 font-mono text-navy">{formatNumber(p.shareCount)}</p>
                      </div>
                      <div>
                        <p className="eyebrow">Valor</p>
                        <p className="mt-1 font-mono text-navy">
                          {p.valueInProjectCurrency !== null
                            ? formatCurrency(p.valueInProjectCurrency, currency)
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
                        <p className="eyebrow">Estado</p>
                        <p className="mt-1 eyebrow !text-navy">
                          {STATUS_LABEL[p.status] ?? p.status}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="eyebrow">Adquirida</p>
                        <p className="mt-1 eyebrow !text-navy">
                          {p.acquiredAt ? formatDate(p.acquiredAt) : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Stats compactos de dividendos confirmados para
                        esta participación. Eyebrow chico, una línea. */}
                    {hasDividendStats && (
                      <p className="mt-3 eyebrow !text-navy/60">
                        Recibido total:{" "}
                        <span className="text-navy">
                          {renderByCurrency(stats!.receivedByCurrency)}
                        </span>
                        {stats!.lastPaymentAt && (
                          <>
                            {" · Último pago: "}
                            <span className="text-navy">
                              {formatDate(stats!.lastPaymentAt)}
                            </span>
                          </>
                        )}
                      </p>
                    )}

                    {cert && (
                      <div className="mt-3 hairline-t pt-3 flex items-center justify-between gap-3 flex-wrap">
                        <div className="font-mono text-xs text-navy/70">
                          Certificado <span className="text-navy">{cert.serialCode}</span> · Emitido{" "}
                          {formatDate(cert.issuedAt)}
                        </div>
                        <Link
                          href={`/certificado/${cert.id}` as Route}
                          className="eyebrow hover:!text-gold"
                        >
                          Ver certificado →
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

      {/* ─── Histórico de dividendos (Ola 6) ──────────────────────────
          Vista personal del socio: cuánto cobró por período, breakdown por
          proyecto, política declarada por cada founder, lista cronológica
          y descarga del CSV. Solo refleja datos del propio user. */}
      <Section title="Histórico de dividendos">
        {dividendPayments.length === 0 && breakdownList.length === 0 ? (
          <p className="text-navy/60">
            Aún no hay distribuciones de dividendos sobre tus participaciones. Cuando un founder
            declare una distribución, aparecerá acá con instrucciones de cobro.
          </p>
        ) : (
          <div className="space-y-8">
            {/* KPIs por período (cobrado confirmado) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
              <KpiCard
                label="Último mes"
                value={renderByCurrency(totals1m)}
                hint={dualHint(totals1m, "últimos 30 días")}
              />
              <KpiCard
                label="Últimos 3 meses"
                value={renderByCurrency(totals3m)}
                hint={dualHint(totals3m, "últimos 90 días")}
              />
              <KpiCard
                label="Últimos 6 meses"
                value={renderByCurrency(totals6m)}
                hint={dualHint(totals6m, "últimos 180 días")}
              />
              <KpiCard
                label="Histórico total"
                value={renderByCurrency(totalsAll)}
                hint={dualHint(totalsAll, "confirmado por vos")}
                highlight
              />
            </div>

            {/* Por cobrar — destacado aparte */}
            {dividendsPendingByCurrency.size > 0 && (
              <div className="grid grid-cols-1 gap-px bg-line">
                <KpiCard
                  label="Por cobrar"
                  value={renderByCurrency(dividendsPendingByCurrency)}
                  hint="enviados por founder o pendientes de envío"
                />
              </div>
            )}

            {/* Descarga del CSV. <a download> nativo: el endpoint setea
                Content-Disposition con un filename con fecha. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="eyebrow !text-navy/60">
                Tu histórico completo (incluye estado y fecha de confirmación).
              </p>
              <a
                href="/api/dividends/export"
                download
                className="btn-outline shrink-0"
              >
                Descargar histórico (CSV) ↓
              </a>
            </div>

            {/* Breakdown por proyecto + política */}
            {breakdownList.length > 0 && (
              <div>
                <p className="eyebrow mb-4">Por proyecto</p>
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
                                ? "Sin distribuciones aún"
                                : `${b.paymentsCount} pago${b.paymentsCount === 1 ? "" : "s"} registrado${b.paymentsCount === 1 ? "" : "s"}`}
                            </p>
                          </div>
                          <a
                            href={`/api/projects/${b.projectSlug}/dividends-policy`}
                            download
                            className="eyebrow hover:!text-gold shrink-0"
                          >
                            Descargar política (TXT) ↓
                          </a>
                        </div>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                          <div>
                            <p className="eyebrow">Recibido total</p>
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
                            <p className="eyebrow">Último pago</p>
                            <p className="mt-1 eyebrow !text-navy">
                              {b.lastPaymentAt ? formatDate(b.lastPaymentAt) : "—"}
                            </p>
                            {b.lastPaymentAmount !== null && b.lastPaymentCurrency && (
                              <p className="mt-0.5 font-mono text-xs text-navy/60">
                                {formatCurrency(b.lastPaymentAmount, b.lastPaymentCurrency)}
                              </p>
                            )}
                          </div>
                          <div className="sm:text-right">
                            <p className="eyebrow">Frecuencia</p>
                            <p className="mt-1 eyebrow !text-navy">
                              {b.dividendsFrequency?.trim()
                                ? b.dividendsFrequency
                                : "No declarada"}
                            </p>
                          </div>
                        </div>

                        {/* Sub-bloque: política declarada por el founder.
                            Si está vacía, lo decimos explícito. */}
                        <div className="mt-4 hairline-t pt-3">
                          <p className="eyebrow !text-navy/40 mb-1">
                            Política de dividendos
                          </p>
                          {b.policyDividends?.trim() ? (
                            <p className="text-sm text-navy/85 leading-relaxed whitespace-pre-line">
                              {b.policyDividends}
                            </p>
                          ) : (
                            <p className="text-sm text-navy/60 italic">
                              El founder aún no declaró una política de dividendos.
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Lista cronológica de los últimos N pagos */}
            {historyRows.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-4">
                  <p className="eyebrow">
                    Últimos {Math.min(historyRows.length, HISTORY_PAGE_SIZE)} pagos
                  </p>
                  {dividendPayments.length > historyRows.length && (
                    <p className="eyebrow !text-navy/40">
                      {dividendPayments.length} en total
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
                          {PAYMENT_STATUS_LABEL[dp.status] ?? dp.status}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        <div>
                          <p className="eyebrow">Monto</p>
                          <p className="mt-1 font-mono text-navy">
                            {formatCurrency(Number(dp.amount), dp.currency)}
                          </p>
                        </div>
                        <div>
                          <p className="eyebrow">Acciones</p>
                          <p className="mt-1 font-mono text-navy">{formatNumber(dp.shareCount)}</p>
                        </div>
                        <div>
                          <p className="eyebrow">Fecha de registro</p>
                          <p className="mt-1 eyebrow !text-navy">
                            {formatDate(dp.distribution.recordDate)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="eyebrow">
                            {dp.status === "RECEIVED"
                              ? "Cobrado"
                              : dp.status === "SENT"
                                ? "Enviado"
                                : "Estado"}
                          </p>
                          <p className="mt-1 eyebrow !text-navy">
                            {dp.receivedAt
                              ? formatDate(dp.receivedAt)
                              : dp.sentAt
                                ? formatDate(dp.sentAt)
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
