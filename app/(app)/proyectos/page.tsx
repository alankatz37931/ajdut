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

// Símbolo geométrico para cada estado (lenguaje de planos técnicos)
const STATUS_SYMBOL: Record<string, string> = {
  ACTIVE: "●",
  PENDING_APPROVAL: "○",
  SUSPENDED: "◐",
  CLOSED: "◇",
  DRAFT: "◇",
  ARCHIVED: "▪",
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

  const activeCount = projects.filter((p) => p.status === "ACTIVE").length;
  const pendingCount = projects.filter((p) => p.status === "PENDING_APPROVAL").length;
  const hasFilters = Boolean(q);

  return (
    <div>
      <header className="hairline-b pb-8">
        <h1 className="font-sans text-h1 text-navy">Proyectos</h1>
        {isAdmin ? (
          <p className="mt-3 font-mono text-sm text-navy/75">
            {activeCount} {activeCount === 1 ? "activo" : "activos"}
            {pendingCount > 0 && ` · ${pendingCount} pendiente${pendingCount === 1 ? "" : "s"} de aprobación`}
          </p>
        ) : (
          <p className="mt-3 max-w-2xl text-navy/75 leading-relaxed">
            Todos los proyectos en AJDUT son aprobados manualmente. Si te interesa una idea y los
            números cierran para vos, podés manifestar tu interés en comprar acciones desde la
            página del proyecto.
          </p>
        )}
      </header>

      <div className="mt-8">
        <ProjectFilters />
      </div>

      {projects.length === 0 ? (
        <p className="mt-12 text-navy/60">
          {hasFilters
            ? "Ningún proyecto coincide con los filtros aplicados."
            : isAdmin
              ? "Aún no hay proyectos creados en AJDUT."
              : "Aún no hay proyectos activos en AJDUT."}
        </p>
      ) : (
        <ul className="mt-12 grid grid-cols-1 gap-px bg-line md:grid-cols-2">
          {projects.map((p) => {
            const total = p.totalShares;
            const available = p.participations
              .filter((x) => x.status === "AVAILABLE")
              .reduce((s, x) => s + x.shareCount, 0);
            const isPending = p.status === "PENDING_APPROVAL";
            const isInactive =
              p.status !== "ACTIVE" && p.status !== "PENDING_APPROVAL";

            return (
              <li key={p.id} className="bg-paper">
                <Link
                  href={`/proyectos/${p.slug}` as Route}
                  className="relative block p-6 hover:bg-paper-light transition-colors h-full after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-gold after:scale-x-0 after:origin-left after:transition-transform hover:after:scale-x-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="eyebrow min-w-0">
                      {p.startupProfile?.sector ?? p.kind}
                      {p.startupProfile?.stage &&
                        ` · ${STAGE_LABEL[p.startupProfile.stage]}`}
                    </p>
                    {isAdmin && p.status !== "ACTIVE" && (
                      <span
                        className={`eyebrow shrink-0 inline-flex items-center gap-1.5 ${
                          isPending ? "!text-gold" : "!text-navy/50"
                        }`}
                      >
                        <span aria-hidden className="text-base leading-none">
                          {STATUS_SYMBOL[p.status] ?? "·"}
                        </span>
                        {STATUS_LABEL[p.status]}
                      </span>
                    )}
                  </div>

                  <h2
                    className={`font-sans mt-3 text-h2 ${
                      isInactive ? "text-navy/60" : "text-navy"
                    }`}
                  >
                    {p.name}
                  </h2>
                  {p.startupProfile?.oneLiner && (
                    <p className="mt-3 text-navy/80 leading-relaxed">
                      “{p.startupProfile.oneLiner}”
                    </p>
                  )}
                  <p className="mt-3 eyebrow">Founder: {p.owner.fullName}</p>

                  <div className="mt-6 grid grid-cols-2 gap-4 hairline-t pt-4">
                    <div>
                      <p className="eyebrow">Valoración</p>
                      <p className="mt-1 font-mono text-navy">
                        {p.startupProfile?.preMoneyValuation
                          ? formatCurrency(
                              Number(p.startupProfile.preMoneyValuation),
                              p.startupProfile.valuationCurrency
                            )
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="eyebrow">Disponibles</p>
                      <p className="mt-1 font-mono text-navy">
                        {formatNumber(available)}{" "}
                        <span className="eyebrow">
                          {formatPercent((available / total) * 100)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <p className="mt-6 eyebrow !text-gold">
                    {isPending ? "Revisar →" : "Ver detalle →"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
