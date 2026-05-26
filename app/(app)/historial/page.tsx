import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
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

// Las filas del historial son densas (timestamps + montos + nombre de proyecto)
// y el usuario típicamente busca movimientos recientes. 20 alcanza para una
// vista cómoda sin sobrecargar el render ni la query.
const PAGE_SIZE = 20;

// Cuando la vista es "todos", repartimos PAGE_SIZE entre los 3 buckets y luego
// mezclamos por fecha. Ceiling porque preferimos sobre-traer un par de filas
// (descartamos al cortar) antes que mostrar menos de PAGE_SIZE por redondeo.
const PER_BUCKET = Math.ceil(PAGE_SIZE / 3);

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; periodo?: string; page?: string }>;
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
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

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

  // Cutoff del filtro periodo — empujado al where de Prisma. Antes filtrábamos
  // en JS después de traer toda la historia: cargaba años de movimientos para
  // mostrar 30 días.
  const cutoff: Date | null =
    periodo === "all"
      ? null
      : new Date(Date.now() - Number(periodo) * 24 * 60 * 60 * 1000);

  // Wheres por bucket — cada modelo tiene su propio campo de fecha:
  //   - DividendPayment usa receivedAt ?? sentAt ?? createdAt. No hay un único
  //     campo, así que filtramos por createdAt (el más cercano a "registró el
  //     movimiento"). Trade-off: un pago muy viejo confirmado hoy igual cae
  //     bajo "últimos 30 días" si createdAt cae dentro.
  //   - Participation usa acquiredAt ?? createdAt → filtramos por createdAt
  //     por la misma razón.
  //   - OwnershipHistory tiene effectiveAt explícito.
  const dividendsWhere: Prisma.DividendPaymentWhereInput = {
    recipientId: user.id,
    ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
  };
  const participationsWhere: Prisma.ParticipationWhereInput = {
    currentOwnerId: user.id,
    ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
  };
  const salesWhere: Prisma.OwnershipHistoryWhereInput = {
    fromUserId: user.id,
    ...(cutoff ? { effectiveAt: { gte: cutoff } } : {}),
  };

  // Estrategia de paginación:
  //   - Si cat != "all" → paginamos directo sobre el bucket correspondiente
  //     (skip/take exactos, total = count).
  //   - Si cat == "all" → traemos PER_BUCKET (=7) de cada bucket ya filtrados
  //     por periodo, mezclamos por fecha desc, cortamos a PAGE_SIZE. Para
  //     paginación de la vista mezclada, multiplicamos por la página: traemos
  //     (page * PER_BUCKET) y descartamos los (page-1)*PER_BUCKET primeros de
  //     cada bucket. No es perfecto cross-bucket (un bucket con muchas filas
  //     recientes "consume" sus PER_BUCKET en página 1 y deja huecos atrás),
  //     pero es lo más simple sin offset global, y el caso típico es
  //     "ver últimos N" → página 1.
  const takePerBucket = cat === "all" ? PER_BUCKET * page : PAGE_SIZE;
  const skipPerBucket = cat === "all" ? PER_BUCKET * (page - 1) : skip;

  const wantDividends = cat === "all" || cat === "dividendo";
  const wantParticipations = cat === "all" || cat === "compra";
  const wantSales = cat === "all" || cat === "venta";

  // sequentialPrisma: connection_limit=1 → no paralelizamos. Cada bucket
  // que no necesitamos resuelve a fallback sin pegar a la DB.
  const [dividends, participations, sales, totalDividends, totalParticipations, totalSales] =
    await sequentialPrisma([
      {
        run: () =>
          wantDividends
            ? prisma.dividendPayment.findMany({
                where: dividendsWhere,
                select: dividendsSelect,
                orderBy: { createdAt: "desc" },
                take: takePerBucket,
                skip: cat === "dividendo" ? skip : 0,
              })
            : Promise.resolve([] as DividendRow[]),
        fallback: [] as DividendRow[],
        tag: "historial:dividends",
      },
      {
        run: () =>
          wantParticipations
            ? prisma.participation.findMany({
                where: participationsWhere,
                select: participationsSelect,
                orderBy: { createdAt: "desc" },
                take: takePerBucket,
                skip: cat === "compra" ? skip : 0,
              })
            : Promise.resolve([] as ParticipationRow[]),
        fallback: [] as ParticipationRow[],
        tag: "historial:participations",
      },
      {
        run: () =>
          wantSales
            ? prisma.ownershipHistory.findMany({
                where: salesWhere,
                select: salesSelect,
                orderBy: { effectiveAt: "desc" },
                take: takePerBucket,
                skip: cat === "venta" ? skip : 0,
              })
            : Promise.resolve([] as SaleRow[]),
        fallback: [] as SaleRow[],
        tag: "historial:sales",
      },
      {
        run: () =>
          wantDividends
            ? prisma.dividendPayment.count({ where: dividendsWhere })
            : Promise.resolve(0),
        fallback: 0,
        tag: "historial:totalDividends",
      },
      {
        run: () =>
          wantParticipations
            ? prisma.participation.count({ where: participationsWhere })
            : Promise.resolve(0),
        fallback: 0,
        tag: "historial:totalParticipations",
      },
      {
        run: () =>
          wantSales
            ? prisma.ownershipHistory.count({ where: salesWhere })
            : Promise.resolve(0),
        fallback: 0,
        tag: "historial:totalSales",
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

  // En la vista mixta cortamos a PAGE_SIZE después del merge; para una cat
  // específica el take/skip ya nos dejó la página exacta.
  const pageMovements =
    cat === "all" ? movements.slice(0, PAGE_SIZE) : movements;

  const total =
    cat === "dividendo"
      ? totalDividends
      : cat === "compra"
        ? totalParticipations
        : cat === "venta"
          ? totalSales
          : totalDividends + totalParticipations + totalSales;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        {pageMovements.length === 0 ? (
          <p className="text-navy/60">
            {total === 0 && cat === "all" && periodo === "all"
              ? t.empty
              : t.emptyFiltered}
          </p>
        ) : (
          <ul className="hairline-t">
            {pageMovements.map((m) => (
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

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between hairline-t pt-6">
          <HistorialPageLink
            page={page - 1}
            disabled={page <= 1}
            cat={cat}
            periodo={periodo}
            label="← Previous"
          />
          <p className="eyebrow font-mono">
            {page} / {totalPages}
          </p>
          <HistorialPageLink
            page={page + 1}
            disabled={page >= totalPages}
            cat={cat}
            periodo={periodo}
            label="Next →"
          />
        </div>
      )}
    </div>
  );
}

function HistorialPageLink({
  page,
  disabled,
  cat,
  periodo,
  label,
}: {
  page: number;
  disabled: boolean;
  cat: Cat;
  periodo: Periodo;
  label: string;
}) {
  if (disabled) {
    return <span className="eyebrow !text-navy/30">{label}</span>;
  }
  const params = new URLSearchParams();
  if (cat !== "all") params.set("cat", cat);
  if (periodo !== "all") params.set("periodo", periodo);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return (
    <Link
      href={(qs ? `/historial?${qs}` : "/historial") as Route}
      className="eyebrow hover:!text-gold"
    >
      {label}
    </Link>
  );
}
