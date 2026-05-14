import { describe, it, expect } from "vitest";
import {
  computeBlockHash,
  verifyBlockChain,
  type OwnershipBlockPayload,
} from "@/lib/crypto/ownership-chain";

function makePayload(
  overrides: Partial<OwnershipBlockPayload> = {}
): OwnershipBlockPayload {
  return {
    participationId: "p1",
    fromUserId: null,
    toUserId: "u1",
    authorizedById: "admin1",
    coAuthorizedById: null,
    reason: "Asignación inicial",
    resaleListingId: null,
    effectiveAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeBlockHash", () => {
  it("es determinístico: mismo input → mismo hash", () => {
    const p = makePayload();
    const h1 = computeBlockHash(p, null);
    const h2 = computeBlockHash(p, null);
    expect(h1).toBe(h2);
  });

  it("cambia si cambia cualquier campo del payload", () => {
    const base = makePayload();
    const baseHash = computeBlockHash(base, null);

    expect(computeBlockHash(makePayload({ participationId: "p2" }), null)).not.toBe(baseHash);
    expect(computeBlockHash(makePayload({ toUserId: "u2" }), null)).not.toBe(baseHash);
    expect(computeBlockHash(makePayload({ fromUserId: "u-other" }), null)).not.toBe(baseHash);
    expect(computeBlockHash(makePayload({ reason: "Otra razón" }), null)).not.toBe(baseHash);
    expect(computeBlockHash(makePayload({ effectiveAt: "2026-01-02T00:00:00.000Z" }), null)).not.toBe(baseHash);
    expect(computeBlockHash(makePayload({ authorizedById: "admin2" }), null)).not.toBe(baseHash);
    expect(computeBlockHash(makePayload({ coAuthorizedById: "co1" }), null)).not.toBe(baseHash);
    expect(computeBlockHash(makePayload({ resaleListingId: "r1" }), null)).not.toBe(baseHash);
  });

  it("cambia si cambia el prevHash (cadena no es trivialmente reordenable)", () => {
    const p = makePayload();
    expect(computeBlockHash(p, null)).not.toBe(computeBlockHash(p, "abc123"));
    expect(computeBlockHash(p, "abc123")).not.toBe(computeBlockHash(p, "abc124"));
  });

  it("usa 'GENESIS' como semilla cuando prevHash es null", () => {
    // Si nuestro contrato cambia (alguien mete una semilla distinta), este test rompe
    // y nos obliga a actualizar la chain existente. Es deliberadamente frágil.
    const p = makePayload();
    const withNull = computeBlockHash(p, null);
    const withGenesis = computeBlockHash(p, "GENESIS");
    // Confirmamos que NO son iguales (porque el formato es head|payload, y "GENESIS"
    // como string distinto se mete con concatenación literal — pero null se reemplaza
    // por la constante en el módulo).
    // El test cubre que el null se trata como "GENESIS" — ambos hashes deben dar igual.
    expect(withNull).toBe(withGenesis);
  });

  it("produce un hash hex de 64 caracteres (SHA-256)", () => {
    const h = computeBlockHash(makePayload(), null);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyBlockChain", () => {
  function buildChain(payloads: OwnershipBlockPayload[]) {
    const chain: Array<OwnershipBlockPayload & { blockHash: string; prevHash: string | null }> = [];
    let prev: string | null = null;
    for (const p of payloads) {
      const hash = computeBlockHash(p, prev);
      chain.push({ ...p, blockHash: hash, prevHash: prev });
      prev = hash;
    }
    return chain;
  }

  it("cadena válida → ok:true", () => {
    const chain = buildChain([
      makePayload({ participationId: "p1", reason: "block 1" }),
      makePayload({ participationId: "p1", reason: "block 2", fromUserId: "u1", toUserId: "u2" }),
      makePayload({ participationId: "p1", reason: "block 3", fromUserId: "u2", toUserId: "u3" }),
    ]);
    expect(verifyBlockChain(chain)).toEqual({ ok: true });
  });

  it("mutación retroactiva del payload rompe la cadena (auditoría detecta)", () => {
    const chain = buildChain([
      makePayload({ participationId: "p1", reason: "original" }),
      makePayload({ participationId: "p1", reason: "siguiente" }),
    ]);
    // Mutación: alguien edita el primer bloque post-hoc
    const firstBlock = chain[0];
    if (!firstBlock) throw new Error("test setup error");
    firstBlock.reason = "MANIPULADO";

    const r = verifyBlockChain(chain);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.brokenAtIndex).toBe(0);
  });

  it("cadena vacía es vacuamente válida", () => {
    expect(verifyBlockChain([])).toEqual({ ok: true });
  });

  it("manipulación de blockHash directo también se detecta", () => {
    const chain = buildChain([makePayload()]);
    const block = chain[0];
    if (!block) throw new Error("test setup error");
    block.blockHash = "0".repeat(64);
    const r = verifyBlockChain(chain);
    expect(r.ok).toBe(false);
  });
});
