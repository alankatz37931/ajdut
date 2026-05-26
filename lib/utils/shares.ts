/**
 * Dado el valor de una empresa, deriva un precio por acción que sea múltiplo
 * de 10 (10, 20, 50, 100, 200, 500, 1000, ...) y la cantidad total de acciones.
 *
 * Objetivo: que el inversor siempre vea precios "redondos" (USD 10, 20, 50, 100)
 * y números de acciones razonables (10k - 2M).
 *
 * Invariante crítico: `pricePerShare * totalShares === valuation`. Si la
 * valoración no admite un precio limpio (no divisible por ningún candidato),
 * la función retorna `null` para que el caller la rechace explícitamente
 * (en vez de redondear silenciosamente y romper la matemática del cap-table).
 */

const PRICE_CANDIDATES = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 50000, 100000];
const TARGET_MAX_SHARES = 2_000_000;

export type DeriveResult = {
  pricePerShare: number;
  totalShares: number;
};

export function derivePriceAndShares(valuation: number): DeriveResult | null {
  if (!Number.isFinite(valuation) || valuation <= 0) {
    return null;
  }

  // Buscamos el menor precio (de mayor granularidad) que cumpla:
  //   - valuation / price es un entero
  //   - el total de acciones no supera TARGET_MAX_SHARES
  for (const price of PRICE_CANDIDATES) {
    const shares = valuation / price;
    if (Number.isInteger(shares) && shares <= TARGET_MAX_SHARES) {
      return { pricePerShare: price, totalShares: shares };
    }
  }

  // Sin divisor limpio: caller debe rechazar la valoración.
  return null;
}
