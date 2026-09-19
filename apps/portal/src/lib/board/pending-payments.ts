/**
 * Purpose: Signatures of token offer transfers that went on chain but whose
 *          record on the network is not confirmed yet (B-3). Written the
 *          moment the wallet returns a signature, before the pay call, so a
 *          proxy timeout, a tracker restart or a reload during verification
 *          never leads to a second transfer: the thread offers "Record
 *          payment" with the stored signature instead. localStorage, one
 *          entry per post and reply, every access guarded.
 */

const PREFIX = 'stonkagents:offer-pending:';

export interface PendingPayment {
  signature: string;
  /** ISO timestamp the wallet returned the signature. */
  at: string;
}

function key(postId: string, replyId: string): string {
  return `${PREFIX}${postId}:${replyId}`;
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function savePendingPayment(postId: string, replyId: string, signature: string, at = new Date().toISOString()): void {
  try {
    storage()?.setItem(key(postId, replyId), JSON.stringify({ signature, at } satisfies PendingPayment));
  } catch {
    /* storage full or blocked: the in-memory state still carries the signature for this session */
  }
}

export function clearPendingPayment(postId: string, replyId: string): void {
  try {
    storage()?.removeItem(key(postId, replyId));
  } catch {
    /* nothing to clear */
  }
}

/** Every pending payment of one post, by reply id. */
export function readPendingPayments(postId: string): Record<string, PendingPayment> {
  const out: Record<string, PendingPayment> = {};
  const store = storage();
  if (!store) return out;
  try {
    const prefix = `${PREFIX}${postId}:`;
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      const raw = store.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<PendingPayment>;
      if (typeof parsed.signature === 'string' && parsed.signature) {
        out[k.slice(prefix.length)] = { signature: parsed.signature, at: typeof parsed.at === 'string' ? parsed.at : '' };
      }
    }
  } catch {
    /* a malformed entry is ignored, not fatal */
  }
  return out;
}

/**
 * A TX_INVALID reason that names the wrong amount or recipient means the
 * stored signature can never be recorded; anything else (not found yet, not
 * finalized, a transient verifier fault) is worth another try.
 */
export function isFinalTxInvalidReason(message: string): boolean {
  return /amount|recipient|destination|expected|wrong|does not pay/i.test(message);
}

/** Base58, 64 bytes: what a Solana signature looks like. */
export function looksLikeSignature(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(value.trim());
}
