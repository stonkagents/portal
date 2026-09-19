/**
 * Purpose: Sign a web3.js transaction through a wallet signer using raw bytes.
 *
 * @solana/connector's signer accepts a web3.js object, but its return path
 * decides legacy-vs-versioned from byte 0 of the serialized *transaction*
 * (the signature count), so every v0 transaction a wallet returns is misread
 * as legacy and `Transaction.from()` throws "Versioned messages must be
 * deserialized with VersionedMessage.deserialize()". Handing the signer bytes
 * makes it return the signed bytes untouched; we rebuild the right class.
 *
 * web3.js is imported on first use only: this module sits on the home page's
 * import path (via the wallet service) and nothing there signs (PERF-4).
 */
import type { Transaction, VersionedTransaction } from '@solana/web3.js';

export type ByteSigner = (bytes: Uint8Array) => Promise<unknown>;

const web3 = () => import('@solana/web3.js');

/** Serialize for a wallet: unsigned slots allowed, no local verification. */
export async function toWalletBytes(tx: Transaction | VersionedTransaction): Promise<Uint8Array> {
  const { VersionedTransaction: Versioned } = await web3();
  return tx instanceof Versioned ? tx.serialize() : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}

/** The connector returns Uint8Array for byte input; tolerate the shapes its
 * adapters have used: `{ signedTransaction }`, `[bytes]`, or an object with
 * `serialize()`. */
export function signedBytesOf(signed: unknown): Uint8Array {
  if (signed instanceof Uint8Array) return signed;
  if (Array.isArray(signed) && signed[0] instanceof Uint8Array) return signed[0];
  const rec = signed as { signedTransaction?: unknown; serialize?: () => Uint8Array } | null;
  if (rec?.signedTransaction instanceof Uint8Array) return rec.signedTransaction;
  if (typeof rec?.serialize === 'function') return rec.serialize();
  throw new Error('Wallet returned an unexpected signed transaction format');
}

/** Round-trip `tx` through `signer` as bytes and return the same class back. */
export async function signViaBytes<T extends Transaction | VersionedTransaction>(signer: ByteSigner, tx: T): Promise<T> {
  const { Transaction: Legacy, VersionedTransaction: Versioned } = await web3();
  const signed = signedBytesOf(await signer(await toWalletBytes(tx)));
  return (tx instanceof Versioned ? Versioned.deserialize(signed) : Legacy.from(signed)) as T;
}
