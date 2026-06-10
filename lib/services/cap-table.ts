/**
 * Cap table unificado — ÚNICA fuente de verdad del % de cada socio.
 *
 * Antes el "%" vivía en dos lados que no se hablaban:
 *  - el equity del equipo fundador (Founder.equityPercent, declarado a mano), y
 *  - el cap table de participaciones (pool AVAILABLE + asignados + plataforma).
 * El equipo decía poseer 62% pero eso no descontaba del pool → desfase.
 *
 * `computeCapTable` junta TODO en participaciones sobre `totalShares` = 100%:
 *   equipo fundador (equity% → participaciones) + tenencias externas +
 *   stake de plataforma + asignados vía AJDUT + pool disponible (remanente).
 *
 * El pool YA NO se setea libre: es `total − comprometido`. Si lo comprometido
 * supera el total, `overcommit = true` (proyectos legacy descuadrados) y la UI
 * lo marca en rojo para que el project owner lo corrija. Las validaciones de
 * escritura (equipo / composición) usan `committedSharesExcluding*` para
 * rechazar cambios que pasen el 100%.
 */

export type CapTableFounderInput = {
  name: string;
  /** equity % de la empresa (0-100). Se convierte a participaciones. */
  equityPercent: number;
};

export type CapTableExternalInput = {
  label: string;
  shareCount: number;
};

export type CapTableParticipationInput = {
  status: string;
  shareCount: number;
  isPlatformStake: boolean;
  currentOwner: { id: string; alias: string | null; fullName: string } | null;
};

export type CapTableInput = {
  totalShares: number;
  founders: CapTableFounderInput[];
  externalHoldings: CapTableExternalInput[];
  participations: CapTableParticipationInput[];
};

export type CapTableRowKind =
  | "founder"
  | "external"
  | "platform"
  | "holder"
  | "pool";

export type CapTableRow = {
  key: string;
  name: string;
  shares: number;
  /** % sobre totalShares. */
  pct: number;
  kind: CapTableRowKind;
};

export type CapTable = {
  totalShares: number;
  rows: CapTableRow[];
  founderShares: number;
  externalShares: number;
  platformShares: number;
  assignedShares: number;
  /** founders + externas + plataforma + asignados (todo lo NO disponible). */
  committedShares: number;
  /** total − committed, nunca negativo. 0 si está sobre-comprometido. */
  poolShares: number;
  /** % de verificación: (committed + pool) / total, o committed/total si overcommit. */
  verificationPct: number;
  /** committed > total → el cap table excede el 100%. */
  overcommit: boolean;
};

/** Estados de participación que cuentan como "asignado" (no disponible, no pool). */
const ASSIGNED_STATUSES = ["ASSIGNED", "IN_RESALE", "TRANSFER_PENDING", "IN_NEGOTIATION"];

/** equity% → participaciones, redondeado al entero más cercano. */
export function equityPercentToShares(equityPercent: number, totalShares: number): number {
  if (totalShares <= 0) return 0;
  return Math.round((equityPercent / 100) * totalShares);
}

/**
 * Suma de participaciones comprometidas (founders + externas + plataforma +
 * asignados) EXCLUYENDO una de las fuentes. Útil para validar en escritura:
 * p.ej. al editar el equipo, `committedSharesExcluding(input, "founder")` da
 * lo comprometido por el resto, y el nuevo equipo no puede superar
 * `total − eso`.
 */
export function capTableCommittedExcluding(
  input: CapTableInput,
  exclude: "founder" | "external"
): number {
  const ct = computeCapTable(input);
  if (exclude === "founder") {
    return ct.externalShares + ct.platformShares + ct.assignedShares;
  }
  return ct.founderShares + ct.platformShares + ct.assignedShares;
}

export function computeCapTable(input: CapTableInput): CapTable {
  const total = Math.max(0, input.totalShares);

  // 1. Equipo fundador (equity% → participaciones). Solo founders con equity > 0.
  const founderRows: CapTableRow[] = input.founders
    .filter((f) => f.equityPercent > 0)
    .map((f, i) => {
      const shares = equityPercentToShares(f.equityPercent, total);
      return {
        key: `founder-${i}`,
        name: f.name,
        shares,
        pct: total > 0 ? (shares / total) * 100 : 0,
        kind: "founder" as const,
      };
    })
    .filter((r) => r.shares > 0);
  const founderShares = founderRows.reduce((s, r) => s + r.shares, 0);

  // 2. Tenencias externas (pre-AJDUT) — ya en participaciones.
  const externalRows: CapTableRow[] = input.externalHoldings
    .filter((h) => h.shareCount > 0)
    .map((h, i) => ({
      key: `external-${i}`,
      name: h.label,
      shares: h.shareCount,
      pct: total > 0 ? (h.shareCount / total) * 100 : 0,
      kind: "external" as const,
    }));
  const externalShares = externalRows.reduce((s, r) => s + r.shares, 0);

  // 3. Stake institucional de plataforma.
  const platformShares = input.participations
    .filter((p) => p.isPlatformStake)
    .reduce((s, p) => s + p.shareCount, 0);

  // 4. Asignados vía AJDUT — agrupados por holder.
  const holderMap = new Map<string, { name: string; shares: number }>();
  for (const p of input.participations) {
    if (p.isPlatformStake) continue;
    if (p.status === "AVAILABLE") continue;
    if (!ASSIGNED_STATUSES.includes(p.status)) continue;
    if (!p.currentOwner) continue;
    const key = p.currentOwner.id;
    const name = p.currentOwner.alias ?? p.currentOwner.fullName;
    const prev = holderMap.get(key);
    holderMap.set(key, { name, shares: (prev?.shares ?? 0) + p.shareCount });
  }
  const holderRows: CapTableRow[] = Array.from(holderMap.entries()).map(
    ([id, h]) => ({
      key: `holder-${id}`,
      name: h.name,
      shares: h.shares,
      pct: total > 0 ? (h.shares / total) * 100 : 0,
      kind: "holder" as const,
    })
  );
  const assignedShares = holderRows.reduce((s, r) => s + r.shares, 0);

  // 5. Pool disponible = remanente.
  const committedShares = founderShares + externalShares + platformShares + assignedShares;
  const poolShares = Math.max(0, total - committedShares);
  const overcommit = committedShares > total;

  const rows: CapTableRow[] = [];
  if (poolShares > 0) {
    rows.push({
      key: "pool",
      name: "__pool__", // la UI reemplaza por el label traducido
      shares: poolShares,
      pct: total > 0 ? (poolShares / total) * 100 : 0,
      kind: "pool",
    });
  }
  if (platformShares > 0) {
    rows.push({
      key: "platform",
      name: "__platform__",
      shares: platformShares,
      pct: total > 0 ? (platformShares / total) * 100 : 0,
      kind: "platform",
    });
  }
  rows.push(...founderRows, ...externalRows, ...holderRows);

  const verificationShares = overcommit ? committedShares : committedShares + poolShares;
  const verificationPct = total > 0 ? (verificationShares / total) * 100 : 0;

  return {
    totalShares: total,
    rows,
    founderShares,
    externalShares,
    platformShares,
    assignedShares,
    committedShares,
    poolShares,
    verificationPct,
    overcommit,
  };
}
