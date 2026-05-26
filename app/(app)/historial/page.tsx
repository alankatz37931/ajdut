import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { sequentialPrisma } from "@/lib/prisma/safe";
import { getDict, getLocale } from "@/lib/i18n";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format";
import { HistoryFilters } from "./HistoryFilters";

const dividendsSelect = {
  id: true,
  amount: true,
  currency: true,
  shareCount: true,
  receivedAt: true,
  sentAt: true,
  createdAt: true,
  distribution: { select: { project: { select: { name: true } } } },
} satisfies Prisma.DividendPaymentSelect;

const participationsSelect = {
  id: true,
  shareCount: true,
  acquiredAt: true,
  createdAt: true,
  project: { select: { name: true } },
} satisfies Prisma.ParticipationSelect;

const salesSelect = {
  id: true,
  effectiveAt: true,
  participation: {
    select: {
      shareCount: true,
      project: { select: { name: true } },
    },
  },
} satisfies Prisma.OwnershipHistorySelect;

type DividendRow = Prisma.DividendPaymentGetPayload<{ select: typeof dividendsSelect }>;
type ParticipationRow = Prisma.ParticipationGetPayload<{ select: typeof participationsSelect }>;
type SaleRow = Prisma.OwnershipHistoryGetPayload<{ select: typeof salesSelect }>;

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.historial.metaTitle };
}

type Cat = "all" | "dividendo" | "compra" | "venta";
type Periodo = "all" | "30" | "90" | "365";

type Movement = {
  id: string;
  type: "dividendo" | "compra" | "venta";
  date: Date;
  projectName: string;
  shares: number | null;
  amount: { value: number; currency: string } | null;
};

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; periodo?: string }>;
}) {
  const user = await requireSession();
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.historial;
  const sp = await searchParams;

  const catParam = sp.cat ?? "";
  const cat: Cat =
    catParam === "dividendo" || catParam === "compra" || catParam === "venta"
      ? catParam
      : "all";
  const periodoParam = sp.periodo ?? "";
  const periodo: Periodo =
    periodoParam === "30" || periodoParam === "90" || periodoParam === "365"
      ? periodoParam
      : "all";

  const CAT_OPTIONS: { value: Cat; label: string }[] = [
    { value: "all", label: t.cats.all },
    { value: "dividendo", label: t.cats.dividendo },
    { value: "compra", label: t.cats.compra },
    { value: "venta", label: t.cats.venta },
  ];
  const PERIODO_OPTIONS: { value: Periodo; label: string }[] = [
    { value: "all", label: t.periods.all },
    { value: "30", label: t.periods["30"] },
    { value: "90", label: t.periods["90"] },
    { value: "365", label: t.periods["365"] },
  ];

  // Secuencial: 3 findMany concurrentes con connection_limit=1 dispara timeout.
  // Cada bucket cae a [] si la query falla — el historial mostrará menos
  // movimientos pero la página entra (mejor que crashear /historial completo).
  const [dividends, participations, sales] = await sequentialPrisma([
    {
      run: () =>
        prisma.dividendPayment.findMany({
          where: { recipientId: user.id },
          select: dividendsSelect,
        }),
      fallback: [] as DividendRow[],
      tag: "historial:dividends",
    },
    {
      run: () =>
        prisma.participation.findMany({
          where: { currentOwnerId: user.id },
          select: participationsSelect,
        }),
      fallback: [] as ParticipationRow[],
      tag: "historial:participations",
    },
    {
      run: () =>
        prisma.ownershipHistory.findMany({
          where: { fromUserId: user.id },
          select: salesSelect,
        }),
      fallback: [] as SaleRow[],
      tag: "historial:sales",
    },
  ] as const);

  const movements: Movement[] = [];
  for (const d of dividends) {
    movements.push({
      id: `div-${d.id}`,
      type: "dividendo",
      date: d.receivedAt ?? d.sentAt ?? d.createdAt,
      projectName: d.distribution.project.name,
      shares: d.shareCount,
      amount: { value: Number(d.amount), currency: d.currency },
    });
  }
  for (const p of participations) {
    movements.push({
      id: `buy-${p.id}`,
      type: "compra",
      date: p.acquiredAt ?? p.createdAt,
      projectName: p.project.name,
      shares: p.shareCount,
      amount: null,
    });
  }
  for (const s of sales) {
    movements.push({
      id: `sell-${s.id}`,
      type: "venta",
      date: s.effectiveAt,
      projectName: s.participation.project.name,
      shares: s.participation.shareCount,
      amount: null,
    });
  }

  movements.sort((a, b) => b.date.getTime() - a.date.getTime());

  const cutoff =
    periodo === "all"
      ? null
      : Date.now() - Number(periodo) * 24 * 60 * 60 * 1000;
  const filtered = movements.filter((m) => {
    if (cat !== "all" && m.type !== cat) return false;
    if (cutoff !== null && m.date.getTime() < cutoff) return false;
    return true;
  });

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">{t.intro}</p>
      </header>

      <HistoryFilters
        cat={cat}
        periodo={periodo}
        catOptions={CAT_OPTIONS}
        periodOptions={PERIODO_OPTIONS}
        catLabel={t.catLabel}
        periodLabel={t.periodLabel}
      />

      <div className="mt-8">
        {filtered.length === 0 ? (
          <p className="text-navy/60">
            {movements.length === 0 ? t.empty : t.emptyFiltered}
          </p>
        ) : (
          <ul className="hairline-t">
            {filtered.map((m) => (
              <li
                key={m.id}
                className="hairline-b py-4 flex items-baseline justify-between gap-4"
              >
                <div className="min-w-0">
                  <p
                    className={`eyebrow ${
                      m.type === "dividendo" ? "!text-gold" : "!text-navy/50"
                    }`}
                  >
                    {t.types[m.type]}
                  </p>
                  <p className="mt-1 text-navy break-words">{m.projectName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-navy">
                    {m.amount
                      ? formatCurrency(
                          m.amount.value,
                          m.amount.currency,
                          2,
                          locale
                        )
                      : `${formatNumber(m.shares ?? 0, undefined, locale)} ${t.sharesSuffix}`}
                  </p>
                  <p className="mt-1 eyebrow !text-navy/40">
                    {formatDate(m.date, locale)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
