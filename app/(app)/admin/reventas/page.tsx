import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { sequentialPrisma } from "@/lib/prisma/safe";
import { getDict, getLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/format";
import { ResaleTransferActions } from "./ResaleTransferActions";

const adminResalesListingSelect = {
  id: true,
  status: true,
  intentNote: true,
  contactChannel: true,
  createdAt: true,
  proposedBuyerId: true,
  buyerAcceptedAt: true,
  ownerAcceptedAt: true,
  shareCount: true,
  seller: { select: { fullName: true, alias: true, email: true } },
  project: { select: { name: true, slug: true } },
  participation: { select: { serialCode: true, shareCount: true } },
} satisfies Prisma.ResaleListingSelect;

type AdminResaleListingRow = Prisma.ResaleListingGetPayload<{
  select: typeof adminResalesListingSelect;
}>;

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.adminReventas.metaTitle };
}

export default async function AdminResalesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.adminReventas;
  const sp = await searchParams;
  const filter = sp.filter ?? "pending";

  // Números enteros en el locale del viewer (no hardcodear es-MX) — mismo
  // patrón que admin/asignaciones.
  function fmtInt(n: number): string {
    return n.toLocaleString(locale);
  }

  const where =
    filter === "completed"
      ? { status: "COMPLETED" as const }
      : filter === "all"
      ? {}
      : { status: "AWAITING_VALIDATION" as const };

  // Secuencial: 4 queries concurrentes con connection_limit=1 dispara pool
  // timeout. Cada count tiene fallback 0 → el badge muestra (0) si falla pero
  // la página renderea. El listado principal sin fallback razonable usa [].
  const [listings, pendingCount, completedCount, allCount] = await sequentialPrisma([
    {
      run: () =>
        prisma.resaleListing.findMany({
          where,
          orderBy:
            filter === "pending" ? { createdAt: "asc" } : { createdAt: "desc" },
          take: 100,
          select: adminResalesListingSelect,
        }),
      fallback: [] as AdminResaleListingRow[],
      tag: "adminReventas:listings",
    },
    {
      run: () =>
        prisma.resaleListing.count({ where: { status: "AWAITING_VALIDATION" } }),
      fallback: 0,
      tag: "adminReventas:pendingCount",
    },
    {
      run: () => prisma.resaleListing.count({ where: { status: "COMPLETED" } }),
      fallback: 0,
      tag: "adminReventas:completedCount",
    },
    {
      run: () => prisma.resaleListing.count(),
      fallback: 0,
      tag: "adminReventas:allCount",
    },
  ] as const);

  const buyerIds = Array.from(
    new Set(
      listings
        .map((l) => l.proposedBuyerId)
        .filter((x): x is string => x !== null)
    )
  );
  const buyers = buyerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: buyerIds } },
        select: { id: true, fullName: true, alias: true, email: true },
      })
    : [];
  const buyerMap = new Map(buyers.map((b) => [b.id, b]));

  const countsByFilter: Record<string, number> = {
    pending: pendingCount,
    completed: completedCount,
    all: allCount,
  };

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
        <p className="mt-3 font-mono text-sm text-navy/75">
          {pendingCount === 0
            ? t.emptyInbox
            : (pendingCount === 1
                ? t.pendingCountSingle
                : t.pendingCountPlural
              ).replace("{n}", String(pendingCount))}
        </p>
      </header>

      <nav className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        {(["pending", "completed", "all"] as const).map((key) => {
          const active = filter === key;
          const count = countsByFilter[key] ?? 0;
          return (
            <Link
              key={key}
              href={{ pathname: "/admin/reventas", query: { filter: key } }}
              className={`eyebrow whitespace-nowrap transition-colors inline-flex items-center py-2 px-3 min-h-[44px] ${
                active ? "!text-navy" : "!text-navy/40 hover:!text-navy"
              }`}
            >
              {t.filters[key]}{" "}
              <span className={active ? "text-gold" : "text-navy/30"}>
                ({count})
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-10">
        {listings.length === 0 ? (
          <p className="text-navy/60">
            {filter === "completed"
              ? t.emptyByFilter.completed
              : filter === "all"
              ? t.emptyByFilter.all
              : t.emptyByFilter.pending}
          </p>
        ) : (
          <ul className="space-y-6">
            {listings.map((l) => {
              const sellerName = l.seller.alias ?? l.seller.fullName;
              const buyer = l.proposedBuyerId
                ? buyerMap.get(l.proposedBuyerId)
                : null;
              const buyerName = buyer
                ? buyer.alias ?? buyer.fullName
                : t.row.noBuyer;
              const isPending = l.status === "AWAITING_VALIDATION";
              const railClass = isPending
                ? "bg-gold"
                : l.status === "COMPLETED"
                ? "bg-navy/60"
                : "bg-navy/20";
              const statusLabel =
                (t.status as Record<string, string>)[l.status] ?? l.status;

              return (
                <li key={l.id} className="flex gap-4">
                  <span
                    aria-hidden
                    className={`shrink-0 w-[3px] self-stretch ${railClass}`}
                  />
                  <div className="flex-1 min-w-0 py-2 pr-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link
                        href={`/proyectos/${l.project.slug}` as Route}
                        className="font-sans text-navy text-base sm:text-lg leading-tight hover:!text-gold break-words [overflow-wrap:anywhere] min-w-0"
                      >
                        {l.project.name}
                      </Link>
                      <p className="eyebrow shrink-0 !text-navy/40">
                        {formatDate(l.createdAt, locale)}
                      </p>
                    </div>

                    <p className="mt-1 eyebrow">
                      <span className={isPending ? "!text-gold" : "!text-navy/50"}>
                        {statusLabel}
                      </span>
                    </p>

                    {isPending && (
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                        <span
                          className={
                            l.buyerAcceptedAt ? "eyebrow !text-gold" : "eyebrow !text-navy/40"
                          }
                        >
                          {l.buyerAcceptedAt
                            ? t.tripartite.buyerConfirmed
                            : t.tripartite.buyerPending}
                        </span>
                        <span
                          className={
                            l.ownerAcceptedAt ? "eyebrow !text-gold" : "eyebrow !text-navy/40"
                          }
                        >
                          {l.ownerAcceptedAt
                            ? t.tripartite.ownerConfirmed
                            : t.tripartite.ownerPending}
                        </span>
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-sm">
                      <div className="min-w-0">
                        <p className="eyebrow !text-navy/40">{t.row.seller}</p>
                        <p className="mt-1 text-navy break-words">{sellerName}</p>
                        <p className="text-navy/60 text-xs break-all">{l.seller.email}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="eyebrow !text-navy/40">{t.row.buyer}</p>
                        <p className="mt-1 text-navy break-words">{buyerName}</p>
                        {buyer && (
                          <p className="text-navy/60 text-xs break-all">{buyer.email}</p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="eyebrow !text-navy/40">{t.row.shares}</p>
                        <p className="mt-1 text-navy">
                          {fmtInt(l.participation.shareCount)}
                        </p>
                        <p className="text-navy/60 text-xs break-all">
                          {l.participation.serialCode}
                        </p>
                      </div>
                    </div>

                    {l.intentNote.trim().length > 0 && (
                      <p className="mt-3 text-navy/75 text-sm leading-relaxed whitespace-pre-line break-words">
                        “{l.intentNote}”
                      </p>
                    )}
                    <p className="mt-2 eyebrow !text-navy/40 break-words">
                      {t.row.contact}{" "}
                      <span className="!text-navy/70">{l.contactChannel}</span>
                    </p>

                    {isPending && (
                      <div className="mt-4">
                        <ResaleTransferActions
                          resaleListingId={l.id}
                          sellerName={sellerName}
                          buyerName={buyerName}
                          shareCount={l.shareCount ?? l.participation.shareCount}
                          buyerConfirmed={l.buyerAcceptedAt !== null}
                          ownerConfirmed={l.ownerAcceptedAt !== null}
                          dict={t.actions}
                          tripartiteDict={t.tripartite}
                          locale={locale}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
