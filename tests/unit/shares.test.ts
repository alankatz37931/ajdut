import { describe, it, expect } from "vitest";
import { derivePriceAndShares } from "@/lib/utils/shares";

describe("derivePriceAndShares", () => {
  describe("casos del seed (sanity check de los proyectos demo)", () => {
    it("Pushka SAS: $12.5M USD → $10 × 1.25M acciones", () => {
      expect(derivePriceAndShares(12_500_000)).toEqual({
        pricePerShare: 10,
        totalShares: 1_250_000,
      });
    });

    it("TerraVerde: $1.8M USD → $10 × 180k acciones", () => {
      expect(derivePriceAndShares(1_800_000)).toEqual({
        pricePerShare: 10,
        totalShares: 180_000,
      });
    });

    it("Lupa Salud: $6.2M USD → $10 × 620k acciones", () => {
      expect(derivePriceAndShares(6_200_000)).toEqual({
        pricePerShare: 10,
        totalShares: 620_000,
      });
    });

    it("Mercurio Studios: $4.4M USD → $10 × 440k acciones", () => {
      expect(derivePriceAndShares(4_400_000)).toEqual({
        pricePerShare: 10,
        totalShares: 440_000,
      });
    });
  });

  describe("subir de precio cuando 2M acciones no alcanzan", () => {
    it("$25M → $20 × 1.25M (no usa $10 porque daría 2.5M > target)", () => {
      // 25M / 10 = 2.5M, supera el cap → sube a 20
      const r = derivePriceAndShares(25_000_000);
      expect(r).not.toBeNull();
      expect(r!.pricePerShare).toBe(20);
      expect(r!.totalShares).toBe(1_250_000);
      // Sanity: el producto reconstruye la valoración
      expect(r!.pricePerShare * r!.totalShares).toBe(25_000_000);
    });

    it("$100M → debería usar $50 × 2M acciones", () => {
      const r = derivePriceAndShares(100_000_000);
      expect(r).not.toBeNull();
      expect(r!.pricePerShare).toBe(50);
      expect(r!.totalShares).toBe(2_000_000);
    });

    it("$1B → $500 × 2M", () => {
      const r = derivePriceAndShares(1_000_000_000);
      expect(r).not.toBeNull();
      expect(r!.pricePerShare).toBe(500);
      expect(r!.totalShares).toBe(2_000_000);
    });
  });

  describe("el precio siempre es múltiplo de 10 (la promesa al usuario)", () => {
    it.each([
      1_000_000, 5_000_000, 10_000_000, 50_000_000, 200_000_000, 750_000_000,
    ])("para valoración %i, pricePerShare %% 10 === 0", (val) => {
      const r = derivePriceAndShares(val);
      expect(r).not.toBeNull();
      expect(r!.pricePerShare % 10).toBe(0);
    });
  });

  describe("totalShares queda razonable (no millones-de-millones)", () => {
    it.each([
      1_000_000, 5_000_000, 10_000_000, 50_000_000, 200_000_000, 750_000_000,
    ])("para valoración %i, totalShares ≤ 2M", (val) => {
      const r = derivePriceAndShares(val);
      expect(r).not.toBeNull();
      expect(r!.totalShares).toBeLessThanOrEqual(2_000_000);
    });
  });

  describe("valoraciones que NO dividen limpio (sin fallback silencioso)", () => {
    it("valoración 'rara' (no divisible por ningún candidato) → null", () => {
      // 1_234_567 no es divisible por 10, 20, 50, 100, 200, 500, 1000, etc.
      // Antes de la fix devolvía { pricePerShare:10, totalShares:floor(val/10) }
      // que rompía el invariante pricePerShare*totalShares === valuation.
      // Ahora retorna null para que el caller la rechace explícitamente.
      expect(derivePriceAndShares(1_234_567)).toBeNull();
    });

    it("decimales no representables como múltiplo limpio → null", () => {
      expect(derivePriceAndShares(123.45)).toBeNull();
    });
  });

  describe("inputs inválidos → null", () => {
    it("valoración 0 → null", () => {
      expect(derivePriceAndShares(0)).toBeNull();
    });

    it("valoración negativa → null", () => {
      expect(derivePriceAndShares(-1_000_000)).toBeNull();
    });

    it("NaN → null", () => {
      expect(derivePriceAndShares(Number.NaN)).toBeNull();
    });

    it("Infinity → null", () => {
      expect(derivePriceAndShares(Number.POSITIVE_INFINITY)).toBeNull();
    });
  });

  describe("invariante: pricePerShare × totalShares === valuation cuando divide limpio", () => {
    it.each([
      [12_500_000, 10, 1_250_000],
      [1_800_000, 10, 180_000],
      [25_000_000, 20, 1_250_000],
      [100_000_000, 50, 2_000_000],
    ])(
      "valoración %i: %i × %i = valoración exacta",
      (val, expectedPrice, expectedShares) => {
        const r = derivePriceAndShares(val);
        expect(r).not.toBeNull();
        expect(r!.pricePerShare).toBe(expectedPrice);
        expect(r!.totalShares).toBe(expectedShares);
        expect(r!.pricePerShare * r!.totalShares).toBe(val);
      }
    );
  });
});
