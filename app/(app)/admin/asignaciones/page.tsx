import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/format";
import { PendingAssignmentActions } from "./PendingAssignmentActions";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.adminAsignaciones };
}

const FILTER_LABEL: Record<string, string> = {
  pending: "Pendientes",
  approved: "Aprobadas",
  rejected: "Rechazadas",
  all: "Todas",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
};

const STATUS_SYMBOL: Record<string, string> = {
  PENDING: "○",
  APPROVED: "●",
  REJECTED: "✕",
};

const SOURCE_LABEL: Record<string, string> = {
  LEAD: "Lead aceptado",
  INVITE: "Invitación directa",
};

function fmtInt(n: number): string {
  return n.toLocaleString("es-MX");
}

export default async function AdminPendingAssignmentsPage({
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
      : filter === "approved"
      ? { status: "APPROVED" as const }
      : filter === "rejected"
      ? { status: "REJECTED" as const }
      : { status: "PENDING" as const };

  const [items, pendingCount, approvedCount, rejectedCount, allCount] =
    await Promise.all([
      prisma.pendingAssignment.findMany({
        where,
        orderBy:
          filter === "pending"
            ? { createdAt: "asc" }
            : { createdAt: "desc" },
        take: 100,
        include: {
          project: { select: { name: true, slug: true } },
          proposedBy: {
            select: { fullName: true, alias: true, email: true },
          },
          targetUser: {
            select: { fullName: true, alias: true, email: true },
          },
          reviewedBy: { select: { fullName: true, alias: true } },
        },
      }),
      prisma.pendingAssignment.count({ where: { status: "PENDING" } }),
      prisma.pendingAssignment.count({ where: { status: "APPROVED" } }),
      prisma.pendingAssignment.count({ where: { status: "REJECTED" } }),
      prisma.pendingAssignment.count(),
    ]);

  const countsByFilter: Record<string, number> = {
    pending: pendingCount,
    approved: approvedCount,
    rejected: rejectedCount,
    all: allCount,
  };

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Admin</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">
          Asignaciones pendientes
        </h1>
        <p className="mt-3 font-mono text-sm text-navy/75">
          {pendingCount === 0
            ? "Bandeja al día."
            : `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"} de validar.`}
        </p>
      </header>

      <nav className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
        {(["pending", "approved", "rejected", "all"] as const).map((key) => {
          const active = filter === key;
          const count = countsByFilter[key] ?? 0;
          return (
            <Link
              key={key}
              href={{
                pathname: "/admin/asignaciones",
                query: { filter: key },
              }}
              className={`eyebrow whitespace-nowrap transition-colors ${
                active ? "!text-navy" : "!text-navy/40 hover:!text-navy"
              }`}
            >
              {FILTER_LABEL[key]}{" "}
              <span className={active ? "text-gold" : "text-navy/30"}>
                ({count})
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-10">
        {items.length === 0 ? (
          <p className="text-navy/60">{emptyMessageFor(filter)}</p>
        ) : (
          <ul className="space-y-6">
            {items.map((p) => {
              const proposerName =
                p.proposedBy.alias ?? p.proposedBy.fullName;
              const targetName = p.targetUser
                ? p.targetUser.alias ?? p.targetUser.fullName
                : p.inviteFullName ?? "(sin nombre)";
              const targetEmail = p.targetUser
                ? p.targetUser.email
                : p.inviteEmail ?? "(sin email)";
              const recipientLabel = `${targetName} · ${targetEmail}`;

              const isOpen = p.status === "PENDING";
              const railClass =
                p.status === "PENDING"
                  ? "bg-gold"
                  : p.status === "APPROVED"
                  ? "bg-navy/60"
                  : "bg-navy/20";

              return (
                <li key={p.id} className="flex gap-4">
                  <span
                    aria-hidden
                    className={`shrink-0 w-[3px] self-stretch ${railClass}`}
                  />
                  <div className="flex-1 min-w-0 py-2 pr-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <Link
                        href={`/proyectos/${p.project.slug}` as Route}
                        className="font-sans text-navy text-lg leading-tight hover:!text-gold"
                      >
                        {p.project.name}
                      </Link>
                      <p className="eyebrow shrink-0 !text-navy/40">
                        {formatDate(p.createdAt)}
                      </p>
                    </div>

                    <p className="mt-1 eyebrow truncate">
                      <span className="!text-navy/50">
                        {SOURCE_LABEL[p.source] ?? p.source}
                      </span>
                      <span className="!text-navy/30"> · </span>
                      <span
                        className={`inline-flex items-center gap-1.5 ${
                          isOpen ? "!text-gold" : "!text-navy/50"
                        }`}
                      >
                        <span aria-hidden className="text-base leading-none">
                          {STATUS_SYMBOL[p.status] ?? "·"}
                        </span>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </p>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-sm">
                      <div className="sm:col-span-1">
                        <p className="eyebrow !text-navy/40">Project owner</p>
                        <p className="mt-1 text-navy">{proposerName}</p>
                        <p className="text-navy/60 text-xs">
                          {p.proposedBy.email}
                        </p>
                      </div>
                      <div className="sm:col-span-1">
                        <p className="eyebrow !text-navy/40">Destinatario</p>
                        <p className="mt-1 text-navy">{targetName}</p>
                        <p className="text-navy/60 text-xs">{targetEmail}</p>
                        {!p.targetUser && p.source === "INVITE" && (
                          <p className="eyebrow !text-gold mt-1">
                            Usuario nuevo
                          </p>
                        )}
                      </div>
                      <div className="sm:col-span-1">
                        <p className="eyebrow !text-navy/40">Acciones</p>
                        <p className="mt-1 text-navy">{fmtInt(p.shareCount)}</p>
                      </div>
                    </div>

                    {p.inviteMessage && p.inviteMessage.trim().length > 0 && (
                      <p className="mt-3 text-navy/75 text-sm leading-relaxed whitespace-pre-line">
                        “{p.inviteMessage}”
                      </p>
                    )}
                    {p.reason && p.reason.trim().length > 0 && !p.inviteMessage && (
                      <p className="mt-3 text-navy/75 text-sm leading-relaxed">
                        {p.reason}
                      </p>
                    )}

                    {p.status === "REJECTED" && p.reviewNote && (
                      <div className="mt-3">
                        <p className="eyebrow !text-navy/40">
                          Nota del revisor
                        </p>
                        <p className="mt-1 text-sm text-navy/85 whitespace-pre-line">
                          {p.reviewNote}
                        </p>
                      </div>
                    )}

                    {p.status !== "PENDING" && p.reviewedBy && p.reviewedAt && (
                      <p className="mt-3 eyebrow !text-navy/40">
                        {p.status === "APPROVED" ? "Aprobada por" : "Rechazada por"}{" "}
                        {p.reviewedBy.alias ?? p.reviewedBy.fullName} ·{" "}
                        {formatDate(p.reviewedAt)}
                      </p>
                    )}

                    {p.status === "PENDING" && (
                      <div className="mt-4">
                        <PendingAssignmentActions
                          pendingId={p.id}
                          recipientLabel={recipientLabel}
                          shareCount={p.shareCount}
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

function emptyMessageFor(filter: string): string {
  switch (filter) {
    case "approved":
      return "Aún no aprobaste ninguna asignación.";
    case "rejected":
      return "Aún no rechazaste ninguna asignación.";
    case "all":
      return "Todavía no hay propuestas de asignación.";
    case "pending":
    default:
      return "Bandeja al día — no hay asignaciones pendientes.";
  }
}
