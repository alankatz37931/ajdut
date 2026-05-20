import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getProjectAccess } from "@/lib/services/project-access";
import { getInfoRequest } from "@/lib/services/info-request";
import { getUserPreferences } from "@/lib/preferences";
import { KpiCard } from "@/components/ui/KpiCard";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { InterestForm } from "./InterestForm";
import { InfoRequestForm } from "./InfoRequestForm";
import { AdminApprovalActions } from "./AdminApprovalActions";
import { ProjectBody } from "./ProjectBody";
import { embedUrl } from "@/lib/utils/embed";
import {
  formatCurrency,
  formatDate,
  formatDualCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/utils/format";

type Params = { params: Promise<{ slug: string }> };

const KIND_LABEL: Record<string, string> = {
  REAL_ESTATE: "Inmobiliario",
  MERCHANDISE: "Mercancía",
  STARTUP: "Otro",
};

const STAGE_LABEL: Record<string, string> = {
  IDEA: "Idea",
  PRE_SEED: "Pre-seed",
  SEED: "Seed",
  EARLY_REVENUE: "Early revenue",
  GROWTH: "Growth",
  SCALE: "Scale",
};

const STAGE_INFO: Record<string, string> = {
  IDEA: "Concepto en validación, sin producto en mercado.",
  PRE_SEED:
    "Primer capital del fundador / familia / amigos para construir un MVP.",
  SEED: "Primera ronda formal para validar el modelo de negocio.",
  EARLY_REVENUE:
    "El producto ya genera ingresos pero sigue iterando el ajuste con el mercado.",
  GROWTH: "Modelo validado, foco en escalar.",
  SCALE: "Operación consolidada, expansión a nuevos mercados.",
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
          currentOwner: { select: { id: true, fullName: true, alias: true, role: true } },
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

  // Preferencias del viewer (MXN dual display)
  const prefs = await getUserPreferences();
  const prefersMxn = prefs.currency === "MXN";
  const projectCurrencyForPrefs =
    project.startupProfile?.valuationCurrency ?? "USD";
  // Solo mostramos el equivalente MXN cuando el monto original es USD.
  const showMxnDual = prefersMxn && projectCurrencyForPrefs === "USD";

  // InfoRequest del viewer para este proyecto (etapa 1 del flujo).
  // PARTNER usa esto para gating de Documentos / Reportes y para el botón.
  const myInfoRequest =
    access.role === "PARTNER"
      ? await getInfoRequest(project.id, user.id)
      : null;
  const partnerHasApprovedInfo = myInfoRequest?.status === "APPROVED";

  // Métricas con visibility según rol
  const metrics = await prisma.startupMetric.findMany({
    where: {
      startupProfileId: project.startupProfile?.id,
      ...(access.canSeePrivateMetrics ? {} : { visibility: "PUBLIC_TO_HOLDERS" }),
    },
    orderBy: { asOf: "desc" },
  });

  // Reportes publicados por el founder. Visibles para cualquier viewer
  // del proyecto (mismo criterio que Documentos / Hitos).
  const reports = await prisma.report.findMany({
    where: { projectId: project.id },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      kind: true,
      period: true,
      fiscalYear: true,
      title: true,
      summary: true,
      storageKey: true,
      publishedAt: true,
    },
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
  type CapRow = { holder: string; isPlatform: boolean; shares: number };
  const capTable: CapRow[] = [];
  if (access.canSeeCapTable) {
    const byOwner = new Map<string, { name: string; isPlatform: boolean; shares: number }>();
    for (const p of project.participations) {
      if (!p.currentOwnerId || !p.currentOwner) continue;
      const existing = byOwner.get(p.currentOwnerId);
      if (existing) {
        existing.shares += p.shareCount;
      } else {
        // Para terceros mostramos el alias si el dueño lo configuró; cae a
        // fullName cuando no hay alias. La participación institucional se
        // muestra siempre como "AJDUT Platform".
        const displayName = p.isPlatformStake
          ? "AJDUT Platform"
          : p.currentOwner.alias ?? p.currentOwner.fullName;
        byOwner.set(p.currentOwnerId, {
          name: displayName,
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
      }))
    );
    if (availableShares > 0) {
      capTable.push({
        holder: "Disponible (sin asignar)",
        isPlatform: false,
        shares: availableShares,
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

  const REPORT_PERIOD_LABEL: Record<string, string> = {
    Q1: "Q1",
    Q2: "Q2",
    Q3: "Q3",
    Q4: "Q4",
    ANNUAL: "Anual",
    EXTRAORDINARY: "Extraordinario",
  };

  const REPORT_KIND_LABEL: Record<string, string> = {
    QUARTERLY_FINANCIAL: "Trimestral",
    INVESTOR_UPDATE: "Update",
    ANNUAL_AUDIT: "Auditoría anual",
    EXTRAORDINARY: "Extraordinario",
  };

  function humanReportPeriod(period: string, year: number): string {
    if (period === "ANNUAL") return `Anual ${year}`;
    if (period === "EXTRAORDINARY") return `Extraordinario ${year}`;
    return `${REPORT_PERIOD_LABEL[period] ?? period} ${year}`;
  }

  // ─── Opción A: scroll único. El cuerpo fluye y la página mide lo que mide
  //     el contenido — sin marco fijo que llenar. Cada bloque se apila solo
  //     si tiene info. ───
  const sections: { title?: string; node: React.ReactNode }[] = [];

  // Acciones efectivamente colocadas (sin el stake institucional para
  // quien no ve el cap table) → barra de fondeo.
  const visibleAssigned = access.canSeeCapTable
    ? assignedShares
    : assignedShares - platformShares;
  const fundedPct =
    totalShares > 0
      ? Math.min(100, Math.max(0, (visibleAssigned / totalShares) * 100))
      : 0;

  // Participaciones: los números del proyecto.
  const hasValuation = !!project.startupProfile?.preMoneyValuation;
  const hasTargetRaise = !!project.startupProfile?.targetRaiseAmount;
  const participationsCols = 3 + (hasValuation ? 1 : 0) + (hasTargetRaise ? 1 : 0);
  const participationsColClass =
    participationsCols >= 5
      ? "lg:grid-cols-5"
      : participationsCols === 4
      ? "lg:grid-cols-4"
      : "lg:grid-cols-3";
  sections.push({
    title: "Participaciones",
    node: (
      // Una sola grilla uniforme — mismo patrón que Métricas (gap-px bg-line
      // + KpiCard). Las celdas opcionales (valoración / monto a levantar) se
      // agregan solo si el founder las declaró.
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-px bg-line ${participationsColClass}`}
      >
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
          hint={`${formatNumber(
            access.canSeeCapTable ? assignedShares : assignedShares - platformShares
          )} de ${formatNumber(totalShares)}`}
        />
        <KpiCard
          label="Disponibles"
          value={formatNumber(availableShares)}
          hint={`${formatNumber(availableShares)} de ${formatNumber(totalShares)}`}
        />
        {project.startupProfile?.preMoneyValuation && (() => {
          const amt = Number(project.startupProfile.preMoneyValuation);
          const dual = showMxnDual
            ? formatDualCurrency(amt, true, 0)
            : null;
          return (
            <KpiCard
              label="Valoración"
              value={formatCurrency(
                amt,
                project.startupProfile.valuationCurrency,
                0
              )}
              hint={dual?.secondary ?? "declarada"}
            />
          );
        })()}
        {project.startupProfile?.targetRaiseAmount && (() => {
          const amt = Number(project.startupProfile.targetRaiseAmount);
          const dual = showMxnDual
            ? formatDualCurrency(amt, true, 0)
            : null;
          return (
            <KpiCard
              label="Monto a levantar"
              value={formatCurrency(
                amt,
                project.startupProfile.valuationCurrency,
                0
              )}
              hint={dual?.secondary ?? "objetivo de ronda"}
            />
          );
        })()}
      </div>
    ),
  });

  // Barra de fondeo: cuánto del total ya está colocado.
  sections.push({
    title: "Fondeo",
    node: (
      <div>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow !text-navy/40">
            {formatNumber(visibleAssigned)} de {formatNumber(totalShares)}{" "}
            acciones colocadas
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full bg-line">
          <div
            className="h-full bg-navy transition-[width]"
            style={{ width: `${fundedPct}%` }}
          />
        </div>

        {pricePerShare !== null && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-px bg-line">
            <KpiCard
              label="Valor sugerido por acción"
              value={formatCurrency(pricePerShare, projectCurrency)}
              hint={
                showMxnDual
                  ? (formatDualCurrency(pricePerShare, true).secondary ??
                    "valoración ÷ acciones totales")
                  : "valoración ÷ acciones totales"
              }
            />
            <KpiCard
              label="Utilidad anual por acción"
              value="—"
              hint="no informada por el founder"
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
              hint={`${formatNumber(myShares)} de ${formatNumber(totalShares)}`}
              highlight
              className="bg-paper-light"
            />
            <KpiCard
              label="Valor"
              value={myValue !== null ? formatCurrency(myValue, projectCurrency) : "—"}
              hint={
                showMxnDual && myValue !== null
                  ? (formatDualCurrency(myValue, true).secondary ??
                    (pricePerShare !== null
                      ? `a ${formatCurrency(pricePerShare, projectCurrency)} / acción`
                      : "sin valoración declarada"))
                  : pricePerShare !== null
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
                  de {formatNumber(totalShares)}
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
                    <p className="eyebrow sm:hidden">de {formatNumber(totalShares)}</p>
                    <p className="mt-1 sm:mt-0 font-mono text-navy">
                      de {formatNumber(totalShares)}
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

  if (
    project.startupProfile?.assetBackingNote ||
    project.startupProfile?.equityStructureNote
  ) {
    sections.push({
      title: "Estructura y respaldo",
      node: (
        <div className="space-y-6">
          {project.startupProfile.assetBackingNote && (
            <div>
              <p className="eyebrow mb-3">Activo respaldado</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.startupProfile.assetBackingNote}
              </p>
            </div>
          )}
          {project.startupProfile.equityStructureNote && (
            <div>
              <p className="eyebrow mb-3">Estructura accionaria</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.startupProfile.equityStructureNote}
              </p>
            </div>
          )}
        </div>
      ),
    });
  }

  // Políticas (acciones / dividendos / frecuencia). Gating: mismo criterio
  // que Documentos / Reportes (Ola 2) — owner/co-admin/admin siempre;
  // partner solo si tiene InfoRequest APPROVED o ya es socio. Calculamos
  // canSeePrivateDocs más abajo, pero para preservar el orden de "sections"
  // adelantamos esa decisión acá.
  const isPrivilegedReaderForPolicies =
    access.role === "OWNER" ||
    access.role === "CO_ADMIN" ||
    access.role === "ADMIN";
  const canSeePoliciesGated =
    isPrivilegedReaderForPolicies || partnerHasApprovedInfo || myShares > 0;
  if (
    canSeePoliciesGated &&
    (project.startupProfile?.policyShares ||
      project.startupProfile?.policyDividends ||
      project.startupProfile?.dividendsFrequency)
  ) {
    sections.push({
      title: "Políticas",
      node: (
        <div className="space-y-6">
          {project.startupProfile.policyShares && (
            <div>
              <p className="eyebrow mb-3">Política de acciones</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.startupProfile.policyShares}
              </p>
            </div>
          )}
          {project.startupProfile.policyDividends && (
            <div>
              <p className="eyebrow mb-3">Política de dividendos</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.startupProfile.policyDividends}
              </p>
            </div>
          )}
          {project.startupProfile.dividendsFrequency && (
            <div>
              <p className="eyebrow mb-3">Frecuencia de dividendos</p>
              <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                {project.startupProfile.dividendsFrequency}
              </p>
            </div>
          )}
        </div>
      ),
    });
  }

  // Equipo: información sensible. Lo ocultamos al rol PARTNER (que no es
  // owner / co-admin / admin del proyecto). El founder / co-admin / admin
  // sí lo ven.
  const canSeeTeam = access.role !== "PARTNER";

  if (canSeeTeam && (project.startupProfile?.founders.length ?? 0) > 0) {
    sections.push({
      title: "Equipo",
      node: (
        <ul className="space-y-6">
          {project.startupProfile!.founders.map((f) => (
            <li key={f.id} className="space-y-3">
              <div className="grid grid-cols-12 items-baseline gap-3">
                <span className="col-span-12 sm:col-span-6 text-navy break-words">
                  {f.fullName}
                </span>
                <span className="col-span-6 sm:col-span-3 eyebrow">
                  {f.role}
                </span>
                <span className="col-span-6 sm:col-span-3 font-mono text-navy text-right">
                  {formatPercent(Number(f.equityPercent))}
                </span>
              </div>
              {f.bio && (
                <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                  {f.bio}
                </p>
              )}
              {f.references && (
                <div>
                  <p className="eyebrow mb-1">Referencias</p>
                  <p className="text-navy/85 leading-relaxed whitespace-pre-line">
                    {f.references}
                  </p>
                </div>
              )}
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
              className="grid grid-cols-12 items-baseline gap-3"
            >
              <span className="col-span-12 sm:col-span-6 text-navy">
                {m.title}
              </span>
              <span className="col-span-6 sm:col-span-3 eyebrow !text-navy">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-line lg:grid-cols-4">
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

  // Gating de Documentos / Reportes:
  //  - Owner / Co-admin / Admin: siempre ven.
  //  - PARTNER: ve solo si tiene InfoRequest APPROVED o ya es socio (myShares > 0).
  //  - VIEWER (otros roles autenticados sin participación): tratamos como PARTNER
  //    sin solicitud — no ve. El founder controla el acceso a info sensible.
  const isPrivilegedReader =
    access.role === "OWNER" ||
    access.role === "CO_ADMIN" ||
    access.role === "ADMIN";
  const canSeePrivateDocs =
    isPrivilegedReader || partnerHasApprovedInfo || myShares > 0;

  if (
    canSeePrivateDocs &&
    (project.startupProfile?.pitchDeckStorageKey ||
      project.startupProfile?.dataRoomStorageKey ||
      project.startupProfile?.projectionsUrl ||
      project.startupProfile?.planNegociosUrl ||
      project.startupProfile?.estrategiasPeriodicasUrl ||
      project.startupProfile?.estadosFinancierosUrl ||
      project.startupProfile?.estrategiaEmisionUrl)
  ) {
    sections.push({
      title: "Documentos",
      node: (
        <ul className="space-y-4">
          {project.startupProfile.pitchDeckStorageKey && (
            <li className="grid grid-cols-12 items-baseline gap-3">
              <span className="col-span-6 sm:col-span-9 text-navy">
                Pitch deck
              </span>
              <a
                href={project.startupProfile.pitchDeckStorageKey}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-6 sm:col-span-3 eyebrow hover:!text-gold text-right"
              >
                Abrir ↗
              </a>
            </li>
          )}
          {project.startupProfile.dataRoomStorageKey && (
            <li className="grid grid-cols-12 items-baseline gap-3">
              <span className="col-span-6 sm:col-span-9 text-navy">
                Data room
              </span>
              <a
                href={project.startupProfile.dataRoomStorageKey}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-6 sm:col-span-3 eyebrow hover:!text-gold text-right"
              >
                Abrir ↗
              </a>
            </li>
          )}
          {project.startupProfile.projectionsUrl && (
            <li className="grid grid-cols-12 items-baseline gap-3">
              <span className="col-span-6 sm:col-span-9 text-navy">
                Proyecciones financieras
              </span>
              <a
                href={project.startupProfile.projectionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-6 sm:col-span-3 eyebrow hover:!text-gold text-right"
              >
                Abrir ↗
              </a>
            </li>
          )}
          {project.startupProfile.planNegociosUrl && (
            <li className="grid grid-cols-12 items-baseline gap-3">
              <span className="col-span-6 sm:col-span-9 text-navy">
                Plan de negocios
              </span>
              <a
                href={project.startupProfile.planNegociosUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-6 sm:col-span-3 eyebrow hover:!text-gold text-right"
              >
                Abrir ↗
              </a>
            </li>
          )}
          {project.startupProfile.estrategiasPeriodicasUrl && (
            <li className="grid grid-cols-12 items-baseline gap-3">
              <span className="col-span-6 sm:col-span-9 text-navy">
                Objetivos y estrategias periódicas
              </span>
              <a
                href={project.startupProfile.estrategiasPeriodicasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-6 sm:col-span-3 eyebrow hover:!text-gold text-right"
              >
                Abrir ↗
              </a>
            </li>
          )}
          {project.startupProfile.estadosFinancierosUrl && (
            <li className="grid grid-cols-12 items-baseline gap-3">
              <span className="col-span-6 sm:col-span-9 text-navy">
                Estados financieros trimestrales
              </span>
              <a
                href={project.startupProfile.estadosFinancierosUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-6 sm:col-span-3 eyebrow hover:!text-gold text-right"
              >
                Abrir ↗
              </a>
            </li>
          )}
          {project.startupProfile.estrategiaEmisionUrl && (
            <li className="grid grid-cols-12 items-baseline gap-3">
              <span className="col-span-6 sm:col-span-9 text-navy">
                Estrategia de emisión
              </span>
              <a
                href={project.startupProfile.estrategiaEmisionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-6 sm:col-span-3 eyebrow hover:!text-gold text-right"
              >
                Abrir ↗
              </a>
            </li>
          )}
        </ul>
      ),
    });
  }

  if (canSeePrivateDocs && reports.length > 0) {
    sections.push({
      title: "Reportes",
      node: (
        <ul className="space-y-4">
          {reports.map((r) => (
            <li key={r.id} className="grid grid-cols-12 items-baseline gap-x-3 gap-y-1">
              <span className="col-span-12 sm:col-span-6 text-navy break-words">
                {r.title}
              </span>
              <span className="col-span-6 sm:col-span-3 eyebrow !text-navy">
                {REPORT_KIND_LABEL[r.kind] ?? r.kind} ·{" "}
                {humanReportPeriod(r.period, r.fiscalYear)}
              </span>
              <span className="col-span-6 sm:col-span-2 eyebrow text-right">
                {formatDate(r.publishedAt)}
              </span>
              <a
                href={r.storageKey}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-12 sm:col-span-1 eyebrow hover:!text-gold text-right"
              >
                Abrir ↗
              </a>
              {r.summary.trim().length > 0 && (
                <p className="col-span-12 text-navy/75 text-sm leading-relaxed whitespace-pre-line">
                  {r.summary}
                </p>
              )}
            </li>
          ))}
        </ul>
      ),
    });
  }

  if (access.canSeeCapTable && capTable.length > 0) {
    sections.push({
      title: "Cap table",
      node: (
        <ul className="space-y-4">
          {capTable.map((r, i) => (
            <li
              key={i}
              className="grid grid-cols-12 items-baseline gap-3"
            >
              <span className="col-span-12 sm:col-span-6 text-navy break-words">
                {r.holder}
                {r.isPlatform && <span className="ml-2 text-gold">◆</span>}
              </span>
              <span className="col-span-12 sm:col-span-6 font-mono text-navy text-right">
                {formatNumber(r.shares)} de {formatNumber(totalShares)}
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
            {KIND_LABEL[project.kind] ?? project.kind}
            {project.startupProfile?.sector ? ` · ${project.startupProfile.sector}` : ""}
            {project.startupProfile?.stage && (() => {
              const stageKey = project.startupProfile.stage;
              const info = STAGE_INFO[stageKey];
              return (
                <>
                  {" · "}
                  {STAGE_LABEL[stageKey]}
                  {info && <InfoTooltip text={info} />}
                </>
              );
            })()}
            {project.startupProfile?.location ? ` · ${project.startupProfile.location}` : ""}
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
          {/* Chat del proyecto: visible para miembros asignados (myShares > 0)
              y privilegiados (owner / co-admin / admin). Lo dejamos como link
              eyebrow para no competir con los CTAs principales del header. */}
          {(myShares > 0 ||
            access.role === "OWNER" ||
            access.role === "CO_ADMIN" ||
            access.role === "ADMIN") && (
            <Link
              href={`/proyectos/${project.slug}/chat` as Route}
              className="eyebrow hover:!text-gold self-end sm:self-center"
            >
              Abrir chat →
            </Link>
          )}
          {/* Flujo de 2 etapas para rol PARTNER:
              - sin InfoRequest o REJECTED → "Quiero más información"
              - APPROVED → "Me interesa participar"
              Otros roles autenticados (VIEWER) van directo al InterestForm como antes. */}
          {access.canManifestInterest && availableShares > 0 && (
            <>
              {access.role === "PARTNER" ? (
                myInfoRequest?.status === "PENDING" ? (
                  <span className="eyebrow !text-navy/60">
                    Solicitud enviada — esperando aprobación
                  </span>
                ) : myInfoRequest?.status === "APPROVED" ? (
                  <a href="#comprar" className="btn-primary text-center">
                    Me interesa participar →
                  </a>
                ) : (
                  <a href="#info-request" className="btn-primary text-center">
                    Quiero más información →
                  </a>
                )
              ) : (
                <a href="#comprar" className="btn-primary text-center">
                  Me interesa participar →
                </a>
              )}
            </>
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

      {/* PARTNER con InfoRequest REJECTED: mensaje visible debajo del header. */}
      {access.role === "PARTNER" && myInfoRequest?.status === "REJECTED" && (
        <div className="mt-5 hairline p-4 bg-paper-light">
          <p className="eyebrow">Solicitud no aprobada</p>
          {myInfoRequest.reviewNote && (
            <p className="mt-2 text-navy/75 leading-relaxed whitespace-pre-line text-sm">
              {myInfoRequest.reviewNote}
            </p>
          )}
        </div>
      )}

      {/* Video del proyecto: visible para cualquier viewer con canView. */}
      {project.startupProfile?.videoUrl && (() => {
        const embed = embedUrl(project.startupProfile.videoUrl);
        if (embed) {
          return (
            <div className="mt-6">
              <div className="hairline relative" style={{ paddingTop: "56.25%" }}>
                <iframe
                  src={embed}
                  title={`Video — ${project.name}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </div>
          );
        }
        return (
          <p className="mt-6">
            <a
              href={project.startupProfile.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="eyebrow hover:!text-gold"
            >
              Ver video ↗
            </a>
          </p>
        );
      })()}

      {/* Panel de moderación: admin viendo un proyecto PENDING_APPROVAL */}
      {access.role === "ADMIN" && project.status === "PENDING_APPROVAL" && (
        <div className="mt-5">
          <AdminApprovalActions projectSlug={project.slug} />
        </div>
      )}

      {/* Ancla sin padding: si el form está cerrado (null) no deja hueco.
          El espaciado lo aporta el propio form cuando se abre. */}
      {access.canManifestInterest && availableShares > 0 && (
        <>
          {/* PARTNER sin InfoRequest aprobada: mini-form de etapa 1. */}
          {access.role === "PARTNER" && !partnerHasApprovedInfo && (
            <div id="info-request">
              <InfoRequestForm
                projectSlug={project.slug}
                projectName={project.name}
                viewerName={user.name}
              />
            </div>
          )}

          {/* InterestForm (etapa 2 / flujo directo para VIEWER). Solo se
              muestra si el rol no es PARTNER, o si el PARTNER ya tiene la
              InfoRequest APPROVED. Si no, el botón "Me interesa participar"
              ni siquiera aparece (ver header). */}
          {(access.role !== "PARTNER" || partnerHasApprovedInfo) && (
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
        </>
      )}

      {/* Cuerpo del proyecto: scroll único, los bloques fluyen. Se oculta
          entero en modo foco (#comprar / #info-request) para no distraer al
          completar el form. */}
      {sections.length > 0 && (
        <ProjectBody hideOnHash={["#comprar", "#info-request"]}>
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
