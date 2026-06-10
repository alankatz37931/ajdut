import { describe, it, expect } from "vitest";
import {
  vestedEquityPercent,
  equityPercentToShares,
  computeCapTable,
  computeCapTableByClass,
} from "@/lib/services/cap-table";

describe("vestedEquityPercent — entrega gradual (inicial + mensual + final)", () => {
  const start = new Date("2026-01-15T00:00:00Z");

  it("sin programación (months null) → entrega TODO de una", () => {
    expect(vestedEquityPercent(30, null, null, new Date("2026-06-01"))).toBe(30);
    expect(vestedEquityPercent(30, 0, start, new Date("2026-06-01"))).toBe(30);
  });

  it("ejemplo del cliente: 2% inicial + resto en 24m + 2% final (total 10%)", () => {
    // total 10, inicial 2, final 2 → mensual = 6 repartido en 24 meses.
    // En el inicio (mes 0): solo el inicial = 2.
    expect(
      vestedEquityPercent(10, 24, start, new Date("2026-01-15"), 2, 2)
    ).toBeCloseTo(2, 5);
    // A los 12 meses: 2 (inicial) + 6 × 12/24 = 2 + 3 = 5.
    expect(
      vestedEquityPercent(10, 24, start, new Date("2027-01-15"), 2, 2)
    ).toBeCloseTo(5, 5);
    // A los 24 meses (completo): 2 + 6 + 2 = 10.
    expect(
      vestedEquityPercent(10, 24, start, new Date("2028-01-15"), 2, 2)
    ).toBeCloseTo(10, 5);
  });

  it("el final solo se entrega al completar los N meses", () => {
    // A los 23 meses: 2 + 6×23/24 = 2 + 5.75 = 7.75 (sin el final todavía).
    expect(
      vestedEquityPercent(10, 24, start, new Date("2027-12-15"), 2, 2)
    ).toBeCloseTo(7.75, 2);
  });

  it("sin inicial/final (0/0) → lineal puro sobre N meses", () => {
    // 30% en 12 meses, a los 6 meses → 15.
    expect(vestedEquityPercent(30, 12, start, new Date("2026-07-15"), 0, 0)).toBeCloseTo(15, 5);
    // En el inicio → 0 (no hay inicial).
    expect(vestedEquityPercent(30, 12, start, new Date("2026-01-15"), 0, 0)).toBeCloseTo(0, 5);
  });

  it("pasado el final → entrega completa, no supera el target", () => {
    expect(vestedEquityPercent(30, 12, start, new Date("2030-01-01"), 5, 5)).toBe(30);
  });
});

describe("computeCapTable — reservado por vesting bloquea el pool", () => {
  it("el reservado descuenta del pool y suma a committed", () => {
    // total 1000. Socio con 30% pero solo 10% entregado → 100 vested, 200 reservado.
    const ct = computeCapTable({
      totalShares: 1000,
      founders: [{ name: "Niv", equityPercent: 10 }], // vested ya calculado por el caller
      externalHoldings: [],
      participations: [],
      reservedShares: 200, // 30% target - 10% vested = 20% = 200 part.
    });
    expect(ct.founderShares).toBe(100); // 10% vested
    expect(ct.reservedShares).toBe(200);
    expect(ct.committedShares).toBe(300); // 100 vested + 200 reservado
    expect(ct.poolShares).toBe(700); // 1000 - 300
    // El reservado aparece como fila propia.
    const reservedRow = ct.rows.find((r) => r.kind === "reserved");
    expect(reservedRow?.shares).toBe(200);
  });

  it("sin reservado: pool = total - founders", () => {
    const ct = computeCapTable({
      totalShares: 1000,
      founders: [{ name: "A", equityPercent: 30 }],
      externalHoldings: [],
      participations: [],
    });
    expect(ct.reservedShares).toBe(0);
    expect(ct.poolShares).toBe(700);
    expect(ct.rows.some((r) => r.kind === "reserved")).toBe(false);
  });

  it("equityPercentToShares redondea al entero", () => {
    expect(equityPercentToShares(10, 1000)).toBe(100);
    expect(equityPercentToShares(33.33, 1000)).toBe(333);
  });
});

describe("computeCapTableByClass — el reservado es fila propia", () => {
  it("incluye una fila reserved cuando hay reservedShares", () => {
    const byClass = computeCapTableByClass(
      {
        totalShares: 1000,
        founders: [{ name: "A", equityPercent: 10, classId: "c1" }],
        externalHoldings: [],
        participations: [],
        reservedShares: 200,
      },
      [{ id: "c1", name: "Directivo" }]
    );
    const reservedRow = byClass.rows.find((r) => r.kind === "reserved");
    expect(reservedRow?.shares).toBe(200);
    // La clase Directivo suma el vested del founder (100).
    const classRow = byClass.rows.find((r) => r.kind === "class");
    expect(classRow?.name).toBe("Directivo");
    expect(classRow?.shares).toBe(100);
    expect(byClass.poolShares).toBe(700);
  });
});
