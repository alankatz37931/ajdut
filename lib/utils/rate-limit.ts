// Rate limiter in-memory liviano para endpoints públicos.
// Útil para frenar bots/floods. No reemplaza un Redis distribuido en producción
// multi-instancia, pero alcanza para el modelo invite-only donde el volumen es bajo.

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

// Limpieza perezosa: cuando una clave expira, se borra al próximo `consume`.
// Si quedan claves zombies muy viejas (sin tráfico) las purgamos en bloque.
const LAZY_CLEAN_EVERY = 500;
let opsSinceClean = 0;

function cleanupExpired(now: number) {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

/**
 * Cuenta una operación contra una clave (típicamente IP+endpoint o email+endpoint).
 * Devuelve `ok:false` si superó el `limit` dentro de la ventana `windowMs`.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();

  opsSinceClean += 1;
  if (opsSinceClean >= LAZY_CLEAN_EVERY) {
    cleanupExpired(now);
    opsSinceClean = 0;
  }

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/** Para tests o reset manual. */
export function _resetRateLimits() {
  buckets.clear();
  opsSinceClean = 0;
}
