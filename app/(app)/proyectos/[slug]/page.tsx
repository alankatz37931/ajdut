import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { Section } from "@/components/ui/Section";
import { KpiCard } from "@/components/ui/KpiCard";
import { InterestForm } from "./InterestForm";
import { AdminApprovalActions } from "./AdminApprovalActions";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/lib/utils/format";

type Params = { params: Promise<{ slug: string }> };

const STAGE_LABEL: Record<string, string> = {
  IDEA: "Idea",
  PRE_SEED: "Pre-seed",
  SEED: "Seed",
  EARLY_REVENUE: "Early revenue",
  GROWTH: "Growth",
  SCALE: "Scale",
};

export default async function ProjectPage({ params }: Params) {
  const user = await requireSession();
  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, fullName: true } },
      startupProfile: {
        include: {
          founders: { orderBy: { joinedAt: "asc" } },
          milestones: { orderBy: { targetDate: "asc" } },
        },
      },
      participations: {
        include: {
          currentOwner: { select: { id: true, fullName: true, role: true } },
        },
      },
    },
  });
  if (!project) notFound();

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canView) notFound();

  // Métricas con visibility según rol
  const metrics = await prisma.startupMetric.findMany({
    where: {
      startupProfileId: project.startupProfile?.id,
      ...(access.canSeePrivateMetrics ? {} : { visibility: "PUBLIC_TO_HOLDERS" }),
    },
    orderBy: { asOf: "desc" },
  });

  // Snapshot de participaciones
  const totalShares = project.totalShares;
  const platformShares = project.participations
    .filter((p) => p.isPlatformStake)
    .reduce((s, p) => s + p.shareCount, 0);
  const assignedShares = project.participations
    .filter((p) => ["ASSIGNED", "IN_RESALE", "TRANSFER_PENDING"].includes(p.status))
    .reduce((s, p) => s + p.shareCount, 0);
  const availableShares = project.participations
    .filter((p) => p.status === "AVAILABLE")
    .reduce((s, p) => s + p.shareCount, 0);

  // Cap table agrupado por dueño (solo para roles permitidos)
  type CapRow = { holder: string; isPlatform: boolean; shares: number; pct: number };
  const capTable: CapRow[] = [];
  if (access.canSeeCapTable) {
    const byOwner = new Map<string, { name: string; isPlatform: boolean; shares: number }>();
    for (const p of project.participations) {
      if (!p.currentOwnerId || !p.currentOwner) continue;
      const existing = byOwner.get(p.currentOwnerId);
      if (existing) {
        existing.shares += p.shareCount;
      } else {
        byOwner.set(p.currentOwnerId, {
          name: p.isPlatformStake ? "AJDUT Platform" : p.currentOwner.fullName,
          isPlatform: p.isPlatformStake,
          shares: p.shareCount,
        });
      }
    }
    capTable.push(
      ...Array.from(byOwner.values()).map((v) => ({
        holder: v.name,
        isPlatform: v.isPlatform,
        shares: v.shares,
        pct: (v.shares / totalShares) * 100,
      }))
    );
    if (availableShares > 0) {
      capTable.push({
        holder: "Disponible (sin asignar)",
        isPlatform: false,
        shares: availableShares,
        pct: (availableShares / totalShares) * 100,
      });
    }
    capTable.sort((a, b) => b.shares - a.shares);
  }

  // Métricas: agrupar por kind y mostrar el último valor
  type MetricRow = { kind: string; label: string; value: string; unit: string; asOf: Date };
  const latestByKind = new Map<string, MetricRow>();
  for (const m of metrics) {
    if (!latestByKind.has(m.kind)) {
      latestByKind.set(m.kind, {
        kind: m.kind,
        label: m.customLabel ?? METRIC_LABEL[m.kind] ?? m.kind,
        value: Number(m.value).toLocaleString("es-MX"),
        unit: m.unit,
        asOf: m.asOf,
      });
    }
  }

  // ¿Tiene el viewer participaciones en este proyecto?
  const myParticipations =
    access.role === "PARTNER" || access.role === "ADMIN" || access.role === "OWNER" || access.role === "CO_ADMIN"
      ? project.participations.filter((p) => p.currentOwnerId === user.id)
      : [];

  const myShares = myParticipations.reduce((s, p) => s + p.shareCount, 0);
  const myPct = totalShares > 0 ? (myShares / totalShares) * 100 : 0;

  // Valor de la posición del viewer si hay valoración declarada.
  const valuationNum = project.startupProfile?.preMoneyValuation
    ? Number(project.startupProfile.preMoneyValuation)
    : null;
  const pricePerShare =
    valuationNum && totalShares > 0 ? valuationNum / totalShares : null;
  const myValue = pricePerShare !== null ? myShares * pricePerShare : null;
  const projectCurrency = project.startupProfile?.valuationCurrency ?? "USD";

  const PARTICIPATION_STATUS_LABEL: Record<string, string> = {
    ASSIGNED: "Asignada",
    IN_RESALE: "En reventa",
    TRANSFER_PENDING: "Transferencia pendiente",
    IN_NEGOTIATION: "En negociación",
    AVAILABLE: "Disponible",
  };

  const isAdminViewer = access.role === "ADMIN" && project.ownerId !== user.id;

  return (
    <div>
      <Link href={backLinkFor(user.role)} className="eyebrow hover:!text-gold">
        ← Volver
      </Link>

      {isAdminViewer && (
        <div className="surface-cement mt-6 px-6 py-3">
          <span className="eyebrow !text-paper">Modo Admin · vista del proyecto</span>
        </div>
      )}

      <header className="mt-6 hairline-b pb-8 flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="max-w-2xl min-w-0">
          <p className="eyebrow">
            {project.startupProfile?.sector ?? project.kind}
            {project.startupProfile?.stage ? ` · ${STAGE_LABEL[project.startupProfile.stage]}` : ""}
          </p>
          <h1 className="font-sans mt-4 text-h1 text-navy">{project.name}</h1>
          {project.startupProfile?.oneLiner && (
            <p className="mt-3 text-navy/75 leading-relaxed text-lg">
              “{project.startupProfile.oneLiner}”
            </p>
          )}
          <p className="mt-3 eyebrow">
            Founder: {project.owner.fullName} · Estado: {project.status}
          </p>
        </div>
        <div className="flex flex-col gap-3 shrink-0 sm:flex-row sm:items-center">
          {access.canManifestInterest && availableShares > 0 && (
            <a href="#comprar" className="btn-primary text-center">
              Comprar acciones →
            </a>
          )}
          {access.canEdit && (
            <Link
              href={`/founder/${project.slug}/editar` as Route}
              className="btn-outline text-center"
            >
              ✎ Editar información
            </Link>
          )}
        </div>
      </header>

      {/* Panel de moderación: admin viendo un proyecto PENDING_APPROVAL */}
      {access.role === "ADMIN" && project.status === "PENDING_APPROVAL" && (
        <div className="mt-8">
          <AdminApprovalActions projectSlug={project.slug} />
        </div>
      )}

      <Section title="Instantánea">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <KpiCard label="Participaciones totales" value={formatNumber(totalShares)} hint="emitidas" />
          {/* Para no-admin/owner ocultamos el stake institucional de la cuenta de asignadas */}
          <KpiCard
            label="Asignadas"
            value={formatNumber(
              access.canSeeCapTable ? assignedShares : assignedShares - platformShares
            )}
            hint={formatPercent(
              ((access.canSeeCapTable ? assignedShares : assignedShares - platformShares) /
                totalShares) *
                100
            )}
          />
          <KpiCard
            label="Disponibles"
            value={formatNumber(availableShares)}
            hint={formatPercent((availableShares / totalShares) * 100)}
          />
          {access.canSeeCapTable && (
            <KpiCard
              label="AJDUT plataforma"
              value={formatNumber(platformShares)}
              hint={formatPercent((platformShares / totalShares) * 100)}
              highlight
            />
          )}
        </div>

        {project.startupProfile?.preMoneyValuation && (
          <div className="mt-px grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
            <KpiCard
              label="Valoración (pre-money)"
              value={formatCurrency(
                Number(project.startupProfile.preMoneyValuation),
                project.startupProfile.valuationCurrency
              )}
              hint="declarada"
            />
            {project.startupProfile.websiteUrl && (
              <KpiCard label="Sitio" value="↗" hint={project.startupProfile.websiteUrl} />
            )}
          </div>
        )}
      </Section>

      {/* Vista personalizada del viewer: qué tiene en este proyecto.
          Respeta A1 (no muestra otros socios) — solo la posición propia. */}
      {myShares > 0 && (
        <Section title="Tu participación">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-line">
            <KpiCard
              label="Acciones"
              value={formatNumber(myShares)}
              hint={formatPercent(myPct)}
              highlight
            />
            <KpiCard
              label="Valor"
              value={myValue !== null ? formatCurrency(myValue, projectCurrency) : "—"}
              hint={
                pricePerShare !== null
                  ? `a ${formatCurrency(pricePerShare, projectCurrency)} / acción`
                  : "sin valoración declarada"
              }
            />
            <KpiCard
              label="Participaciones"
              value={String(myParticipations.length)}
              hint={
                myParticipations.length === 1 ? "1 registro" : `${myParticipations.length} registros`
              }
            />
          </div>

          {myParticipations.length > 0 && (
            <ul className="mt-6 hairline-t">
              {myParticipations.map((p) => (
                <li
                  key={p.id}
                  className="hairline-b grid grid-cols-12 items-center gap-3 py-4"
                >
                  <div className="col-span-12 sm:col-span-5 min-w-0">
                    <p className="font-mono text-sm text-navy break-all">{p.serialCode}</p>
                    <p className="mt-1 eyebrow">
                      {PARTICIPATION_STATUS_LABEL[p.status] ?? p.status}
                    </p>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <p className="eyebrow">Acciones</p>
                    <p className="mt-1 font-mono text-navy">{formatNumber(p.shareCount)}</p>
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <p className="eyebrow">% del total</p>
                    <p className="mt-1 font-mono text-navy">
                      {formatPercent((p.shareCount / totalShares) * 100)}
                    </p>
                  </div>
                  <div className="col-span-12 sm:col-span-2 text-right">
                    <p className="eyebrow">Adquirida</p>
                    <p className="mt-1 eyebrow !text-navy">
                      {p.acquiredAt ? formatDate(p.acquiredAt) : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!access.canSeeCapTable && (
            <p className="mt-4 eyebrow !text-navy/40">
              Solo ves tu propia posición. El cap table completo es información sensible y
              queda reservada al founder y al equipo de AJDUT.
            </p>
          )}
        </Section>
      )}

      {access.canManifestInterest && availableShares > 0 && (
        <Section title="Comprar acciones">
          <div id="comprar">
            <InterestForm
              projectSlug={project.slug}
              availableShares={availableShares}
              valuation={
                project.startupProfile?.preMoneyValuation
                  ? Number(project.startupProfile.preMoneyValuation)
                  : null
              }
              totalShares={project.totalShares}
              currency={project.startupProfile?.valuationCurrency ?? "USD"}
            />
          </div>
        </Section>
      )}

      {/* Documentos del proyecto (URLs externos) */}
      {(project.startupProfile?.pitchDeckStorageKey ||
        project.startupProfile?.dataRoomStorageKey) && (
        <Section title="Documentos">
          <ul className="hairline-t">
            {project.startupProfile.pitchDeckStorageKey && (
              <li className="hairline-b py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-navy">Pitch deck</p>
                  <p className="eyebrow mt-1 truncate font-mono normal-case tracking-normal !text-navy/60">
                    {project.startupProfile.pitchDeckStorageKey}
                  </p>
                </div>
                <a
                  href={project.startupProfile.pitchDeckStorageKey}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="eyebrow hover:!text-gold shrink-0"
                >
                  Abrir ↗
                </a>
              </li>
            )}
            {project.startupProfile.dataRoomStorageKey && (
              <li className="hairline-b py-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-navy">Data room</p>
                  <p className="eyebrow mt-1 truncate font-mono normal-case tracking-normal !text-navy/60">
                    {project.startupProfile.dataRoomStorageKey}
                  </p>
                </div>
                <a
                  href={project.startupProfile.dataRoomStorageKey}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="eyebrow hover:!text-gold shrink-0"
                >
                  Abrir ↗
                </a>
              </li>
            )}
          </ul>
        </Section>
      )}

      {project.startupProfile && (
        <Section title={`¿Qué hace ${project.name}?`}>
          <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            <Block title="Problema" body={project.startupProfile.problemStatement} />
            <Block title="Solución" body={project.startupProfile.solutionStatement} />
            <Block title="Modelo de negocio" body={project.startupProfile.businessModel} />
          </div>
          {project.description && (
            <div className="mt-10 hairline-t pt-6">
              <p className="eyebrow mb-3">Descripción</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.description}
              </p>
            </div>
          )}
        </Section>
      )}

      {(project.startupProfile?.founders.length ?? 0) > 0 && (
        <Section title="Equipo fundador">
          <ul className="hairline-t">
            {project.startupProfile!.founders.map((f) => (
              <li
                key={f.id}
                className="hairline-b grid grid-cols-12 items-center gap-3 py-4"
              >
                <span className="col-span-7 sm:col-span-5 text-navy break-words">
                  {f.fullName}
                </span>
                <span className="col-span-5 sm:col-span-3 eyebrow sm:text-left text-right">
                  {f.role}
                </span>
                <span className="col-span-6 sm:col-span-2 font-mono text-navy">
                  {formatPercent(Number(f.equityPercent))}
                </span>
                <span className="col-span-6 sm:col-span-2 eyebrow text-right">
                  {f.isActive ? "activo" : "inactivo"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(project.startupProfile?.milestones.length ?? 0) > 0 && (
        <Section title="Hitos">
          <ul className="space-y-3">
            {project.startupProfile!.milestones.map((m) => (
              <li
                key={m.id}
                className="grid grid-cols-12 gap-x-3 gap-y-1 hairline-b py-3"
              >
                <span className="col-span-6 sm:col-span-2 eyebrow !text-navy">
                  {m.status}
                </span>
                <span className="col-span-6 sm:col-span-2 eyebrow text-right sm:text-left">
                  {m.achievedAt
                    ? formatDate(m.achievedAt)
                    : m.targetDate
                    ? `target ${formatDate(m.targetDate)}`
                    : "—"}
                </span>
                <span className="col-span-12 sm:col-span-8 text-navy">{m.title}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {latestByKind.size > 0 && (
        <Section title="Métricas">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-3">
            {Array.from(latestByKind.values()).map((m) => (
              <KpiCard
                key={m.kind}
                label={m.label}
                value={`${m.value} ${m.unit}`}
                hint={`al ${formatDate(m.asOf)}`}
              />
            ))}
          </div>
        </Section>
      )}

      {access.canSeeCapTable && capTable.length > 0 && (
        <Section title="Cap table">
          <ul className="hairline-t">
            {capTable.map((r, i) => (
              <li
                key={i}
                className="hairline-b grid grid-cols-12 items-center gap-3 py-3"
              >
                <span className="col-span-12 sm:col-span-6 text-navy break-words">
                  {r.holder}
                  {r.isPlatform && <span className="ml-2 text-gold">◆</span>}
                </span>
                <span className="col-span-6 sm:col-span-3 font-mono text-navy sm:text-right">
                  {formatNumber(r.shares)}
                </span>
                <span className="col-span-6 sm:col-span-3 font-mono text-navy text-right">
                  {formatPercent(r.pct)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

const METRIC_LABEL: Record<string, string> = {
  MRR: "MRR",
  ARR: "ARR",
  GMV: "GMV",
  ACTIVE_USERS: "Usuarios activos",
  PAYING_CUSTOMERS: "Clientes de pago",
  CHURN_RATE: "Churn",
  BURN_RATE: "Burn rate",
  RUNWAY_MONTHS: "Runway",
  CAC: "CAC",
  LTV: "LTV",
  GROSS_MARGIN: "Margen bruto",
  HEADCOUNT: "Headcount",
  CUSTOM: "Custom",
};

function backLinkFor(role: string): Route {
  if (role === "ADMIN") return "/admin/projects" as Route;
  return "/proyectos" as Route;
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="eyebrow mb-3">{title}</p>
      <p className="text-navy/85 leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  );
}
