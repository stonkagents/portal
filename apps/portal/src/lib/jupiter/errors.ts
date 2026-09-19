/**
 * Everything a swap can throw, turned into one line the trader can act on.
 *
 * Sibling of `lib/launchlab/errors.ts`, which walks a wallet's wrapped error
 * chain; this reuses that walk and maps what Jupiter and the token programs
 * say on top of it. Five outcomes matter to the panel: rejected in the
 * wallet, not enough balance, slippage exceeded, the network, Jupiter down.
 */

import { JupiterApiError } from '@/lib/api/jupiter';
import { deepestErrorMessage, errorChain, isUserRejection } from '@/lib/launchlab/errors';

export type SwapErrorKind = 'rejected' | 'insufficient' | 'slippage' | 'network' | 'jupiter' | 'expired' | 'no-route' | 'unknown';

export interface SwapError {
  kind: SwapErrorKind;
  message: string;
}

/**
 * Raised by the hook before the wallet is opened (no balance, a stale build,
 * a simulation Jupiter failed); the sentence passes through classification.
 */
export class SwapPreflightError extends Error {
  constructor(
    message: string,
    public readonly kind: SwapErrorKind,
  ) {
    super(message);
    this.name = 'SwapPreflightError';
  }
}

const messageOf = (item: unknown): string => {
  if (typeof item === 'string') return item;
  if (item instanceof Error) return item.message ?? '';
  if (typeof item === 'object' && item !== null) {
    const { message } = item as { message?: unknown };
    return typeof message === 'string' ? message : '';
  }
  return '';
};

/** Jupiter's `SlippageToleranceExceeded` (6001 = 0x1771) and the same idea from any AMM along the route. */
const SLIPPAGE_RE = /slippage|0x1771\b|"custom":6001\b|custom: 6001\b|exceeds desired/;
/** Token program `InsufficientFunds` (1 = 0x1), the system program's lamports line, and Jupiter's own simulation line. */
const INSUFFICIENT_RE = /insufficient|not enough|no record of a prior credit|custom program error: 0x1\b|"custom":1\b|custom: 1\b/;

/** Classify anything thrown on the way through a swap. Pure. */
export function classifySwapError(err: unknown, tokenSymbol = 'tokens'): SwapError {
  if (err instanceof SwapPreflightError) return { kind: err.kind, message: err.message };
  if (isUserRejection(err)) return { kind: 'rejected', message: 'You rejected the transaction in your wallet.' };

  if (err instanceof JupiterApiError) {
    if (err.code === 'NO_ROUTES_FOUND' || /no routes? found/i.test(err.message)) {
      return { kind: 'no-route', message: 'Jupiter found no route for that amount. Try a smaller one.' };
    }
    if (err.status === 0) return { kind: 'network', message: 'Could not reach Jupiter. Check your connection and try again.' };
    if (err.status === 429) return { kind: 'jupiter', message: 'Jupiter is rate limiting right now. Wait a moment and try again.' };
    if (err.status >= 500) return { kind: 'jupiter', message: 'Jupiter is unavailable right now. Try again in a moment.' };
    return { kind: 'jupiter', message: `Jupiter refused the swap: ${err.message}` };
  }

  const chain = errorChain(err);
  const msg = chain.map(messageOf).join(' | ').toLowerCase();
  const deepest = deepestErrorMessage(err) ?? '';

  if (SLIPPAGE_RE.test(msg)) {
    return { kind: 'slippage', message: 'The price moved past your slippage before the swap landed. Raise it or try again.' };
  }
  if (INSUFFICIENT_RE.test(msg)) {
    return { kind: 'insufficient', message: `Not enough ${tokenSymbol}, or SOL for the fees, in this wallet.` };
  }
  if (
    msg.includes('blockhash not found') ||
    msg.includes('blockhash expired') ||
    msg.includes('block height exceeded') ||
    msg.includes('expired')
  ) {
    return { kind: 'expired', message: 'The transaction expired before it landed. Nothing moved; try again.' };
  }
  if (
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('fetch') ||
    msg.includes('econnrefused') ||
    msg.includes('failed to fetch')
  ) {
    return { kind: 'network', message: 'Could not reach Solana. Check your connection and try again.' };
  }
  if (msg.includes('simulation failed') || msg.includes('preflight')) {
    const inner = deepest.match(/Error: (.+?)(?:\.|$)/);
    return { kind: 'unknown', message: `Simulation failed: ${inner?.[1] ?? (deepest || 'unknown reason')}.` };
  }
  if (deepest.length > 10 && deepest.length < 200) return { kind: 'unknown', message: deepest };
  return { kind: 'unknown', message: 'The swap failed. Nothing moved; try again.' };
}
