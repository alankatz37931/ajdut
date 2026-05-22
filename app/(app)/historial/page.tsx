import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format";

export const metadata = { title: "Historial · AJDUT" };

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

const TYPE_LABEL: Record<Movement["type"], string> = {
  dividendo: "Dividendo cobrado",
  compra: "Compra de acciones",
  venta: "Venta de acciones",
};

const CAT_OPTIONS: { value: Cat; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "dividendo", label: "Dividendos" },
  { value: "compra", label: "Compras" },
  { value: "venta", label: "Ventas" },
];

const PERIODO_OPTIONS: { value: Periodo; label: string }[] = [
  { value: "all", label: "Todo el tiempo" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "365", label: "Últimos 12 meses" },
];

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; periodo?: string }>;
}) {
  const user = await requireSession();
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

  const [dividends, participations, sales] = await Promise.all([
    prisma.dividendPayment.findMany({
      where: { recipientId: user.id },
      select: {
        id: true,
        amount: true,
        currency: true,
        shareCount: true,
        receivedAt: true,
        sentAt: true,
        createdAt: true,
        distribution: { select: { project: { select: { name: true } } } },
      },
    }),
    prisma.participation.findMany({
      where: { currentOwnerId: user.id },
      select: {
        id: true,
        shareCount: true,
        acquiredAt: true,
        createdAt: true,
        project: { select: { name: true } },
      },
    }),
    prisma.ownershipHistory.findMany({
      where: { fromUserId: user.id },
      select: {
        id: true,
        effectiveAt: true,
        participation: {
          select: {
            shareCount: true,
            project: { select: { name: true } },
          },
        },
      },
    }),
  ]);

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

  const chipClass = (active: boolean) =>
    `eyebrow whitespace-nowrap transition-colors ${
      active ? "!text-navy" : "!text-navy/40 hover:!text-navy"
    }`;

  const hrefFor = (nextCat: Cat, nextPeriodo: Periodo) => {
    const query: Record<string, string> = {};
    if (nextCat !== "all") query.cat = nextCat;
    if (nextPeriodo !== "all") query.periodo = nextPeriodo;
    return { pathname: "/historial", query };
  };

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Tu actividad</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Historial</h1>
        <p className="mt-3 text-navy/75 leading-relaxed max-w-2xl">
          Todos tus movimientos en AJDUT — dividendos cobrados, compras y
          ventas de acciones.
        </p>
      </header>

      <div className="mt-2 space-y-3">
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {CAT_OPTIONS.map((o) => (
            <Link
              key={o.value}
              href={hrefFor(o.value, periodo)}
              className={chipClass(cat === o.value)}
            >
              {o.label}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {PERIODO_OPTIONS.map((o) => (
            <Link
              key={o.value}
              href={hrefFor(cat, o.value)}
              className={chipClass(periodo === o.value)}
            >
              {o.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-8">
        {filtered.length === 0 ? (
          <p className="text-navy/60">
            {movements.length === 0
              ? "Todavía no tenés movimientos registrados."
              : "No hay movimientos para ese filtro."}
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
                    {TYPE_LABEL[m.type]}
                  </p>
                  <p className="mt-1 text-navy break-words">{m.projectName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-navy">
                    {m.amount
                      ? formatCurrency(m.amount.value, m.amount.currency)
                      : `${formatNumber(m.shares ?? 0)} acc.`}
                  </p>
                  <p className="mt-1 eyebrow !text-navy/40">
                    {formatDate(m.date)}
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
