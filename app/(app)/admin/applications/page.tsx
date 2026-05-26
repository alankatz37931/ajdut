import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import type { Application } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { sequentialPrisma } from "@/lib/prisma/safe";
import { getDict } from "@/lib/i18n";
import { SYMBOL } from "@/lib/utils/status-symbols";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.adminApplications.metaTitle };
}

// Símbolos geométricos para cada estado de Application (paleta canónica en
// `@/lib/utils/status-symbols`).
const STATUS_SYMBOL: Record<string, string> = {
  PENDING: SYMBOL.open,
  UNDER_REVIEW: SYMBOL.open,
  APPROVED: SYMBOL.done,
  REJECTED: SYMBOL.reject,
};

const MOTIVATION_PREVIEW_CHARS = 140;

export default async function ApplicationsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const dict = await getDict();
  const t = dict.adminApplications;
  const sp = await searchParams;
  const filter = sp.filter ?? "pending";

  const where =
    filter === "all"
      ? {}
      : filter === "resolved"
      ? { status: { in: ["APPROVED" as const, "REJECTED" as const] } }
      : { status: { in: ["PENDING" as const, "UNDER_REVIEW" as const] } };

  // Secuencial: 4 queries concurrentes con connection_limit=1 dispara pool
  // timeout. Counts caen a 0 si la DB falla; listado cae a [] (empty state).
  const [applications, allCount, pendingCount, resolvedCount] =
    await sequentialPrisma([
      {
        run: () =>
          prisma.application.findMany({
            where,
            orderBy: { createdAt: "asc" },
            take: 100,
          }),
        fallback: [] as Application[],
        tag: "adminApplications:list",
      },
      {
        run: () => prisma.application.count(),
        fallback: 0,
        tag: "adminApplications:allCount",
      },
      {
        run: () =>
          prisma.application.count({
            where: { status: { in: ["PENDING" as const, "UNDER_REVIEW" as const] } },
          }),
        fallback: 0,
        tag: "adminApplications:pendingCount",
      },
      {
        run: () =>
          prisma.application.count({
            where: { status: { in: ["APPROVED" as const, "REJECTED" as const] } },
          }),
        fallback: 0,
        tag: "adminApplications:resolvedCount",
      },
    ] as const);

  const countsByFilter: Record<string, number> = {
    all: allCount,
    pending: pendingCount,
    resolved: resolvedCount,
  };

  const summaryParts: string[] = [];
  if (pendingCount > 0) {
    summaryParts.push(
      (pendingCount === 1 ? t.summaryPendingSingle : t.summaryPendingPlural).replace(
        "{n}",
        String(pendingCount)
      )
    );
  }
  if (resolvedCount > 0) {
    summaryParts.push(
      (resolvedCount === 1 ? t.summaryResolvedSingle : t.summaryResolvedPlural).replace(
        "{n}",
        String(resolvedCount)
      )
    );
  }

  const filterEntries: Array<[string, string]> = [
    ["all", t.filters.all],
    ["pending", t.filters.pending],
    ["resolved", t.filters.resolved],
  ];

  function emptyMessageFor(f: string): string {
    if (f === "all") return t.emptyAll;
    if (f === "resolved") return t.emptyResolved;
    return t.emptyPending;
  }

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
        {summaryParts.length > 0 ? (
          <p className="mt-3 font-mono text-sm text-navy/75">
            {summaryParts.join(" · ")}
          </p>
        ) : (
          <p className="mt-3 font-mono text-sm text-navy/60">{t.summaryEmpty}</p>
        )}
      </header>

      <nav className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        {filterEntries.map(([key, label]) => {
          const active = filter === key;
          const count = countsByFilter[key] ?? 0;
          return (
            <Link
              key={key}
              href={{ pathname: "/admin/applications", query: { filter: key } }}
              className={`eyebrow whitespace-nowrap transition-colors inline-flex items-center py-2 px-3 min-h-[44px] ${
                active ? "!text-navy" : "!text-navy/40 hover:!text-navy"
              }`}
            >
              {label}{" "}
              <span className={active ? "text-gold" : "text-navy/30"}>
                ({count})
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-10">
        {applications.length === 0 ? (
          <p className="text-navy/60">{emptyMessageFor(filter)}</p>
        ) : (
          <ul className="space-y-4">
            {applications.map((a) => {
              const daysOld = Math.floor(
                (Date.now() - a.createdAt.getTime()) / (1000 * 60 * 60 * 24)
              );
              const isOpen = a.status === "PENDING" || a.status === "UNDER_REVIEW";
              const isStale = daysOld > 7 && isOpen;
              const railClass = isOpen ? "bg-gold" : "bg-navy/20";
              const motivationPreview =
                a.motivation.length > MOTIVATION_PREVIEW_CHARS
                  ? a.motivation.slice(0, MOTIVATION_PREVIEW_CHARS).trimEnd() + "…"
                  : a.motivation;

              return (
                <li key={a.id}>
                  <Link
                    href={`/admin/applications/${a.id}` as Route}
                    className="group flex gap-4 hover:bg-paper-light transition-colors"
                  >
                    <span
                      aria-hidden
                      className={`shrink-0 w-[3px] self-stretch ${railClass}`}
                    />

                    <div className="flex-1 min-w-0 py-3 pr-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-sans text-navy text-lg leading-tight">
                          {a.fullName}
                        </span>
                        <span
                          className={`eyebrow shrink-0 ${
                            isStale ? "!text-gold" : ""
                          }`}
                        >
                          {daysOld}d
                        </span>
                      </div>

                      <p className="mt-1 eyebrow truncate">
                        <span
                          className={`${
                            a.kind === "COMPANY" ? "!text-gold" : "!text-navy/50"
                          }`}
                        >
                          {a.kind === "COMPANY" ? t.kindCompany : t.kindPerson}
                        </span>
                        <span className="!text-navy/30"> · </span>
                        <span
                          className={`inline-flex items-center gap-1.5 ${
                            isOpen ? "!text-gold" : "!text-navy/50"
                          }`}
                        >
                          <span aria-hidden className="text-base leading-none">
                            {STATUS_SYMBOL[a.status] ?? "·"}
                          </span>
                          {t.status[a.status] ?? a.status}
                        </span>
                        <span className="!text-navy/30"> · </span>
                        <span className="!text-navy/70">{a.email}</span>
                        <span className="!text-navy/30"> · </span>
                        <span className="!text-navy/70">{a.country}</span>
                      </p>

                      <p className="mt-2 text-navy/75 text-sm leading-relaxed line-clamp-2 sm:line-clamp-1">
                        “{motivationPreview}”
                      </p>
                    </div>

                    <span className="self-center pr-3 eyebrow text-navy/30 group-hover:!text-gold transition-colors">
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
