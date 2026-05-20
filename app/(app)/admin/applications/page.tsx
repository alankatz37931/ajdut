import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

const FILTER_LABEL: Record<string, string> = {
  all: "Todas",
  pending: "Pendientes",
  resolved: "Resueltas",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  // UNDER_REVIEW se conserva en el enum por compatibilidad, pero ya no se usa.
  UNDER_REVIEW: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};

// Símbolos geométricos para cada estado
const STATUS_SYMBOL: Record<string, string> = {
  PENDING: "○",
  UNDER_REVIEW: "○",
  APPROVED: "●",
  REJECTED: "✕",
};

const MOTIVATION_PREVIEW_CHARS = 140;

export default async function ApplicationsListPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const sp = await searchParams;
  const filter = sp.filter ?? "pending";

  const where =
    filter === "all"
      ? {}
      : filter === "resolved"
      ? { status: { in: ["APPROVED" as const, "REJECTED" as const] } }
      : { status: { in: ["PENDING" as const, "UNDER_REVIEW" as const] } };

  const [applications, allCount, pendingCount, resolvedCount] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.application.count(),
    prisma.application.count({
      where: { status: { in: ["PENDING" as const, "UNDER_REVIEW" as const] } },
    }),
    prisma.application.count({
      where: { status: { in: ["APPROVED" as const, "REJECTED" as const] } },
    }),
  ]);

  const countsByFilter: Record<string, number> = {
    all: allCount,
    pending: pendingCount,
    resolved: resolvedCount,
  };

  const summaryParts: string[] = [];
  if (pendingCount > 0) {
    summaryParts.push(`${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}`);
  }
  if (resolvedCount > 0) {
    summaryParts.push(
      `${resolvedCount} resuelta${resolvedCount === 1 ? "" : "s"}`
    );
  }

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Admin</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Aplicaciones</h1>
        {summaryParts.length > 0 ? (
          <p className="mt-3 font-mono text-sm text-navy/75">
            {summaryParts.join(" · ")}
          </p>
        ) : (
          <p className="mt-3 font-mono text-sm text-navy/60">Bandeja al día.</p>
        )}
      </header>

      <nav className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        {Object.entries(FILTER_LABEL).map(([key, label]) => {
          const active = filter === key;
          const count = countsByFilter[key] ?? 0;
          return (
            <Link
              key={key}
              href={{ pathname: "/admin/applications", query: { filter: key } }}
              className={`eyebrow whitespace-nowrap transition-colors ${
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
                    {/* Rail vertical: oro si abierta, navy/20 si resuelta */}
                    <span
                      aria-hidden
                      className={`shrink-0 w-[3px] self-stretch ${railClass}`}
                    />

                    <div className="flex-1 min-w-0 py-3 pr-2">
                      {/* Línea 1: nombre + tiempo a la derecha */}
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

                      {/* Línea 2: tipo + status + email + país.
                          El tipo (Empresa / Persona) va al inicio en gold para
                          que sea identificable de un vistazo en la bandeja. */}
                      <p className="mt-1 eyebrow truncate">
                        <span
                          className={`${
                            a.kind === "COMPANY" ? "!text-gold" : "!text-navy/50"
                          }`}
                        >
                          {a.kind === "COMPANY" ? "Empresa" : "Persona"}
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
                          {STATUS_LABEL[a.status] ?? a.status}
                        </span>
                        <span className="!text-navy/30"> · </span>
                        <span className="!text-navy/70">{a.email}</span>
                        <span className="!text-navy/30"> · </span>
                        <span className="!text-navy/70">{a.country}</span>
                      </p>

                      {/* Línea 3: preview de motivación */}
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

function emptyMessageFor(filter: string): string {
  switch (filter) {
    case "all":
      return "Aún no llegaron aplicaciones a AJDUT.";
    case "resolved":
      return "Aún no resolviste aplicaciones.";
    case "pending":
    default:
      return "Bandeja al día — no hay aplicaciones pendientes.";
  }
}
