import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { formatDate } from "@/lib/utils/format";
import { ProjectHeader } from "@/components/founder/ProjectHeader";
import { LeadActions } from "./LeadActions";
import { InfoRequestActions } from "./InfoRequestActions";

type Params = { params: Promise<{ projectSlug: string }> };

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Sin contactar",
  CONTACTED: "Contactado",
  INTERVIEWING: "En entrevista",
  CONVERTED: "Convertido",
  DISMISSED: "Descartado",
  EXPIRED: "Expirado",
};

const STATUS_SYMBOL: Record<string, string> = {
  OPEN: "○",
  CONTACTED: "◐",
  INTERVIEWING: "◑",
  CONVERTED: "●",
  DISMISSED: "✕",
  EXPIRED: "▪",
};

const SUPPORT_KIND_LABEL: Record<string, string> = {
  CAPITAL: "Capital",
  SPONSOR: "Sponsor",
  AMBASSADOR: "Embajador",
  ADVISOR: "Advisor",
  OTHER: "Otro",
};

export default async function FounderLeadsPage({ params }: Params) {
  const user = await requireRole(["PROJECT_OWNER"]);
  const { projectSlug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug: projectSlug },
    include: {
      startupProfile: {
        select: { preMoneyValuation: true, valuationCurrency: true },
      },
    },
  });
  if (!project) notFound();
  if (project.ownerId !== user.id) notFound();

  const [leads, infoRequests] = await Promise.all([
    prisma.lead.findMany({
      where: { projectId: project.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        pendingAssignments: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, shareCount: true, createdAt: true },
        },
      },
    }),
    prisma.infoRequest.findMany({
      where: { projectId: project.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        requester: { select: { id: true, fullName: true, email: true } },
      },
    }),
  ]);

  const valuation = project.startupProfile?.preMoneyValuation
    ? Number(project.startupProfile.preMoneyValuation)
    : null;
  const currency = project.startupProfile?.valuationCurrency ?? "USD";
  const pricePerShare =
    valuation && project.totalShares > 0 ? valuation / project.totalShares : null;

  function fmtMoney(amt: number) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amt);
  }
  function fmtInt(n: number): string {
    return n.toLocaleString("es-MX");
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
        section="Interés de compra"
        description="Quienes piden información primero y quienes ya quieren participar. Aprobá solicitudes, contactá leads y proponé al admin las asignaciones."
      />

      {/* ─── Banda de stats compacta ───────────────────────────────── */}
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-px bg-line">
        <LeadStat
          label="Solicitudes"
          value={infoRequests.length}
          urgent={infoRequests.length > 0}
          hint="pendientes"
        />
        <LeadStat
          label="Sin contactar"
          value={openCount}
          urgent={openCount > 0}
          hint="leads abiertos"
        />
        <LeadStat
          label="En conversación"
          value={contactedCount}
          hint="ya contactaste"
        />
        <LeadStat
          label="Resueltos"
          value={resolvedCount}
          hint="convertidos o cerrados"
        />
      </div>

      {/* ─── Solicitudes de información (etapa 1) ──────────────────── */}
      {infoRequests.length > 0 && (
        <section className="mt-12">
          <div className="hairline-b pb-3 mb-6 flex items-baseline justify-between gap-3">
            <p className="eyebrow !text-navy">
              01 · Solicitudes de información ({infoRequests.length})
            </p>
            <p className="eyebrow !text-navy/40">Etapa 1 — antes del interés</p>
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
                      <span className="font-sans text-navy text-lg leading-tight">
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
                      <InfoRequestActions infoRequestId={r.id} />
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
        <div className="hairline-b pb-3 mb-6 flex items-baseline justify-between gap-3">
          <p className="eyebrow !text-navy">
            {infoRequests.length > 0 ? "02 · " : ""}Leads de compra
            {leads.length > 0 ? ` (${leads.length})` : ""}
          </p>
          {leads.length > 0 && (
            <p className="eyebrow !text-navy/40">Etapa 2 — interés concreto</p>
          )}
        </div>

        {leads.length === 0 ? (
          <p className="text-navy/60">
            Cuando alguien diga “me interesa participar” en tu proyecto, va a aparecer
            acá con el detalle del monto que pide.
          </p>
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
                      <span className="font-sans text-navy text-lg leading-tight">
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
                        {STATUS_LABEL[l.status] ?? l.status}
                      </span>
                      {l.supportKind && (
                        <>
                          <span className="!text-navy/30"> · </span>
                          <span className="!text-navy">
                            {SUPPORT_KIND_LABEL[l.supportKind] ?? l.supportKind}
                          </span>
                        </>
                      )}
                      <span className="!text-navy/30"> · </span>
                      <span className="!text-navy/70">{l.user.email}</span>
                    </p>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-sm">
                      <div>
                        <p className="eyebrow !text-navy/40">Acciones</p>
                        <p className="mt-1 text-navy">{fmtInt(l.shareCountRequested)}</p>
                      </div>
                      {amount !== null && (
                        <div>
                          <p className="eyebrow !text-navy/40">Equivalente</p>
                          <p className="mt-1 text-navy">{fmtMoney(amount)}</p>
                        </div>
                      )}
                      <div>
                        <p className="eyebrow !text-navy/40">Recibido</p>
                        <p className="mt-1 text-navy">{formatDate(l.createdAt)}</p>
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
                          Asignación propuesta — esperando validación del admin
                        </p>
                        <p className="mt-2 text-sm text-navy/75">
                          Le propusiste al equipo de AJDUT asignar{" "}
                          <span className="font-mono text-navy">
                            {fmtInt(l.pendingAssignments[0].shareCount)}
                          </span>{" "}
                          acciones. Cuando lo aprueben, se va a emitir el
                          certificado y vas a recibir un email.
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
