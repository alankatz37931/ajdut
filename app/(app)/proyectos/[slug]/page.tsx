import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { KpiCard } from "@/components/ui/KpiCard";
import { InterestForm } from "./InterestForm";
import { AdminApprovalActions } from "./AdminApprovalActions";
import { ProjectBody } from "./ProjectBody";
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

  const MILESTONE_STATUS_LABEL: Record<string, string> = {
    PLANNED: "Planeado",
    IN_PROGRESS: "En curso",
    ACHIEVED: "Logrado",
    DELAYED: "Demorado",
    CANCELLED: "Cancelado",
  };

  // ─── Opción A: scroll único. El cuerpo fluye y la página mide lo que mide
  //     el contenido — sin marco fijo que llenar. Cada bloque se apila solo
  //     si tiene info. ───
  const sections: { title?: string; node: React.ReactNode }[] = [];

  // Participaciones: los números del proyecto.
  sections.push({
    title: "Participaciones",
    node: (
      <div className="space-y-px">
        {/* Renglón 1: participaciones (siempre 3, sin celdas muertas) */}
        <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-3">
          <KpiCard
            label="Participaciones totales"
            value={formatNumber(totalShares)}
            hint="emitidas"
          />
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
        </div>

        {/* Renglón 2: valoración a ancho completo. El sitio web vive en el
            header (es contexto del proyecto, no un número). */}
        {project.startupProfile?.preMoneyValuation && (
          <div className="flex flex-col gap-px bg-line sm:flex-row">
            <KpiCard
              label="Valoración (pre-money)"
              value={formatCurrency(
                Number(project.startupProfile.preMoneyValuation),
                project.startupProfile.valuationCurrency
              )}
              hint="declarada"
              className="sm:flex-1"
            />
          </div>
        )}
      </div>
    ),
  });

  // Resumen: problema / solución / modelo + descripción.
  if (project.startupProfile) {
    sections.push({
      title: "Resumen",
      node: (
        <>
          <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            <Block title="Problema" body={project.startupProfile.problemStatement} />
            <Block title="Solución" body={project.startupProfile.solutionStatement} />
            <Block
              title="Modelo de negocio"
              body={project.startupProfile.businessModel}
            />
          </div>
          {project.description && (
            <div className="mt-6">
              <p className="eyebrow mb-3">Descripción</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.description}
              </p>
            </div>
          )}
        </>
      ),
    });
    // "Resumen" va primero: el lector entiende el negocio antes que los
    // números. "Participaciones" quedó en [0]; lo movemos detrás de "Qué hace".
    sections.unshift(sections.pop()!);
  }

  // Tu participación (si el viewer tiene acciones). Respeta A1.
  if (myShares > 0) {
    sections.push({
      title: "Tu participación",
      node: (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-line">
            <KpiCard
              label="Acciones"
              value={formatNumber(myShares)}
              hint={formatPercent(myPct)}
              highlight
              className="bg-paper-light"
            />
            <KpiCard
              label="Valor"
              value={myValue !== null ? formatCurrency(myValue, projectCurrency) : "—"}
              hint={
                pricePerShare !== null
                  ? `a ${formatCurrency(pricePerShare, projectCurrency)} / acción`
                  : "sin valoración declarada"
              }
              className="bg-paper-light"
            />
            <KpiCard
              label="Participaciones"
              value={String(myParticipations.length)}
              hint={
                myParticipations.length === 1
                  ? "1 registro"
                  : `${myParticipations.length} registros`
              }
              className="bg-paper-light"
            />
          </div>

          {myParticipations.length > 0 && (
            <ul className="mt-4 space-y-5">
              {/* Encabezado de columnas: solo desktop, los labels van una
                  sola vez en vez de repetirse por fila. */}
              <li className="hidden sm:grid grid-cols-12 gap-3 pb-1">
                <span className="sm:col-span-5 eyebrow !text-navy/40">
                  Serial
                </span>
                <span className="sm:col-span-3 eyebrow !text-navy/40">
                  Acciones
                </span>
                <span className="sm:col-span-2 eyebrow !text-navy/40">
                  % del total
                </span>
                <span className="sm:col-span-2 eyebrow !text-navy/40 text-right">
                  Adquirida
                </span>
              </li>
              {myParticipations.map((p) => (
                <li
                  key={p.id}
                  className="grid grid-cols-12 items-center gap-3"
                >
                  <div className="col-span-12 sm:col-span-5 min-w-0">
                    <p className="font-mono text-sm text-navy break-all">
                      {p.serialCode}
                    </p>
                    <p className="mt-1 eyebrow">
                      {PARTICIPATION_STATUS_LABEL[p.status] ?? p.status}
                    </p>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <p className="eyebrow sm:hidden">Acciones</p>
                    <p className="mt-1 sm:mt-0 font-mono text-navy">
                      {formatNumber(p.shareCount)}
                    </p>
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <p className="eyebrow sm:hidden">% del total</p>
                    <p className="mt-1 sm:mt-0 font-mono text-navy">
                      {formatPercent((p.shareCount / totalShares) * 100)}
                    </p>
                  </div>
                  <div className="col-span-12 sm:col-span-2 text-right">
                    <p className="eyebrow sm:hidden">Adquirida</p>
                    <p className="mt-1 sm:mt-0 eyebrow !text-navy">
                      {p.acquiredAt ? formatDate(p.acquiredAt) : "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!access.canSeeCapTable && (
            <p className="mt-4 eyebrow !text-navy/40">
              Solo ves tu propia posición. El cap table completo es información
              sensible y queda reservada al founder y al equipo de AJDUT.
            </p>
          )}
        </>
      ),
    });
  }

  if ((project.startupProfile?.founders.length ?? 0) > 0) {
    sections.push({
      title: "Equipo",
      node: (
        <ul className="space-y-4">
          {project.startupProfile!.founders.map((f) => (
            <li
              key={f.id}
              className="grid grid-cols-12 items-center gap-3"
            >
              <span className="col-span-7 sm:col-span-6 text-navy break-words">
                {f.fullName}
              </span>
              <span className="col-span-5 sm:col-span-4 eyebrow sm:text-left text-right">
                {f.role}
              </span>
              <span className="col-span-12 sm:col-span-2 font-mono text-navy sm:text-right">
                {formatPercent(Number(f.equityPercent))}
              </span>
            </li>
          ))}
        </ul>
      ),
    });
  }

  if ((project.startupProfile?.milestones.length ?? 0) > 0) {
    sections.push({
      title: "Hitos",
      node: (
        <ul className="space-y-4">
          {project.startupProfile!.milestones.map((m) => (
            <li
              key={m.id}
              className="grid grid-cols-12 items-baseline gap-x-3 gap-y-1"
            >
              <span className="col-span-12 sm:col-span-7 text-navy">
                {m.title}
              </span>
              <span className="col-span-6 sm:col-span-2 eyebrow !text-navy">
                {MILESTONE_STATUS_LABEL[m.status] ?? m.status}
              </span>
              <span className="col-span-6 sm:col-span-3 eyebrow text-right">
                {m.achievedAt
                  ? formatDate(m.achievedAt)
                  : m.targetDate
                  ? `objetivo ${formatDate(m.targetDate)}`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
      ),
    });
  }

  if (latestByKind.size > 0) {
    sections.push({
      title: "Métricas",
      node: (
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
      ),
    });
  }

  if (
    project.startupProfile?.pitchDeckStorageKey ||
    project.startupProfile?.dataRoomStorageKey
  ) {
    sections.push({
      title: "Documentos",
      node: (
        <ul className="space-y-4">
          {project.startupProfile.pitchDeckStorageKey && (
            <li className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-navy">Pitch deck</p>
                <p className="eyebrow mt-1 !text-navy/40">
                  Documento del proyecto
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
            <li className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-navy">Data room</p>
                <p className="eyebrow mt-1 !text-navy/40">
                  Acceso a documentación
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
      ),
    });
  }

  if (access.canSeeCapTable && capTable.length > 0) {
    sections.push({
      title: "Cap table",
      node: (
        <ul className="space-y-3">
          {capTable.map((r, i) => (
            <li
              key={i}
              className="grid grid-cols-12 items-center gap-3"
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
      ),
    });
  }

  return (
    <div>
      <Link href={backLinkFor(user.role)} className="eyebrow hover:!text-gold">
        ← Volver
      </Link>

      <header className="mt-4 hairline-b pb-5 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
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
          <p className="mt-3">
            <span className="eyebrow !text-navy/40">Founder</span>{" "}
            <span className="ml-2 text-navy">{project.owner.fullName}</span>
          </p>
          {project.startupProfile?.websiteUrl && (
            <a
              href={project.startupProfile.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block eyebrow hover:!text-gold"
            >
              {project.startupProfile.websiteUrl
                .replace(/^https?:\/\//, "")
                .replace(/\/$/, "")}{" "}
              ↗
            </a>
          )}
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
              Editar información
            </Link>
          )}
        </div>
      </header>

      {/* Panel de moderación: admin viendo un proyecto PENDING_APPROVAL */}
      {access.role === "ADMIN" && project.status === "PENDING_APPROVAL" && (
        <div className="mt-5">
          <AdminApprovalActions projectSlug={project.slug} />
        </div>
      )}

      {/* Ancla sin padding: si el form está cerrado (null) no deja hueco.
          El espaciado lo aporta el propio form cuando se abre. */}
      {access.canManifestInterest && availableShares > 0 && (
        <div id="comprar">
          <InterestForm
            projectSlug={project.slug}
            projectName={project.name}
            viewerName={user.name}
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
      )}

      {/* Cuerpo del proyecto: scroll único, los bloques fluyen. Se oculta
          entero en modo foco (#comprar) para no distraer al comprar. */}
      {sections.length > 0 && (
        <ProjectBody hideOnHash="#comprar">
          {sections.map((s, i) => (
            <section
              key={i}
              className={
                i === 0
                  ? "pt-6 sm:pt-7"
                  : "hairline-t mt-7 pt-6 sm:mt-8 sm:pt-7"
              }
            >
              {s.title && (
                <p className="font-mono text-sm tracking-wider mb-4">
                  <span className="text-gold">
                    {String(i + 1).padStart(2, "0")}
                  </span>{" "}
                  <span className="text-navy">· {s.title}</span>
                </p>
              )}
              {s.node}
            </section>
          ))}
        </ProjectBody>
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
