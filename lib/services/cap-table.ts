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
  /** Clase/tipo del founder (ShareholderClass.id). Null = sin clasificar. */
  classId?: string | null;
};

export type CapTableExternalInput = {
  label: string;
  shareCount: number;
  /** Cantidad de personas que representa esta tenencia (default 1). */
  peopleCount?: number;
  classId?: string | null;
};

export type CapTableParticipationInput = {
  status: string;
  shareCount: number;
  isPlatformStake: boolean;
  currentOwner: { id: string; alias: string | null; fullName: string } | null;
  classId?: string | null;
};

export type CapTableInput = {
  totalShares: number;
  founders: CapTableFounderInput[];
  externalHoldings: CapTableExternalInput[];
  participations: CapTableParticipationInput[];
  /** Participaciones comprometidas a socios con vesting pero AÚN NO entregadas.
   *  Quedan bloqueadas: descuentan del pool, no se pueden dar a otros. El
   *  caller (buildCapTableInput) las calcula como Σ(target − vested) de los
   *  founders con vesting activo. */
  reservedShares?: number;
};

export type CapTableRowKind =
  | "founder"
  | "external"
  | "platform"
  | "holder"
  | "pool"
  | "reserved";

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
  /** Reservado por vesting (comprometido a founders, no entregado). */
  reservedShares: number;
  /** founders + externas + plataforma + asignados + reservado (todo lo NO disponible). */
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

/** Meses enteros completos entre dos fechas (>= 0). */
function monthsBetween(from: Date, to: Date): number {
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) m -= 1; // todavía no completó el mes en curso
  return Math.max(0, m);
}

/**
 * Equity% efectivamente ENTREGADO de un socio a una fecha dada (entrega gradual).
 *
 * Sin programación (vestingMonths null/0 o sin fecha) → se entrega TODO de una
 * (= equityPercent). Con programación, el equity total se reparte así:
 *   · `initialPercent` → al inicio (mes 0, desde el primer momento).
 *   · el resto (total − inicial − final) → lineal en N meses.
 *   · `finalPercent` → al completar los N meses.
 * Es una función pura (recibe `now`), sin cron.
 */
export function vestedEquityPercent(
  equityPercent: number,
  vestingMonths: number | null | undefined,
  vestingStartAt: Date | null | undefined,
  now: Date,
  initialPercent?: number | null,
  finalPercent?: number | null
): number {
  if (!vestingMonths || vestingMonths <= 0 || !vestingStartAt) return equityPercent;
  if (now < vestingStartAt) return 0;
  const initial = Math.max(0, initialPercent ?? 0);
  const final = Math.max(0, finalPercent ?? 0);
  const monthly = Math.max(0, equityPercent - initial - final);
  const elapsed = monthsBetween(vestingStartAt, now); // 0 en el inicio
  // El % inicial se entrega desde el primer momento.
  let vested = initial;
  // Tramo mensual: lineal sobre los N meses.
  vested += (monthly * Math.min(elapsed, vestingMonths)) / vestingMonths;
  // % final: al completar el período.
  if (elapsed >= vestingMonths) vested += final;
  return Math.min(equityPercent, vested);
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
    // Al recomputar el equipo, lo reservado (vesting de founders) se recalcula
    // aparte → no lo contamos como "resto".
    return ct.externalShares + ct.platformShares + ct.assignedShares;
  }
  // Al recomputar externas, lo reservado por vesting SÍ es parte del resto
  // comprometido (es de los founders) y debe contar contra el tope.
  return ct.founderShares + ct.platformShares + ct.assignedShares + ct.reservedShares;
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

  // 5. Reservado por vesting (comprometido a founders, no entregado aún).
  const reservedShares = Math.max(0, input.reservedShares ?? 0);

  // 6. Pool disponible = remanente. Lo reservado también descuenta del pool.
  const committedShares =
    founderShares + externalShares + platformShares + assignedShares + reservedShares;
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
  if (reservedShares > 0) {
    rows.push({
      key: "reserved",
      name: "__reserved__",
      shares: reservedShares,
      pct: total > 0 ? (reservedShares / total) * 100 : 0,
      kind: "reserved",
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
    reservedShares,
    committedShares,
    poolShares,
    verificationPct,
    overcommit,
  };
}

// ─── Cap table AGRUPADO POR CLASE ───────────────────────────────────
//
// Misma matemática (pool = remanente, overcommit, verificación) pero las
// filas se agregan por clase/tipo de participación en vez de por holder
// individual. Cada clase suma founders + tenencias externas + asignados de
// esa clase. Lo que no tiene clase cae en "sin clasificar". Pool y plataforma
// son filas propias (no tienen clase).

export type CapTableClassRow = {
  key: string;
  /** Nombre de la clase, o sentinela "__pool__" / "__platform__" / "__uncl__". */
  name: string;
  shares: number;
  pct: number;
  /** Cantidad de personas en la clase (founders + holders distintos + externas).
   *  null para pool/plataforma/reservado. */
  people: number | null;
  kind: "pool" | "platform" | "class" | "unclassified" | "reserved";
};

export type CapTableByClass = {
  totalShares: number;
  rows: CapTableClassRow[];
  committedShares: number;
  poolShares: number;
  verificationPct: number;
  overcommit: boolean;
};

export function computeCapTableByClass(
  input: CapTableInput,
  classes: { id: string; name: string }[]
): CapTableByClass {
  const base = computeCapTable(input);
  const total = base.totalShares;

  const UNCL = "__uncl__";
  type Bucket = { name: string; shares: number; owners: Set<string>; extPeople: number; founderPeople: number };
  const buckets = new Map<string, Bucket>();
  for (const c of classes) {
    buckets.set(c.id, { name: c.name, shares: 0, owners: new Set(), extPeople: 0, founderPeople: 0 });
  }
  buckets.set(UNCL, { name: UNCL, shares: 0, owners: new Set(), extPeople: 0, founderPeople: 0 });

  const bucketFor = (classId: string | null | undefined): Bucket => {
    if (classId && buckets.has(classId)) return buckets.get(classId)!;
    return buckets.get(UNCL)!;
  };

  // Founders (equity% → participaciones).
  for (const f of input.founders) {
    if (f.equityPercent <= 0) continue;
    const shares = equityPercentToShares(f.equityPercent, total);
    if (shares <= 0) continue;
    const b = bucketFor(f.classId);
    b.shares += shares;
    b.founderPeople += 1;
  }
  // Tenencias externas.
  for (const h of input.externalHoldings) {
    if (h.shareCount <= 0) continue;
    const b = bucketFor(h.classId);
    b.shares += h.shareCount;
    b.extPeople += h.peopleCount ?? 1;
  }
  // Asignados vía AJDUT.
  for (const p of input.participations) {
    if (p.isPlatformStake) continue;
    if (p.status === "AVAILABLE") continue;
    if (!ASSIGNED_STATUSES.includes(p.status)) continue;
    if (!p.currentOwner) continue;
    const b = bucketFor(p.classId);
    b.shares += p.shareCount;
    b.owners.add(p.currentOwner.id);
  }

  const rows: CapTableClassRow[] = [];
  if (base.poolShares > 0) {
    rows.push({
      key: "pool",
      name: "__pool__",
      shares: base.poolShares,
      pct: total > 0 ? (base.poolShares / total) * 100 : 0,
      people: null,
      kind: "pool",
    });
  }
  if (base.reservedShares > 0) {
    rows.push({
      key: "reserved",
      name: "__reserved__",
      shares: base.reservedShares,
      pct: total > 0 ? (base.reservedShares / total) * 100 : 0,
      people: null,
      kind: "reserved",
    });
  }
  if (base.platformShares > 0) {
    rows.push({
      key: "platform",
      name: "__platform__",
      shares: base.platformShares,
      pct: total > 0 ? (base.platformShares / total) * 100 : 0,
      people: null,
      kind: "platform",
    });
  }
  for (const [id, b] of buckets) {
    const people = b.owners.size + b.extPeople + b.founderPeople;
    if (b.shares <= 0 && people <= 0) continue;
    rows.push({
      key: id,
      name: id === UNCL ? "__uncl__" : b.name,
      shares: b.shares,
      pct: total > 0 ? (b.shares / total) * 100 : 0,
      people,
      kind: id === UNCL ? "unclassified" : "class",
    });
  }

  return {
    totalShares: total,
    rows,
    committedShares: base.committedShares,
    poolShares: base.poolShares,
    verificationPct: base.verificationPct,
    overcommit: base.overcommit,
  };
}
