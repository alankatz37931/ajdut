import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { sequentialPrisma } from "@/lib/prisma/safe";
import { getDict, getLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/format";
import { SYMBOL } from "@/lib/utils/status-symbols";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { LeadActions } from "./LeadActions";
import { InfoRequestActions } from "./InfoRequestActions";

const founderLeadsInclude = {
  user: { select: { id: true, fullName: true, email: true } },
  pendingAssignments: {
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true, shareCount: true, createdAt: true },
  },
} satisfies Prisma.LeadInclude;

type FounderLeadRow = Prisma.LeadGetPayload<{ include: typeof founderLeadsInclude }>;

const founderInfoRequestInclude = {
  requester: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.InfoRequestInclude;

type FounderInfoRequestRow = Prisma.InfoRequestGetPayload<{
  include: typeof founderInfoRequestInclude;
}>;

type Params = { params: Promise<{ projectSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { projectSlug } = await params;
  const dict = await getDict();
  const project = await prisma.project
    .findUnique({ where: { slug: projectSlug }, select: { name: true } })
    .catch(() => null);
  return {
    title: project
      ? `Leads · ${project.name} · AJDUT`
      : dict.metaTitles.founderLeadsFallback,
  };
}

// Paleta canónica en `@/lib/utils/status-symbols`.
const STATUS_SYMBOL: Record<string, string> = {
  OPEN: SYMBOL.open,
  CONTACTED: SYMBOL.half,
  INTERVIEWING: SYMBOL.thrq,
  CONVERTED: SYMBOL.done,
  DISMISSED: SYMBOL.reject,
  EXPIRED: SYMBOL.expire,
};

export default async function FounderLeadsPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.founderLeads;
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: {
        select: { preMoneyValuation: true, valuationCurrency: true },
      },
    },
  });
  // Soft-delete: un proyecto eliminado ya no existe para el founder — la
  // fuente de verdad es deletedAt (mismo patrón que el dashboard).
  if (!project || project.deletedAt) notFound();
  if (project.ownerId !== user.id) notFound();

  const [leads, infoRequests] = await sequentialPrisma([
    {
      run: () =>
        prisma.lead.findMany({
          where: { projectId: project.id },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          include: founderLeadsInclude,
        }),
      fallback: [] as FounderLeadRow[],
      tag: "founderLeads:leads",
    },
    {
      run: () =>
        prisma.infoRequest.findMany({
          where: { projectId: project.id, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          include: founderInfoRequestInclude,
        }),
      fallback: [] as FounderInfoRequestRow[],
      tag: "founderLeads:infoRequests",
    },
  ] as const);

  const valuation = project.startupProfile?.preMoneyValuation
    ? Number(project.startupProfile.preMoneyValuation)
    : null;
  const currency = project.startupProfile?.valuationCurrency ?? "USD";
  const pricePerShare =
    valuation && project.totalShares > 0 ? valuation / project.totalShares : null;

  function fmtMoney(amt: number) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amt);
  }
  function fmtInt(n: number): string {
    return n.toLocaleString(locale);
  }

  const openCount = leads.filter((l) => l.status === "OPEN").length;
  const contactedCount = leads.filter((l) => l.status === "CONTACTED").length;
  const resolvedCount = leads.filter((l) =>
    ["CONVERTED", "DISMISSED", "EXPIRED"].includes(l.status),
  ).length;

  return (
    <div>
      <ProjectHeader
        projectName={project.name}
        projectSlug={project.slug}
        projectStatus={project.status}
        section={t.section}
        description={t.description}
      />

      {/* ─── Banda de stats compacta ───────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-px bg-line">
        <LeadStat
          label={t.statRequests}
          value={infoRequests.length}
          urgent={infoRequests.length > 0}
          hint={t.statRequestsHint}
        />
        <LeadStat
          label={t.statOpen}
          value={openCount}
          urgent={openCount > 0}
          hint={t.statOpenHint}
        />
        <LeadStat
          label={t.statInConv}
          value={contactedCount}
          hint={t.statInConvHint}
        />
        <LeadStat
          label={t.statResolved}
          value={resolvedCount}
          hint={t.statResolvedHint}
        />
      </div>

      {/* ─── Solicitudes de información (etapa 1) ──────────────────── */}
      {infoRequests.length > 0 && (
        <section className="mt-12">
          <div className="hairline-b pb-3 mb-6 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="eyebrow !text-navy">
              {t.infoSectionFmt.replace("{n}", String(infoRequests.length))}
            </p>
            <p className="eyebrow !text-navy/40">{t.infoStageNote}</p>
          </div>

          <ul className="space-y-4">
            {infoRequests.map((r) => {
              const daysAgo = Math.floor(
                (Date.now() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24),
              );
              return (
                <li key={r.id} className="flex gap-4">
                  <span aria-hidden className="shrink-0 w-[3px] self-stretch bg-gold/70" />
                  <div className="flex-1 min-w-0 py-3 pr-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-sans text-navy text-lg leading-tight min-w-0 break-words">
                        {r.requester.fullName}
                      </span>
                      <span className="eyebrow shrink-0">{daysAgo}d</span>
                    </div>
                    <p className="mt-1 eyebrow truncate">
                      <span className="!text-navy/70">{r.requester.email}</span>
                    </p>
                    {(r.message ?? "").trim().length > 0 && (
                      <p className="mt-3 text-navy/75 text-sm leading-relaxed whitespace-pre-line">
                        “{r.message}”
                      </p>
                    )}
                    <div className="mt-4">
                      <InfoRequestActions
                        infoRequestId={r.id}
                        dict={t.infoActions}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ─── Leads (etapa 2 — interés concreto) ────────────────────── */}
      <section className="mt-12">
        <div className="hairline-b pb-3 mb-6 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="eyebrow !text-navy">
            {leads.length > 0
              ? (infoRequests.length > 0
                  ? t.leadsSectionStartFmt
                  : t.leadsSectionAloneFmt
                ).replace("{n}", String(leads.length))
              : t.leadsSectionAlone}
          </p>
          {leads.length > 0 && (
            <p className="eyebrow !text-navy/40">{t.leadsStageNote}</p>
          )}
        </div>

        {leads.length === 0 ? (
          <p className="text-navy/60">{t.emptyLeads}</p>
        ) : (
          <ul className="space-y-4">
            {leads.map((l) => {
              const isOpen = l.status === "OPEN";
              const isCool = l.status === "CONTACTED";
              const isClosed = ["CONVERTED", "DISMISSED", "EXPIRED"].includes(l.status);
              const railClass = isOpen ? "bg-gold" : isCool ? "bg-navy/60" : "bg-navy/20";
              const daysAgo = Math.floor(
                (Date.now() - l.createdAt.getTime()) / (1000 * 60 * 60 * 24),
              );
              const amount = pricePerShare
                ? l.shareCountRequested * pricePerShare
                : null;

              return (
                <li key={l.id} className="flex gap-4">
                  <span
                    aria-hidden
                    className={`shrink-0 w-[3px] self-stretch ${railClass}`}
                  />
                  <div className="flex-1 min-w-0 py-3 pr-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-sans text-navy text-lg leading-tight min-w-0 break-words">
                        {l.user.fullName}
                      </span>
                      <span className="eyebrow shrink-0">{daysAgo}d</span>
                    </div>

                    <p className="mt-1 eyebrow truncate">
                      <span
                        className={`inline-flex items-center gap-1.5 ${
                          isOpen ? "!text-gold" : isCool ? "!text-navy/70" : "!text-navy/50"
                        }`}
                      >
                        <span aria-hidden className="text-base leading-none">
                          {STATUS_SYMBOL[l.status] ?? "·"}
                        </span>
                        {t.status[l.status] ?? l.status}
                      </span>
                      {l.supportKind && (
                        <>
                          <span className="!text-navy/30"> · </span>
                          <span className="!text-navy">
                            {t.supportKind[l.supportKind] ?? l.supportKind}
                          </span>
                        </>
                      )}
                      <span className="!text-navy/30"> · </span>
                      <span className="!text-navy/70">{l.user.email}</span>
                    </p>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-sm">
                      <div>
                        <p className="eyebrow !text-navy/40">{t.colShares}</p>
                        <p className="mt-1 text-navy">{fmtInt(l.shareCountRequested)}</p>
                      </div>
                      {amount !== null && (
                        <div>
                          <p className="eyebrow !text-navy/40">{t.colEquivalent}</p>
                          <p className="mt-1 text-navy">{fmtMoney(amount)}</p>
                        </div>
                      )}
                      <div>
                        <p className="eyebrow !text-navy/40">{t.colReceived}</p>
                        <p className="mt-1 text-navy">{formatDate(l.createdAt, locale)}</p>
                      </div>
                    </div>

                    {l.message.trim().length > 0 && (
                      <p className="mt-3 text-navy/75 text-sm leading-relaxed whitespace-pre-line">
                        “{l.message}”
                      </p>
                    )}

                    {!isClosed && l.pendingAssignments[0] && (
                      <div className="mt-4 hairline p-3 bg-paper-light">
                        <p className="eyebrow !text-gold">
                          {t.proposalPendingEyebrow}
                        </p>
                        <p className="mt-2 text-sm text-navy/75">
                          {t.proposalPendingBodyFmt.replace(
                            "{n}",
                            fmtInt(l.pendingAssignments[0].shareCount)
                          )}
                        </p>
                      </div>
                    )}

                    {!isClosed && l.pendingAssignments.length === 0 && (
                      <div className="mt-4">
                        <LeadActions
                          leadId={l.id}
                          status={l.status}
                          shareCountRequested={l.shareCountRequested}
                          investorName={l.user.fullName}
                          dict={t.actions}
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
      </section>
    </div>
  );
}

function LeadStat({
  label,
  value,
  hint,
  urgent,
}: {
  label: string;
  value: number;
  hint?: string;
  urgent?: boolean;
}) {
  return (
    <div className="bg-paper p-5">
      <p className="eyebrow">{label}</p>
      <p
        className={`mt-3 font-mono text-kpi leading-none ${
          urgent && value > 0 ? "text-gold" : "text-navy"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-2 eyebrow !text-navy/50">{hint}</p>}
    </div>
  );
}
