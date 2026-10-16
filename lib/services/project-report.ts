/**
 * Reporte trimestral auto-generado.
 *
 * Junta la "foto de la empresa" (perfil + cap table + equipo) con "lo que pasó
 * en los últimos 3 meses" (métricas, hitos logrados, nuevos socios, dividendos,
 * reportes subidos). Se consume desde la ruta de impresión `/panel-print/[slug]`
 * que lo renderiza como PDF. NO persiste nada: se arma al vuelo con lo cargado.
 *
 * Los helpers de ventaneo/series son PUROS (sin Prisma) para poder testearlos.
 */
import { prisma } from "@/lib/db/client";
import { computeCapTableByClass } from "./cap-table";
import { buildCapTableInput } from "./project";

// ─── Ventana de tiempo ──────────────────────────────────────────────

export type ReportWindow = { from: Date; to: Date };

/** Últimos 3 meses: hoy − 3 meses → hoy. */
export function lastThreeMonthsWindow(now: Date = new Date()): ReportWindow {
  const to = new Date(now);
  const from = new Date(now);
  from.setMonth(from.getMonth() - 3);
  return { from, to };
}

/** ¿La fecha cae dentro de [from, to] (inclusive)? */
export function inWindow(d: Date, w: ReportWindow): boolean {
  const t = d.getTime();
  return t >= w.from.getTime() && t <= w.to.getTime();
}

// ─── Series de métricas ─────────────────────────────────────────────

export type MetricInput = {
  kind: string;
  customLabel: string | null;
  unit: string;
  value: number;
  asOf: Date;
};

export type MetricSeries = {
  key: string;
  kind: string;
  /** Etiqueta a mostrar: customLabel para CUSTOM, si no el kind. */
  label: string;
  unit: string;
  /** Valores ordenados cronológicamente (ascendente por fecha). */
  values: number[];
  latest: number;
  first: number;
  /** Variación % del primer al último punto de la ventana. Null si first = 0. */
  deltaPct: number | null;
};

/**
 * Agrupa mediciones (ya filtradas a la ventana) en una serie por métrica.
 * CUSTOM se agrupa por customLabel; el resto por kind. Orden: más puntos primero.
 */
export function buildMetricSeries(metrics: MetricInput[]): MetricSeries[] {
  const groups = new Map<string, MetricInput[]>();
  for (const m of metrics) {
    const key = m.kind === "CUSTOM" ? `CUSTOM:${m.customLabel ?? ""}` : m.kind;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }

  const series: MetricSeries[] = [];
  for (const [key, arr] of groups) {
    const sorted = [...arr].sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
    const values = sorted.map((m) => m.value);
    const first = values[0] ?? 0;
    const latest = values[values.length - 1] ?? 0;
    const deltaPct = first !== 0 ? ((latest - first) / Math.abs(first)) * 100 : null;
    const head = arr[0]!;
    series.push({
      key,
      kind: head.kind,
      label: head.kind === "CUSTOM" ? head.customLabel || "Métrica" : head.kind,
      unit: head.unit,
      values,
      latest,
      first,
      deltaPct,
    });
  }

  return series.sort(
    (a, b) => b.values.length - a.values.length || a.label.localeCompare(b.label)
  );
}

// ─── Reporte completo ───────────────────────────────────────────────

export type CapRow = { name: string; shares: number; kind: string };

export type ProjectReportData = {
  ownerId: string;
  project: {
    name: string;
    slug: string;
    kind: string;
    status: string;
    oneLiner: string;
    description: string;
    sector: string | null;
    stage: string | null;
    location: string | null;
    valuation: number | null;
    currency: string;
    totalShares: number;
  };
  window: { from: string; to: string };
  capTable: {
    totalShares: number;
    poolShares: number;
    committedShares: number;
    rows: CapRow[];
  };
  team: { name: string; role: string; equityPercent: number }[];
  metrics: MetricSeries[];
  milestones: { title: string; achievedAt: string }[];
  newHolders: { count: number; shares: number };
  dividends: { title: string; totalAmount: number; currency: string; recordDate: string }[];
  uploadedDocs: { title: string; createdAt: string }[];
  generatedAt: string;
};

/**
 * Arma el reporte del proyecto para la ventana de los últimos 3 meses.
 * Devuelve null si el proyecto no existe o está soft-deleted.
 */
export async function getProjectReport(
  slug: string,
  now: Date = new Date()
): Promise<ProjectReportData | null> {
  const win = lastThreeMonthsWindow(now);

  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      startupProfile: {
        include: {
          founders: {
            where: { isActive: true },
            orderBy: [{ equityPercent: "desc" }],
          },
          metrics: { orderBy: { asOf: "asc" } },
          milestones: { orderBy: { createdAt: "desc" } },
        },
      },
      participations: {
        include: {
          currentOwner: { select: { id: true, alias: true, fullName: true } },
        },
      },
      externalHoldings: true,
      shareholderClasses: { orderBy: { order: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      distributions: { orderBy: { recordDate: "desc" } },
    },
  });

  if (!project || project.deletedAt) return null;

  const sp = project.startupProfile;

  // Cap table por clase — reusa la lógica unificada (misma que la ficha).
  const byClass = computeCapTableByClass(
    buildCapTableInput(project),
    project.shareholderClasses
      .filter((c) => c.kind)
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
  );

  // Métricas registradas dentro de la ventana.
  const metricsInWindow: MetricInput[] = (sp?.metrics ?? [])
    .filter((m) => inWindow(m.asOf, win))
    .map((m) => ({
      kind: m.kind,
      customLabel: m.customLabel,
      unit: m.unit,
      value: Number(m.value),
      asOf: m.asOf,
    }));

  // Hitos logrados en la ventana.
  const milestones = (sp?.milestones ?? [])
    .filter((m) => m.status === "ACHIEVED" && m.achievedAt && inWindow(m.achievedAt, win))
    .map((m) => ({ title: m.title, achievedAt: m.achievedAt!.toISOString() }));

  // Nuevos socios: participaciones adquiridas en la ventana (excluye el pool).
  const newParts = project.participations.filter(
    (p) => p.acquiredAt && inWindow(p.acquiredAt, win) && p.status !== "AVAILABLE"
  );
  const newHolders = {
    count: new Set(
      newParts.map((p) => p.currentOwnerId).filter((id): id is string => !!id)
    ).size,
    shares: newParts.reduce((s, p) => s + p.shareCount, 0),
  };

  // Dividendos con fecha de registro en la ventana.
  const dividends = project.distributions
    .filter((d) => inWindow(d.recordDate, win))
    .map((d) => ({
      title: d.title,
      totalAmount: Number(d.totalAmount),
      currency: d.currency,
      recordDate: d.recordDate.toISOString(),
    }));

  // Reportes/documentos subidos en la ventana.
  const uploadedDocs = project.documents
    .filter((d) => inWindow(d.createdAt, win))
    .map((d) => ({ title: d.title, createdAt: d.createdAt.toISOString() }));

  return {
    ownerId: project.ownerId,
    project: {
      name: project.name,
      slug: project.slug,
      kind: project.kind,
      status: project.status,
      oneLiner: sp?.oneLiner ?? project.shortPitch,
      description: project.description,
      sector: sp?.sector ?? null,
      stage: sp?.stage ?? null,
      location: sp?.location ?? null,
      valuation: sp?.preMoneyValuation != null ? Number(sp.preMoneyValuation) : null,
      currency: sp?.valuationCurrency ?? "USD",
      totalShares: project.totalShares,
    },
    window: { from: win.from.toISOString(), to: win.to.toISOString() },
    capTable: {
      totalShares: project.totalShares,
      poolShares: byClass.poolShares,
      committedShares: byClass.committedShares,
      rows: byClass.rows
        .filter((r) => r.kind !== "platform")
        .map((r) => ({ name: r.name, shares: r.shares, kind: r.kind })),
    },
    team: (sp?.founders ?? []).map((f) => ({
      name: f.fullName,
      role: f.role,
      equityPercent: Number(f.equityPercent),
    })),
    metrics: buildMetricSeries(metricsInWindow),
    milestones,
    newHolders,
    dividends,
    uploadedDocs,
    generatedAt: now.toISOString(),
  };
}
