/**
 * Aplanado de proyectos → tenencias por persona, para exportar a Excel.
 *
 * Incluye las TRES fuentes de tenencia del proyecto, una fila por cada una:
 *   - PARTICIPATION: participaciones asignadas (Participation.shareCount),
 *     agrupadas y sumadas por persona.
 *   - FOUNDER: equity del equipo fundador (Founder.equityPercent → acciones
 *     sobre totalShares). Solo fundadores activos.
 *   - EXTERNAL: "acciones previas" = tenencias externas pre-existentes
 *     (ExternalHolding.shareCount), declaradas por el project owner.
 *
 * Se excluye el pool disponible (sin dueño) y el stake institucional de
 * plataforma (isPlatformStake) — no son personas.
 *
 * Nota: founders y participaciones son dos sistemas de tenencia distintos
 * (equity% vs participaciones asignadas); por eso cada fila lleva su `type`
 * y NO se fusionan — el equity del fundador se cuenta una sola vez, como
 * fundador. La columna "Tipo" lo deja explícito en el Excel.
 *
 * La función es pura (sin Prisma) para poder testearla.
 */
import { equityPercentToShares } from "./cap-table";

export type HoldingType = "FOUNDER" | "EXTERNAL" | "PARTICIPATION";

export type ExportParticipation = {
  shareCount: number;
  isPlatformStake: boolean;
  currentOwner: { id: string; fullName: string } | null;
};

export type ExportFounder = {
  fullName: string;
  equityPercent: number;
  isActive: boolean;
};

export type ExportExternalHolding = {
  label: string | null;
  shareCount: number;
};

export type ExportProject = {
  name: string;
  totalShares: number;
  participations: ExportParticipation[];
  founders: ExportFounder[];
  externalHoldings: ExportExternalHolding[];
};

export type ExportRow = {
  projectName: string;
  personName: string;
  type: HoldingType;
  shares: number;
};

// Orden dentro de cada proyecto: fundadores, luego pre-existentes, luego
// participaciones asignadas.
const TYPE_RANK: Record<HoldingType, number> = {
  FOUNDER: 0,
  EXTERNAL: 1,
  PARTICIPATION: 2,
};

export function buildHoldingsExportRows(
  projects: ExportProject[],
  externalFallback = "Pre-existente"
): ExportRow[] {
  const rows: ExportRow[] = [];

  for (const project of projects) {
    // 1. Participaciones asignadas, agrupadas por persona (por id).
    const byPerson = new Map<string, { name: string; shares: number }>();
    for (const p of project.participations) {
      if (p.isPlatformStake) continue; // stake institucional, no es persona
      if (!p.currentOwner) continue; // pool disponible, sin dueño
      const existing = byPerson.get(p.currentOwner.id);
      if (existing) {
        existing.shares += p.shareCount;
      } else {
        byPerson.set(p.currentOwner.id, {
          name: p.currentOwner.fullName,
          shares: p.shareCount,
        });
      }
    }
    for (const { name, shares } of byPerson.values()) {
      if (shares > 0) {
        rows.push({ projectName: project.name, personName: name, type: "PARTICIPATION", shares });
      }
    }

    // 2. Fundadores activos: equity% → acciones sobre el total.
    for (const f of project.founders) {
      if (!f.isActive) continue;
      const shares = equityPercentToShares(f.equityPercent, project.totalShares);
      if (shares > 0) {
        rows.push({ projectName: project.name, personName: f.fullName, type: "FOUNDER", shares });
      }
    }

    // 3. Acciones previas (tenencias externas pre-existentes).
    for (const e of project.externalHoldings) {
      if (e.shareCount <= 0) continue;
      const name = e.label?.trim() || externalFallback;
      rows.push({ projectName: project.name, personName: name, type: "EXTERNAL", shares: e.shareCount });
    }
  }

  // Orden estable: proyecto, luego tipo (fundador/previo/participación), luego persona.
  return rows.sort(
    (a, b) =>
      a.projectName.localeCompare(b.projectName) ||
      TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
      a.personName.localeCompare(b.personName)
  );
}
