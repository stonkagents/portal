/**
 * Purpose: Build SOL transfer transaction for credit purchase + error classification.
 *          Does NOT handle signing — that's done by the hook via WalletService.
 */
import { SystemProgram, Transaction } from '@solana/web3.js';
import type { PublicKey } from '@solana/web3.js';
import { CREDITS_TREASURY } from '@/lib/token-launch/constants';
import { solToLamports } from './tiers';

/** Build a SystemProgram.transfer transaction sending SOL to treasury */
export function buildCreditPurchaseTx(fromPubkey: PublicKey, solAmount: number): Transaction {
  const ix = SystemProgram.transfer({
    fromPubkey,
    toPubkey: CREDITS_TREASURY,
    lamports: solToLamports(solAmount),
  });
  return new Transaction().add(ix);
}

/** Classify wallet/Solana errors into user-friendly purchase messages */
export function classifyPurchaseError(err: unknown): string {
  if (!(err instanceof Error)) return 'Purchase failed. Please try again.';

  const msg = err.message.toLowerCase();

  // Phantom error code
  const { code } = err as unknown as Record<string, unknown>;
  if (code === 4001) return 'You rejected the transaction in Phantom.';

  if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancelled')) {
    return 'You rejected the transaction in Phantom.';
  }

  if (msg.includes('insufficient') || msg.includes('not enough')) {
    // Preserve specific balance detail (e.g. "you have 0.05 SOL but need 0.10 SOL") if present.
    if (msg.includes('you have') && msg.includes('need')) return err.message;
    return 'Insufficient SOL balance. Please add funds and try again.';
  }

  if (msg.includes('blockhash') || msg.includes('block height')) {
    return 'Transaction expired. Please try again.';
  }

  if (msg.includes('network') || msg.includes('timeout') || msg.includes('fetch')) {
    return 'Network error. Check your connection and try again.';
  }

  if (err.message.length > 10) return err.message;
  return 'Purchase failed. Please try again.';
}
