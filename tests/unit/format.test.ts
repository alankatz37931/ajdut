import { describe, it, expect } from "vitest";
import {
  formatNumber,
  formatPercent,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDeltaSymbol,
} from "@/lib/utils/format";

describe("formatNumber", () => {
  it("acepta number, string y bigint", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber("1000")).toBe("1,000");
    expect(formatNumber(1000n)).toBe("1,000");
  });

  it("usa locale es-MX (separador de miles =  coma)", () => {
    expect(formatNumber(1_234_567)).toBe("1,234,567");
  });

  it("recorta decimales a 2 por default", () => {
    expect(formatNumber(1.23456)).toBe("1.23");
  });

  it("permite override de opciones", () => {
    expect(
      formatNumber(1.5, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
    ).toBe("1.5000");
  });

  it("maneja negativos", () => {
    expect(formatNumber(-1500)).toBe("-1,500");
  });
});

describe("formatPercent", () => {
  it("agrega símbolo %", () => {
    expect(formatPercent(50)).toBe("50.00%");
  });

  it("respeta fractionDigits", () => {
    expect(formatPercent(33.333, 1)).toBe("33.3%");
    expect(formatPercent(33.333, 0)).toBe("33%");
  });

  it("0% se muestra explícito (no '—')", () => {
    expect(formatPercent(0)).toBe("0.00%");
  });

  it("acepta negativos (deltas)", () => {
    expect(formatPercent(-5.5, 1)).toBe("-5.5%");
  });
});

describe("formatCurrency", () => {
  it("formato USD default", () => {
    // El símbolo puede variar por entorno (US$ en es-MX vía Intl); chequeamos sustrings.
    const r = formatCurrency(12500);
    expect(r).toContain("12,500");
  });

  it("MXN es válido", () => {
    const r = formatCurrency(12500, "MXN");
    expect(r).toContain("12,500");
  });

  it("acepta string", () => {
    const r = formatCurrency("12500.50", "USD");
    expect(r).toContain("12,500.5");
  });

  it("no rompe con 0", () => {
    const r = formatCurrency(0, "USD");
    expect(r).toContain("0");
  });
});

describe("formatDate / formatDateTime", () => {
  it("formato es-MX dd/mm/yyyy", () => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 30, 0)); // 15 de enero 2026
    expect(formatDate(date)).toBe("15/01/2026");
  });

  it("acepta string ISO", () => {
    expect(formatDate("2026-01-15T12:30:00.000Z")).toBe("15/01/2026");
  });

  it("dateTime incluye hora", () => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 30, 0));
    const r = formatDateTime(date);
    expect(r).toContain("15/01/2026");
    expect(r).toMatch(/\d{2}:\d{2}/);
  });
});

describe("formatDeltaSymbol", () => {
  it("positivo → ▲", () => {
    expect(formatDeltaSymbol(5)).toBe("▲");
  });

  it("negativo → ▼", () => {
    expect(formatDeltaSymbol(-5)).toBe("▼");
  });

  it("cero → −", () => {
    expect(formatDeltaSymbol(0)).toBe("−");
  });

  it("null → −", () => {
    expect(formatDeltaSymbol(null)).toBe("−");
  });

  it("undefined → −", () => {
    expect(formatDeltaSymbol(undefined)).toBe("−");
  });
});
