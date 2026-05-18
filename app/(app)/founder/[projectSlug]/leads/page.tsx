import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { formatDate } from "@/lib/utils/format";
import { LeadActions } from "./LeadActions";

type Params = { params: Promise<{ projectSlug: string }> };

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Sin contactar",
  CONTACTED: "Contactado",
  CONVERTED: "Convertido",
  DISMISSED: "Descartado",
  EXPIRED: "Expirado",
};

const STATUS_SYMBOL: Record<string, string> = {
  OPEN: "○",
  CONTACTED: "◐",
  CONVERTED: "●",
  DISMISSED: "✕",
  EXPIRED: "▪",
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

  const leads = await prisma.lead.findMany({
    where: { projectId: project.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      user: { select: { id: true, fullName: true, email: true } },
    },
  });

  const valuation = project.startupProfile?.preMoneyValuation
    ? Number(project.startupProfile.preMoneyValuation)
    : null;
  const currency = project.startupProfile?.valuationCurrency ?? "USD";
  const pricePerShare =
    valuation && project.totalShares > 0
      ? valuation / project.totalShares
      : null;

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
    ["CONVERTED", "DISMISSED", "EXPIRED"].includes(l.status)
  ).length;

  const summaryParts: string[] = [];
  if (openCount > 0) summaryParts.push(`${openCount} sin contactar`);
  if (contactedCount > 0) summaryParts.push(`${contactedCount} contactado${contactedCount === 1 ? "" : "s"}`);
  if (resolvedCount > 0) summaryParts.push(`${resolvedCount} resuelto${resolvedCount === 1 ? "" : "s"}`);

  return (
    <div>
      <Link href={`/founder/${projectSlug}` as Route} className="eyebrow hover:!text-gold">
        ← {project.name}
      </Link>

      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Founder</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Interés de compra</h1>
        {summaryParts.length > 0 ? (
          <p className="mt-3 font-mono text-sm text-navy/75">{summaryParts.join(" · ")}</p>
        ) : (
          <p className="mt-3 font-mono text-sm text-navy/60">Aún no hay interés registrado.</p>
        )}
      </header>

      {leads.length === 0 ? (
        <p className="mt-10 text-navy/60">
          Cuando alguien manifieste interés en comprar acciones de tu proyecto, va a aparecer acá.
        </p>
      ) : (
        <ul className="mt-10 space-y-4">
          {leads.map((l) => {
            const isOpen = l.status === "OPEN";
            const isCool = l.status === "CONTACTED";
            const isClosed = ["CONVERTED", "DISMISSED", "EXPIRED"].includes(l.status);
            const railClass = isOpen ? "bg-gold" : isCool ? "bg-navy/60" : "bg-navy/20";
            const daysAgo = Math.floor(
              (Date.now() - l.createdAt.getTime()) / (1000 * 60 * 60 * 24)
            );
            const amount = pricePerShare ? l.shareCountRequested * pricePerShare : null;

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

                  {!isClosed && (
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
    </div>
  );
}
