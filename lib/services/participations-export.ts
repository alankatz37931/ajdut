/**
 * Aplanado de proyectos → participaciones por persona, para exportar a Excel.
 *
 * Una fila por (proyecto, persona) con la SUMA de participaciones que esa
 * persona tiene en ese proyecto. Se excluye:
 *   - el pool disponible (participaciones sin dueño), y
 *   - el stake institucional de plataforma (isPlatformStake) — no es una persona.
 *
 * La función es pura (sin Prisma) para poder testearla.
 */

export type ExportParticipation = {
  shareCount: number;
  isPlatformStake: boolean;
  currentOwner: { id: string; fullName: string } | null;
};

export type ExportProject = {
  name: string;
  participations: ExportParticipation[];
};

export type ExportRow = {
  projectName: string;
  personName: string;
  shares: number;
};

export function buildParticipationExportRows(
  projects: ExportProject[]
): ExportRow[] {
  const rows: ExportRow[] = [];

  for (const project of projects) {
    // Agrupa por persona (por id, para no colisionar nombres repetidos).
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
      rows.push({ projectName: project.name, personName: name, shares });
    }
  }

  // Orden estable: por proyecto, luego por persona.
  return rows.sort(
    (a, b) =>
      a.projectName.localeCompare(b.projectName) ||
      a.personName.localeCompare(b.personName)
  );
}
