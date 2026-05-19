import Link from "next/link";
import type { Route } from "next";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { ProjectFilters } from "./ProjectFilters";

const STAGE_LABEL: Record<string, string> = {
  IDEA: "Idea",
  PRE_SEED: "Pre-seed",
  SEED: "Seed",
  EARLY_REVENUE: "Early revenue",
  GROWTH: "Growth",
  SCALE: "Scale",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING_APPROVAL: "Pendiente",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
  CLOSED: "Cerrado",
  ARCHIVED: "Archivado",
};

// Orden de visualización para la lista (admin ve todos los estados).
const STATUS_RANK: Record<string, number> = {
  ACTIVE: 0,
  PENDING_APPROVAL: 1,
  SUSPENDED: 2,
  CLOSED: 3,
  DRAFT: 4,
  ARCHIVED: 5,
};

type SearchParams = {
  q?: string;
};

export default async function ProjectsDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireSession();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();

  const where: Prisma.ProjectWhereInput = {};

  // El no-admin solo ve proyectos ACTIVE. El admin ve todos.
  if (!isAdmin) {
    where.status = "ACTIVE";
  }

  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }

  const projects = await prisma.project.findMany({
    where,
    orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
    include: {
      owner: { select: { fullName: true } },
      startupProfile: {
        select: {
          oneLiner: true,
          sector: true,
          stage: true,
          preMoneyValuation: true,
          valuationCurrency: true,
        },
      },
      participations: { select: { status: true, shareCount: true } },
    },
  });

  // Para admin: ordenar por status según ranking definido
  if (isAdmin) {
    projects.sort(
      (a, b) =>
        (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)
    );
  }

  const pendingCount = projects.filter((p) => p.status === "PENDING_APPROVAL").length;
  const hasFilters = Boolean(q);

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— AJDUT</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Proyectos</h1>
        {isAdmin ? (
          pendingCount > 0 && (
            <p className="mt-3 font-mono text-sm text-navy/75">
              {pendingCount} pendiente{pendingCount === 1 ? "" : "s"} de aprobación
            </p>
          )
        ) : (
          <p className="mt-3 max-w-2xl text-navy/75 leading-relaxed">
            Todos los proyectos en AJDUT son aprobados manualmente. Si te interesa una idea y los
            números cierran para vos, podés manifestar tu interés en comprar acciones desde la
            página del proyecto.
          </p>
        )}
      </header>

      <div className="mt-2">
        <ProjectFilters />
      </div>

      {projects.length === 0 ? (
        <p className="mt-6 text-navy/60">
          {hasFilters
            ? "Ningún proyecto coincide con los filtros aplicados."
            : isAdmin
              ? "Aún no hay proyectos creados en AJDUT."
              : "Aún no hay proyectos activos en AJDUT."}
        </p>
      ) : (
        <ul className="mt-6 hairline-t">
          {projects.map((p) => {
            const total = p.totalShares;
            const available = p.participations
              .filter((x) => x.status === "AVAILABLE")
              .reduce((s, x) => s + x.shareCount, 0);
            const isPending = p.status === "PENDING_APPROVAL";
            const isInactive =
              p.status !== "ACTIVE" && p.status !== "PENDING_APPROVAL";

            return (
              <li key={p.id} className="hairline-b">
                <Link
                  href={`/proyectos/${p.slug}` as Route}
                  className="group grid grid-cols-12 items-baseline gap-x-4 gap-y-2 px-2 py-4 hover:bg-paper-light transition-colors"
                >
                  <div className="col-span-12 sm:col-span-6 min-w-0">
                    <p className="eyebrow">
                      {p.startupProfile?.sector ?? p.kind}
                      {p.startupProfile?.stage &&
                        ` · ${STAGE_LABEL[p.startupProfile.stage]}`}
                      {isAdmin && p.status !== "ACTIVE" && (
                        <span
                          className={isPending ? "!text-gold" : "!text-navy/50"}
                        >
                          {" · "}
                          {STATUS_LABEL[p.status]}
                        </span>
                      )}
                    </p>
                    <h2
                      className={`font-sans mt-1 text-h2 ${
                        isInactive ? "text-navy/60" : "text-navy"
                      }`}
                    >
                      {p.name}
                    </h2>
                    {p.startupProfile?.oneLiner && (
                      <p className="mt-1 text-sm text-navy/70 leading-snug">
                        “{p.startupProfile.oneLiner}” ·{" "}
                        <span className="!text-navy/50">
                          {p.owner.fullName}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="col-span-5 sm:col-span-3">
                    <p className="eyebrow !text-navy/40">Valoración</p>
                    <p className="mt-0.5 font-mono text-sm text-navy">
                      {p.startupProfile?.preMoneyValuation
                        ? formatCurrency(
                            Number(p.startupProfile.preMoneyValuation),
                            p.startupProfile.valuationCurrency,
                            0
                          )
                        : "—"}
                    </p>
                  </div>

                  <div className="col-span-5 sm:col-span-2">
                    <p className="eyebrow !text-navy/40">Disponibles</p>
                    <p className="mt-0.5 font-mono text-sm text-navy">
                      {formatNumber(available)}{" "}
                      <span className="eyebrow !text-navy/40">
                        {formatPercent((available / total) * 100)}
                      </span>
                    </p>
                  </div>

                  <div className="col-span-2 sm:col-span-1 self-center text-right">
                    <span className="eyebrow !text-gold">
                      {isPending ? "Revisar →" : "→"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
