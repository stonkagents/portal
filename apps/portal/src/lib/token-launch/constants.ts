/**
 * Small chain constants shared outside the launch engine.
 *
 * The launchpad itself reads its program, platform, treasury and fee from
 * `GET /api/launch/config` (see `src/lib/launchlab/launch-config.ts`). What is
 * left here is the memo program, the credits treasury and the explorer helpers
 * that other features still use.
 */
import { PublicKey } from '@solana/web3.js';
import { config, explorerUrl } from '@/config';

/**
 * Wallet that receives credit purchases.
 *
 * The launch fee has its own treasury, served per request by the tracker; this
 * one is for the credits flow only, read from `NEXT_PUBLIC_TREASURY_ADDRESS`.
 */
export const CREDITS_TREASURY = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
    '11111111111111111111111111111111',
);

/** Solana cluster for explorer links. */
export const SOLANA_NETWORK = config.cluster;

/** Whether we are on devnet (affects explorer URLs). */
export const IS_DEVNET = config.isDevnet;

/** Memo Program v2 — well-known Solana program for attaching memo data to transactions. */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/** Validate that a string is a valid Solana address (base58, 32-44 chars). */
function assertValidAddress(addr: string): void {
  try {
    new PublicKey(addr);
  } catch {
    throw new Error(`Invalid Solana address: ${addr}`);
  }
}

/** Explorer page for a mint. */
export function solscanTokenUrl(mintAddress: string): string {
  assertValidAddress(mintAddress);
  return explorerUrl('token', mintAddress);
}

/** Explorer page for a transaction. */
export function solscanTxUrl(signature: string): string {
  return explorerUrl('tx', signature);
}
