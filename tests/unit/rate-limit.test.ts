import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { consumeRateLimit, _resetRateLimits } from "@/lib/utils/rate-limit";

beforeEach(() => {
  _resetRateLimits();
});

describe("consumeRateLimit", () => {
  it("primer intento siempre pasa (ok:true)", () => {
    const r = consumeRateLimit("ip:1.2.3.4", 3, 60_000);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it("hasta `limit` intentos consecutivos pasan", () => {
    for (let i = 0; i < 5; i++) {
      const r = consumeRateLimit("ip:test", 5, 60_000);
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(5 - i - 1);
    }
  });

  it("el intento `limit + 1` falla (ok:false)", () => {
    for (let i = 0; i < 3; i++) {
      consumeRateLimit("ip:x", 3, 60_000);
    }
    const r = consumeRateLimit("ip:x", 3, 60_000);
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("keys distintas no se afectan entre sí", () => {
    for (let i = 0; i < 3; i++) consumeRateLimit("ip:A", 3, 60_000);

    // IP A está bloqueada
    expect(consumeRateLimit("ip:A", 3, 60_000).ok).toBe(false);
    // IP B sigue limpia
    expect(consumeRateLimit("ip:B", 3, 60_000).ok).toBe(true);
  });

  it("después de la ventana, el bucket se resetea", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    consumeRateLimit("ip:y", 2, 60_000);
    consumeRateLimit("ip:y", 2, 60_000);
    expect(consumeRateLimit("ip:y", 2, 60_000).ok).toBe(false);

    // Avanzamos 61 segundos (ventana era 60s)
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
    const r = consumeRateLimit("ip:y", 2, 60_000);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(1);

    vi.useRealTimers();
  });

  it("dentro de la ventana, intento múltiple muestra remaining correcto", () => {
    const r1 = consumeRateLimit("ip:z", 5, 60_000);
    expect(r1.remaining).toBe(4);
    const r2 = consumeRateLimit("ip:z", 5, 60_000);
    expect(r2.remaining).toBe(3);
    const r3 = consumeRateLimit("ip:z", 5, 60_000);
    expect(r3.remaining).toBe(2);
  });

  it("resetAt es razonablemente ~ now + windowMs", () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-01-01T00:00:00Z").getTime();
    vi.setSystemTime(t0);
    const r = consumeRateLimit("ip:w", 3, 30_000);
    expect(r.resetAt).toBe(t0 + 30_000);
    vi.useRealTimers();
  });

  it("limit=1 funciona (caso borde: bloqueo inmediato post primer intento)", () => {
    expect(consumeRateLimit("ip:once", 1, 60_000).ok).toBe(true);
    expect(consumeRateLimit("ip:once", 1, 60_000).ok).toBe(false);
  });

  it("limit=0 bloquea desde el primer intento (caso borde)", () => {
    // Caso teórico: configurar limit a 0 nunca debería pasar, pero defensivo.
    const r = consumeRateLimit("ip:zero", 0, 60_000);
    expect(r.ok).toBe(true); // El primer intento ocupa el bucket nuevo
    // El segundo cae porque count (1) >= limit (0)
    expect(consumeRateLimit("ip:zero", 0, 60_000).ok).toBe(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
