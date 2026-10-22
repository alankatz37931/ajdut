import { describe, it, expect } from "vitest";
import {
  buildParticipationExportRows,
  type ExportProject,
} from "@/lib/services/participations-export";

const owner = (id: string, fullName: string) => ({ id, fullName });

describe("buildParticipationExportRows", () => {
  it("una fila por persona-proyecto, sumando varias participaciones de la misma persona", () => {
    const projects: ExportProject[] = [
      {
        name: "Niv",
        participations: [
          { shareCount: 100, isPlatformStake: false, currentOwner: owner("u1", "Ana") },
          { shareCount: 50, isPlatformStake: false, currentOwner: owner("u1", "Ana") },
          { shareCount: 200, isPlatformStake: false, currentOwner: owner("u2", "Beto") },
        ],
      },
    ];
    const rows = buildParticipationExportRows(projects);
    expect(rows).toEqual([
      { projectName: "Niv", personName: "Ana", shares: 150 },
      { projectName: "Niv", personName: "Beto", shares: 200 },
    ]);
  });

  it("excluye el pool disponible (sin dueño) y el stake institucional de plataforma", () => {
    const projects: ExportProject[] = [
      {
        name: "Proyecto X",
        participations: [
          { shareCount: 1000, isPlatformStake: false, currentOwner: null }, // pool
          { shareCount: 500, isPlatformStake: true, currentOwner: owner("plat", "AJDUT") }, // plataforma
          { shareCount: 300, isPlatformStake: false, currentOwner: owner("u1", "Ana") },
        ],
      },
    ];
    const rows = buildParticipationExportRows(projects);
    expect(rows).toEqual([{ projectName: "Proyecto X", personName: "Ana", shares: 300 }]);
  });

  it("agrupa por id, no por nombre (dos personas con el mismo nombre = dos filas)", () => {
    const projects: ExportProject[] = [
      {
        name: "P",
        participations: [
          { shareCount: 10, isPlatformStake: false, currentOwner: owner("u1", "Juan Pérez") },
          { shareCount: 20, isPlatformStake: false, currentOwner: owner("u2", "Juan Pérez") },
        ],
      },
    ];
    const rows = buildParticipationExportRows(projects);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.personName === "Juan Pérez")).toBe(true);
    expect(rows.map((r) => r.shares).sort()).toEqual([10, 20]);
  });

  it("ordena por proyecto y luego por persona", () => {
    const projects: ExportProject[] = [
      {
        name: "Zeta",
        participations: [
          { shareCount: 5, isPlatformStake: false, currentOwner: owner("u1", "Ana") },
        ],
      },
      {
        name: "Alfa",
        participations: [
          { shareCount: 5, isPlatformStake: false, currentOwner: owner("u3", "Carlos") },
          { shareCount: 5, isPlatformStake: false, currentOwner: owner("u2", "Ana") },
        ],
      },
    ];
    const rows = buildParticipationExportRows(projects);
    expect(rows.map((r) => `${r.projectName}/${r.personName}`)).toEqual([
      "Alfa/Ana",
      "Alfa/Carlos",
      "Zeta/Ana",
    ]);
  });

  it("proyecto sin participaciones de personas → sin filas", () => {
    const projects: ExportProject[] = [
      {
        name: "Vacío",
        participations: [
          { shareCount: 1000, isPlatformStake: false, currentOwner: null },
        ],
      },
    ];
    expect(buildParticipationExportRows(projects)).toEqual([]);
  });
});
