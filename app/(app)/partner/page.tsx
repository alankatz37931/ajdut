import Link from "next/link";
import type { Route } from "next";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { Section } from "@/components/ui/Section";
import { KpiCard } from "@/components/ui/KpiCard";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format";

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
  CANCELLED: "Cancelado",
};

const PAYMENT_STATUS_SYMBOL: Record<string, string> = {
  PENDING: "○",
  SENT: "◐",
  RECEIVED: "●",
  DISPUTED: "✕",
  CANCELLED: "◇",
};

export default async function PartnerDashboardPage() {
  // Cualquier usuario con sesión puede ver SUS participaciones (la query
  // filtra por currentOwnerId === user.id, no expone nada de terceros).
  const user = await requireSession();

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
      orderBy: [{ receivedAt: "desc" }, { sentAt: "desc" }],
      include: {
        distribution: {
          select: {
            title: true,
            fiscalPeriod: true,
            recordDate: true,
            project: { select: { name: true, slug: true } },
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

  // Totales de dividendos cobrados (status RECEIVED)
  const dividendsReceivedByCurrency = new Map<string, number>();
  const dividendsPendingByCurrency = new Map<string, number>();
  for (const dp of dividendPayments) {
    const amt = Number(dp.amount);
    if (dp.status === "RECEIVED") {
      dividendsReceivedByCurrency.set(
        dp.currency,
        (dividendsReceivedByCurrency.get(dp.currency) ?? 0) + amt
      );
    } else if (dp.status === "PENDING" || dp.status === "SENT") {
      dividendsPendingByCurrency.set(
        dp.currency,
        (dividendsPendingByCurrency.get(dp.currency) ?? 0) + amt
      );
    }
  }

  const certificatesCount = rows.reduce((s, r) => s + r.certificates.length, 0);

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
              otherCurrencies.length > 0
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

      <Section title="Dividendos">
        {dividendPayments.length === 0 ? (
          <p className="text-navy/60">
            Aún no hay distribuciones de dividendos sobre tus participaciones. Cuando un founder
            declare una distribución, aparecerá acá con instrucciones de cobro.
          </p>
        ) : (
          <>
            {(dividendsReceivedByCurrency.size > 0 ||
              dividendsPendingByCurrency.size > 0) && (
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line">
                <KpiCard
                  label="Cobrado"
                  value={
                    dividendsReceivedByCurrency.size > 0
                      ? Array.from(dividendsReceivedByCurrency.entries())
                          .map(([c, v]) => formatCurrency(v, c))
                          .join(" + ")
                      : "—"
                  }
                  hint="confirmado por vos"
                />
                <KpiCard
                  label="Por cobrar"
                  value={
                    dividendsPendingByCurrency.size > 0
                      ? Array.from(dividendsPendingByCurrency.entries())
                          .map(([c, v]) => formatCurrency(v, c))
                          .join(" + ")
                      : "—"
                  }
                  hint="enviados o pendientes"
                />
              </div>
            )}
            <ul className="hairline-t">
              {dividendPayments.map((dp) => (
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
          </>
        )}
      </Section>
    </div>
  );
}
