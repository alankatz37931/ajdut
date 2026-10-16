import { describe, it, expect } from "vitest";
import {
  lastThreeMonthsWindow,
  inWindow,
  buildMetricSeries,
  type MetricInput,
} from "@/lib/services/project-report";

describe("lastThreeMonthsWindow", () => {
  it("abarca exactamente 3 meses hacia atrás desde 'now'", () => {
    const now = new Date("2026-10-15T12:00:00.000Z");
    const w = lastThreeMonthsWindow(now);
    expect(w.to.toISOString()).toBe(now.toISOString());
    expect(w.from.toISOString()).toBe(new Date("2026-07-15T12:00:00.000Z").toISOString());
  });
});

describe("inWindow", () => {
  const w = lastThreeMonthsWindow(new Date("2026-10-15T12:00:00.000Z"));

  it("incluye fechas dentro del rango", () => {
    expect(inWindow(new Date("2026-08-01T00:00:00.000Z"), w)).toBe(true);
  });
  it("incluye los bordes (inclusive)", () => {
    expect(inWindow(w.from, w)).toBe(true);
    expect(inWindow(w.to, w)).toBe(true);
  });
  it("excluye fechas previas a la ventana", () => {
    expect(inWindow(new Date("2026-06-01T00:00:00.000Z"), w)).toBe(false);
  });
  it("excluye fechas futuras a la ventana", () => {
    expect(inWindow(new Date("2026-11-01T00:00:00.000Z"), w)).toBe(false);
  });
});

describe("buildMetricSeries", () => {
  const d = (s: string) => new Date(s);

  it("agrupa por kind y ordena los puntos cronológicamente", () => {
    const metrics: MetricInput[] = [
      { kind: "MRR", customLabel: null, unit: "USD", value: 300, asOf: d("2026-09-01") },
      { kind: "MRR", customLabel: null, unit: "USD", value: 100, asOf: d("2026-07-01") },
      { kind: "MRR", customLabel: null, unit: "USD", value: 200, asOf: d("2026-08-01") },
    ];
    const series = buildMetricSeries(metrics);
    expect(series).toHaveLength(1);
    expect(series[0]!.kind).toBe("MRR");
    expect(series[0]!.values).toEqual([100, 200, 300]);
    expect(series[0]!.first).toBe(100);
    expect(series[0]!.latest).toBe(300);
    expect(series[0]!.deltaPct).toBe(200); // (300-100)/100*100
  });

  it("separa series por kind distinto", () => {
    const metrics: MetricInput[] = [
      { kind: "MRR", customLabel: null, unit: "USD", value: 100, asOf: d("2026-07-01") },
      { kind: "BURN_RATE", customLabel: null, unit: "USD", value: 50, asOf: d("2026-07-01") },
    ];
    const series = buildMetricSeries(metrics);
    expect(series.map((s) => s.kind).sort()).toEqual(["BURN_RATE", "MRR"]);
  });

  it("agrupa CUSTOM por customLabel y usa ese label", () => {
    const metrics: MetricInput[] = [
      { kind: "CUSTOM", customLabel: "NPS", unit: "pts", value: 40, asOf: d("2026-07-01") },
      { kind: "CUSTOM", customLabel: "NPS", unit: "pts", value: 55, asOf: d("2026-08-01") },
      { kind: "CUSTOM", customLabel: "Tiendas", unit: "u", value: 3, asOf: d("2026-07-01") },
    ];
    const series = buildMetricSeries(metrics);
    const nps = series.find((s) => s.label === "NPS");
    expect(nps).toBeDefined();
    expect(nps!.values).toEqual([40, 55]);
    expect(series.some((s) => s.label === "Tiendas")).toBe(true);
  });

  it("deltaPct es null cuando el primer valor es 0 (evita división por cero)", () => {
    const metrics: MetricInput[] = [
      { kind: "ACTIVE_USERS", customLabel: null, unit: "u", value: 0, asOf: d("2026-07-01") },
      { kind: "ACTIVE_USERS", customLabel: null, unit: "u", value: 10, asOf: d("2026-08-01") },
    ];
    const series = buildMetricSeries(metrics);
    expect(series[0]!.deltaPct).toBeNull();
  });

  it("ordena las series por cantidad de puntos (desc)", () => {
    const metrics: MetricInput[] = [
      { kind: "MRR", customLabel: null, unit: "USD", value: 1, asOf: d("2026-07-01") },
      { kind: "GMV", customLabel: null, unit: "USD", value: 1, asOf: d("2026-07-01") },
      { kind: "GMV", customLabel: null, unit: "USD", value: 2, asOf: d("2026-08-01") },
    ];
    const series = buildMetricSeries(metrics);
    expect(series[0]!.kind).toBe("GMV"); // 2 puntos primero
  });
});
