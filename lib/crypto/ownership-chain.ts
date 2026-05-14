import { createHash } from "node:crypto";

/**
 * Cadena de hashes para garantizar la inmutabilidad lógica de OwnershipHistory.
 * Cada nuevo registro se firma con SHA-256 sobre la concatenación canónica del
 * payload con el blockHash anterior. Cualquier mutación retroactiva en el
 * historial rompe la cadena y la auditoría lo detecta.
 */

export type OwnershipBlockPayload = {
  participationId: string;
  fromUserId: string | null;
  toUserId: string;
  authorizedById: string;
  coAuthorizedById: string | null;
  reason: string;
  resaleListingId: string | null;
  effectiveAt: string; // ISO
};

function canonicalize(payload: OwnershipBlockPayload): string {
  // Orden deterministico de claves para reproducibilidad
  const ordered = {
    authorizedById: payload.authorizedById,
    coAuthorizedById: payload.coAuthorizedById,
    effectiveAt: payload.effectiveAt,
    fromUserId: payload.fromUserId,
    participationId: payload.participationId,
    reason: payload.reason,
    resaleListingId: payload.resaleListingId,
    toUserId: payload.toUserId,
  };
  return JSON.stringify(ordered);
}

export function computeBlockHash(
  payload: OwnershipBlockPayload,
  prevHash: string | null
): string {
  const head = prevHash ?? "GENESIS";
  return createHash("sha256").update(head).update("|").update(canonicalize(payload)).digest("hex");
}

export function verifyBlockChain(
  blocks: Array<OwnershipBlockPayload & { blockHash: string; prevHash: string | null }>
): { ok: true } | { ok: false; brokenAtIndex: number } {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;
    const expected = computeBlockHash(block, block.prevHash);
    if (expected !== block.blockHash) {
      return { ok: false, brokenAtIndex: i };
    }
  }
  return { ok: true };
}
