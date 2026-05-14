/**
 * Dado el valor de una empresa, deriva un precio por acción que sea múltiplo
 * de 10 (10, 20, 50, 100, 200, 500, 1000, ...) y la cantidad total de acciones.
 *
 * Objetivo: que el inversor siempre vea precios "redondos" (USD 10, 20, 50, 100)
 * y números de acciones razonables (10k - 2M).
 */

const PRICE_CANDIDATES = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 50000, 100000];
const TARGET_MAX_SHARES = 2_000_000;

export function derivePriceAndShares(valuation: number): {
  pricePerShare: number;
  totalShares: number;
} {
  if (!Number.isFinite(valuation) || valuation <= 0) {
    return { pricePerShare: 10, totalShares: 0 };
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

  // Fallback: si la valoración no es divisible limpia por ningún precio,
  // usamos $10/acción redondeando para abajo.
  return {
    pricePerShare: 10,
    totalShares: Math.floor(valuation / 10),
  };
}
