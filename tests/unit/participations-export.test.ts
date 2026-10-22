import { describe, it, expect } from "vitest";
import {
  buildHoldingsExportRows,
  type ExportProject,
} from "@/lib/services/participations-export";

const owner = (id: string, fullName: string) => ({ id, fullName });

// Helper para armar un proyecto con defaults vacíos.
function project(partial: Partial<ExportProject> & { name: string }): ExportProject {
  return {
    totalShares: 10000,
    participations: [],
    founders: [],
    externalHoldings: [],
    ...partial,
  };
}

describe("buildHoldingsExportRows — participaciones", () => {
  it("una fila por persona, sumando varias participaciones de la misma persona", () => {
    const rows = buildHoldingsExportRows([
      project({
        name: "Niv",
        participations: [
          { shareCount: 100, isPlatformStake: false, currentOwner: owner("u1", "Ana") },
          { shareCount: 50, isPlatformStake: false, currentOwner: owner("u1", "Ana") },
          { shareCount: 200, isPlatformStake: false, currentOwner: owner("u2", "Beto") },
        ],
      }),
    ]);
    expect(rows).toEqual([
      { projectName: "Niv", personName: "Ana", type: "PARTICIPATION", shares: 150 },
      { projectName: "Niv", personName: "Beto", type: "PARTICIPATION", shares: 200 },
    ]);
  });

  it("excluye el pool disponible (sin dueño) y el stake institucional de plataforma", () => {
    const rows = buildHoldingsExportRows([
      project({
        name: "X",
        participations: [
          { shareCount: 1000, isPlatformStake: false, currentOwner: null },
          { shareCount: 500, isPlatformStake: true, currentOwner: owner("plat", "AJDUT") },
          { shareCount: 300, isPlatformStake: false, currentOwner: owner("u1", "Ana") },
        ],
      }),
    ]);
    expect(rows).toEqual([
      { projectName: "X", personName: "Ana", type: "PARTICIPATION", shares: 300 },
    ]);
  });
});

describe("buildHoldingsExportRows — fundadores", () => {
  it("convierte el equity% del fundador activo a acciones sobre el total", () => {
    const rows = buildHoldingsExportRows([
      project({
        name: "P",
        totalShares: 10000,
        founders: [
          { fullName: "Dani", equityPercent: 80, isActive: true }, // 80% de 10000 = 8000
          { fullName: "Inactivo", equityPercent: 10, isActive: false }, // excluido
        ],
      }),
    ]);
    expect(rows).toEqual([
      { projectName: "P", personName: "Dani", type: "FOUNDER", shares: 8000 },
    ]);
  });
});

describe("buildHoldingsExportRows — acciones previas (externas)", () => {
  it("incluye tenencias externas con su label y shareCount", () => {
    const rows = buildHoldingsExportRows([
      project({
        name: "P",
        externalHoldings: [
          { label: "Inversor ángel", shareCount: 500 },
          { label: null, shareCount: 300 }, // usa fallback
          { label: "  ", shareCount: 0 }, // 0 → excluido
        ],
      }),
    ]);
    expect(rows).toEqual([
      { projectName: "P", personName: "Inversor ángel", type: "EXTERNAL", shares: 500 },
      { projectName: "P", personName: "Pre-existente", type: "EXTERNAL", shares: 300 },
    ]);
  });
});

describe("buildHoldingsExportRows — combinado + orden", () => {
  it("incluye las tres fuentes y ordena por proyecto → tipo (fundador, previo, participación) → persona", () => {
    const rows = buildHoldingsExportRows([
      project({
        name: "Alfa",
        totalShares: 1000,
        participations: [
          { shareCount: 100, isPlatformStake: false, currentOwner: owner("u1", "Zoe") },
        ],
        founders: [{ fullName: "Fede", equityPercent: 50, isActive: true }], // 500
        externalHoldings: [{ label: "Previo", shareCount: 50 }],
      }),
    ]);
    expect(rows.map((r) => `${r.type}:${r.personName}:${r.shares}`)).toEqual([
      "FOUNDER:Fede:500",
      "EXTERNAL:Previo:50",
      "PARTICIPATION:Zoe:100",
    ]);
  });

  it("ordena por nombre de proyecto primero", () => {
    const rows = buildHoldingsExportRows([
      project({ name: "Zeta", founders: [{ fullName: "A", equityPercent: 10, isActive: true }], totalShares: 100 }),
      project({ name: "Alfa", founders: [{ fullName: "B", equityPercent: 10, isActive: true }], totalShares: 100 }),
    ]);
    expect(rows.map((r) => r.projectName)).toEqual(["Alfa", "Zeta"]);
  });
});
