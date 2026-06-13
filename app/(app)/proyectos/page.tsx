import Link from "next/link";
import type { Metadata, Route } from "next";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { sequentialPrisma } from "@/lib/prisma/safe";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format";
import { getDict, getLocale } from "@/lib/i18n";
import { ProjectFilters } from "./ProjectFilters";
import { ProjectTabs, type ProjectTab } from "./ProjectTabs";

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.metaTitles.proyectos };
}

// Orden de visualización para la lista (admin ve todos los estados).
const STATUS_RANK: Record<string, number> = {
  ACTIVE: 0,
  PENDING_APPROVAL: 1,
  SUSPENDED: 2,
  CLOSED: 3,
  DRAFT: 4,
  ARCHIVED: 5,
};

// Lista de proyectos — tabla de crecimiento. Sin paginación cada admin con 100+
// proyectos y sus participaciones tira un payload enorme cada visita.
const PAGE_SIZE = 30;

// Tab activo. Default "buscando" (proyectos con pool disponible) — es el caso
// de uso primario del discovery.
function parseTab(raw: string | undefined): ProjectTab {
  if (raw === "armados" || raw === "reventas") return raw;
  return "buscando";
}

// Reventas activas en el board: listings todavía comprables (no en validación
// tripartita, ni cerrados/cancelados). Mismo criterio que el board por proyecto.
const RESALE_ACTIVE_STATUSES = ["LISTED", "IN_CONVERSATION"] as const;

type SearchParams = {
  q?: string;
  page?: string;
  tab?: string;
};

type ProjectRow = Prisma.ProjectGetPayload<{
  include: {
    owner: { select: { fullName: true } };
    startupProfile: {
      select: {
        oneLiner: true;
        sector: true;
        stage: true;
        preMoneyValuation: true;
        valuationCurrency: true;
        targetRaiseAmount: true;
      };
    };
    participations: { select: { status: true; shareCount: true } };
  };
}>;

const resaleSelect = {
  id: true,
  status: true,
  createdAt: true,
  shareCount: true,
  proposedPricePerShare: true,
  seller: { select: { fullName: true, alias: true } },
  participation: { select: { shareCount: true } },
  project: {
    select: {
      name: true,
      slug: true,
      startupProfile: { select: { valuationCurrency: true } },
    },
  },
} satisfies Prisma.ResaleListingSelect;

type ResaleRow = Prisma.ResaleListingGetPayload<{ select: typeof resaleSelect }>;

export default async function ProjectsDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireSession();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.projectList;

  const q = (sp.q ?? "").trim();
  const tab = parseTab(sp.tab);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const tabsDict = {
    tabBuscando: t.tabBuscando,
    tabArmados: t.tabArmados,
    tabReventas: t.tabReventas,
  };

  const header = (
    <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
      <p className="eyebrow">{t.eyebrowMember}</p>
      <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy break-words">
        {t.title}
      </h1>
      {!isAdmin && (
        <p className="mt-3 text-navy/75 leading-relaxed">{t.intro}</p>
      )}
    </header>
  );

  // ── Tab "reventas": mercado secundario — listings activos de toda la
  // plataforma. Query separada sobre ResaleListing; no entra a la lista de
  // proyectos. La búsqueda por nombre filtra por nombre de proyecto.
  if (tab === "reventas") {
    // Respetar soft-delete Y suspensión del proyecto subyacente: solo
    // proyectos ACTIVE — un listing de un proyecto suspendido/cerrado
    // renderizaría una card cuyo click termina en 404.
    const resaleProjectWhere: Prisma.ProjectWhereInput = {
      deletedAt: null,
      status: "ACTIVE",
    };
    if (q) {
      resaleProjectWhere.name = { contains: q, mode: "insensitive" };
    }
    const resaleWhere: Prisma.ResaleListingWhereInput = {
      status: { in: [...RESALE_ACTIVE_STATUSES] },
      project: resaleProjectWhere,
    };

    const [listings, total] = await sequentialPrisma([
      {
        run: () =>
          prisma.resaleListing.findMany({
            where: resaleWhere,
            orderBy: { createdAt: "desc" },
            take: PAGE_SIZE,
            skip,
            select: resaleSelect,
          }),
        fallback: [] as ResaleRow[],
        tag: "proyectos:resales",
      },
      {
        run: () => prisma.resaleListing.count({ where: resaleWhere }),
        fallback: 0,
        tag: "proyectos:resales:total",
      },
    ] as const);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
      <div>
        {header}

        <div className="mt-4">
          <ProjectTabs active={tab} dict={tabsDict} />
        </div>

        <div className="mt-6">
          <ProjectFilters
            dict={{
              searchLabel: t.searchLabel,
              searchClear: t.searchClear,
              searchPlaceholder: t.searchPlaceholder,
            }}
          />
        </div>

        {listings.length === 0 ? (
          <p className="mt-6 text-navy/60">
            {q ? t.noneFiltered : t.emptyReventas}
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {listings.map((l) => {
              const listedShares = l.shareCount ?? l.participation.shareCount;
              const isPartial = listedShares < l.participation.shareCount;
              const sellerName = l.seller.alias ?? l.seller.fullName;
              const currency =
                l.project.startupProfile?.valuationCurrency ?? "USD";
              const priceNum = l.proposedPricePerShare
                ? Number(l.proposedPricePerShare)
                : null;
              return (
                <li key={l.id} className="hairline">
                  <Link
                    href={`/proyectos/${l.project.slug}/reventa` as Route}
                    className="block p-5 hover:bg-paper-light transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <h2 className="font-sans text-h2 text-navy break-words min-w-0">
                        {l.project.name}
                        {isPartial && (
                          <span className="ml-2 eyebrow !text-gold align-middle">
                            {t.resalePartial}
                          </span>
                        )}
                      </h2>
                      <span className="eyebrow shrink-0 !text-navy/40">
                        {formatDate(l.createdAt, locale)}
                      </span>
                    </div>

                    <p className="mt-1 eyebrow !text-navy/50">
                      {t.resaleBy}{" "}
                      <span className="!text-navy/80">{sellerName}</span>
                    </p>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-sm">
                      <div>
                        <p className="eyebrow !text-navy/40">
                          {t.resaleSharesLabel}
                        </p>
                        <p className="mt-0.5 text-navy">
                          {formatNumber(listedShares, undefined, locale)}
                        </p>
                      </div>
                      <div>
                        <p className="eyebrow !text-navy/40">
                          {t.resalePriceLabel}
                        </p>
                        <p className="mt-0.5 text-navy">
                          {priceNum !== null
                            ? formatCurrency(priceNum, currency, 2, locale)
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="eyebrow !text-navy/40">
                          {t.resaleTotalLabel}
                        </p>
                        <p className="mt-0.5 text-navy">
                          {priceNum !== null
                            ? formatCurrency(
                                priceNum * listedShares,
                                currency,
                                2,
                                locale
                              )
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between hairline-t pt-6">
            <ProjectsPageLink
              page={page - 1}
              disabled={page <= 1}
              q={q}
              tab={tab}
              label={dict.common.pagPrev}
            />
            <p className="eyebrow font-mono">
              {page} / {totalPages}
            </p>
            <ProjectsPageLink
              page={page + 1}
              disabled={page >= totalPages}
              q={q}
              tab={tab}
              label={dict.common.pagNext}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Tabs de proyectos ("buscando" / "armados") ──────────────────────────
  // Soft-delete: nunca mostramos proyectos eliminados, ni siquiera al admin
  // desde el discovery.
  const where: Prisma.ProjectWhereInput = { deletedAt: null };

  // El no-admin solo ve proyectos ACTIVE. El admin ve todos (excepto deleted)
  // EXCEPTO cuando filtra por categoría: "armados"/"buscando" son conceptos de
  // pool de participaciones que solo aplican a proyectos colocables, así que el
  // filtro de presencia de pool AVAILABLE acota de por sí a proyectos vivos.
  if (!isAdmin) {
    where.status = "ACTIVE";
  }

  if (q) {
    where.name = { contains: q, mode: "insensitive" };
  }

  // Filtro de categoría por presencia/ausencia de pool AVAILABLE con shares > 0.
  // - buscando: tiene al menos una participación AVAILABLE con shareCount > 0.
  // - armados:  no tiene ninguna participación AVAILABLE colocable (pool agotado
  //             o cerrado a nuevos participantes).
  const poolFilter: Prisma.ParticipationListRelationFilter =
    tab === "buscando"
      ? { some: { status: "AVAILABLE", shareCount: { gt: 0 } } }
      : { none: { status: "AVAILABLE", shareCount: { gt: 0 } } };
  where.participations = poolFilter;

  // include.participations sigue acá porque el badge "X/Y disponibles" y la
  // barra de fondeo lo necesitan; con PAGE_SIZE=30 el blast radius es acotado.
  const [projects, total, pendingCount] = await sequentialPrisma([
    {
      run: () =>
        prisma.project.findMany({
          where,
          orderBy: [{ approvedAt: "desc" }, { createdAt: "desc" }],
          take: PAGE_SIZE,
          skip,
          include: {
            owner: { select: { fullName: true } },
            startupProfile: {
              select: {
                oneLiner: true,
                sector: true,
                stage: true,
                preMoneyValuation: true,
                valuationCurrency: true,
                targetRaiseAmount: true,
              },
            },
            participations: { select: { status: true, shareCount: true } },
          },
        }),
      fallback: [] as ProjectRow[],
      tag: "proyectos:list",
    },
    {
      run: () => prisma.project.count({ where }),
      fallback: 0,
      tag: "proyectos:total",
    },
    {
      run: () =>
        isAdmin
          ? prisma.project.count({
              where: { ...where, status: "PENDING_APPROVAL" },
            })
          : Promise.resolve(0),
      fallback: 0,
      tag: "proyectos:pendingCount",
    },
  ] as const);

  // Para admin: ordenar la página actual por status según ranking definido.
  if (isAdmin) {
    projects.sort(
      (a, b) => (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99)
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(q);

  // Estado vacío específico por tab (con o sin búsqueda).
  const emptyMessage = hasFilters
    ? t.noneFiltered
    : tab === "buscando"
      ? t.emptyBuscando
      : t.emptyArmados;

  return (
    <div>
      {header}

      {isAdmin && pendingCount > 0 && (
        <p className="-mt-2 mb-1 font-mono text-sm text-navy/75">
          {pendingCount}{" "}
          {pendingCount === 1 ? t.pendingApprovalSingular : t.pendingApproval}
        </p>
      )}

      <div className="mt-4">
        <ProjectTabs active={tab} dict={tabsDict} />
      </div>

      <div className="mt-6">
        <ProjectFilters
          dict={{
            searchLabel: t.searchLabel,
            searchClear: t.searchClear,
            searchPlaceholder: t.searchPlaceholder,
          }}
        />
      </div>

      {projects.length === 0 ? (
        <p className="mt-6 text-navy/60">{emptyMessage}</p>
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
            const fundedPct =
              total > 0
                ? Math.min(100, Math.max(0, ((total - available) / total) * 100))
                : 0;

            return (
              <li key={p.id} className="hairline-b">
                <Link
                  href={`/proyectos/${p.slug}` as Route}
                  className="group grid grid-cols-12 items-baseline gap-x-4 gap-y-2 px-2 py-4 hover:bg-paper-light transition-colors"
                >
                  <div className="col-span-12 sm:col-span-4 min-w-0">
                    <p className="eyebrow">
                      {p.startupProfile?.sector ?? p.kind}
                      {p.startupProfile?.stage &&
                        ` · ${t.stage[p.startupProfile.stage] ?? p.startupProfile.stage}`}
                      {isAdmin && p.status !== "ACTIVE" && (
                        <span
                          className={isPending ? "!text-gold" : "!text-navy/50"}
                        >
                          {" · "}
                          {t.status[p.status] ?? p.status}
                        </span>
                      )}
                    </p>
                    <h2
                      className={`font-sans mt-1 text-h2 break-words ${
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

                  <div className="col-span-4 sm:col-span-2">
                    <p className="eyebrow !text-navy/40">{t.colValuation}</p>
                    <p className="mt-0.5 font-mono text-sm text-navy">
                      {p.startupProfile?.preMoneyValuation
                        ? formatCurrency(
                            Number(p.startupProfile.preMoneyValuation),
                            p.startupProfile.valuationCurrency,
                            0,
                            locale
                          )
                        : "—"}
                    </p>
                  </div>

                  {/* Monto a levantar — declarado por el founder al cargar
                      el proyecto. Sirve para que el miembro dimensione el
                      tamaño de la ronda antes de entrar a la ficha. */}
                  <div className="col-span-4 sm:col-span-2">
                    <p className="eyebrow !text-navy/40">{t.colTargetRaise}</p>
                    <p className="mt-0.5 font-mono text-sm text-navy">
                      {p.startupProfile?.targetRaiseAmount
                        ? formatCurrency(
                            Number(p.startupProfile.targetRaiseAmount),
                            p.startupProfile.valuationCurrency,
                            0,
                            locale
                          )
                        : "—"}
                    </p>
                  </div>

                  <div className="col-span-4 sm:col-span-2">
                    <p className="eyebrow !text-navy/40">{t.colAvailable}</p>
                    <p className="mt-0.5 font-mono text-sm text-navy">
                      {formatNumber(available, undefined, locale)}{" "}
                      <span className="eyebrow !text-navy/40">
                        {t.of} {formatNumber(total, undefined, locale)}
                      </span>
                    </p>
                  </div>

                  <div className="col-span-12 sm:col-span-2 self-center sm:flex sm:justify-end">
                    {isPending ? (
                      <span className="eyebrow !text-gold">{t.review}</span>
                    ) : (
                      <span className="btn-outline !px-4 !py-2 !text-xs whitespace-nowrap shrink-0 group-hover:border-gold group-hover:!text-gold transition-colors">
                        {t.exploreBtn}
                        <span aria-hidden>→</span>
                      </span>
                    )}
                  </div>

                  {/* Barra de fondeo: % de acciones ya colocadas */}
                  <div className="col-span-12 mt-1">
                    <div className="h-1 w-full bg-line">
                      <div
                        className="h-full bg-navy"
                        style={{ width: `${fundedPct}%` }}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between hairline-t pt-6">
          <ProjectsPageLink
            page={page - 1}
            disabled={page <= 1}
            q={q}
            tab={tab}
            label={dict.common.pagPrev}
          />
          <p className="eyebrow font-mono">
            {page} / {totalPages}
          </p>
          <ProjectsPageLink
            page={page + 1}
            disabled={page >= totalPages}
            q={q}
            tab={tab}
            label={dict.common.pagNext}
          />
        </div>
      )}
    </div>
  );
}

function ProjectsPageLink({
  page,
  disabled,
  q,
  tab,
  label,
}: {
  page: number;
  disabled: boolean;
  q: string;
  tab: ProjectTab;
  label: string;
}) {
  if (disabled) {
    return <span className="eyebrow !text-navy/30">{label}</span>;
  }
  const params = new URLSearchParams();
  if (tab !== "buscando") params.set("tab", tab);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return (
    <Link
      href={(qs ? `/proyectos?${qs}` : "/proyectos") as Route}
      className="eyebrow hover:!text-gold"
    >
      {label}
    </Link>
  );
}
