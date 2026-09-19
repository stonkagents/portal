/**
 * Wallet and RPC errors turned into something a creator can act on.
 *
 * Wallet adapters wrap the real failure several layers deep ("Failed to sign
 * transaction" around Phantom's own message), so every classifier here walks
 * the whole chain — `cause`, `originalError`, `details`, `error`, `inner` —
 * and reads the deepest human sentence rather than the outermost wrapper.
 */

import { config } from '@/config';

/**
 * On the devnet site Phantom signs against mainnet unless its Testnet Mode is
 * on, and then fails with -32603 or a generic signing error after the user
 * confirmed. Two thirds of first-time dev testers hit exactly this, so every
 * wallet-side failure on devnet says how to switch.
 */
export const DEVNET_WALLET_HINT =
  'This site runs on Solana devnet: in Phantom open Settings, Developer Settings, turn Testnet Mode on and select Solana Devnet, then try again.';

function withDevnetHint(message: string, cluster: string): string {
  return cluster === 'devnet' ? `${message} ${DEVNET_WALLET_HINT}` : message;
}

const WALLET_ERROR_MAP: Record<number, string> = {
  4001: 'You rejected the transaction in your wallet.',
  4100: 'Your wallet has not authorised this site. Reconnect and try again.',
  4900: 'Your wallet cannot reach Solana. Check your connection.',
  [-32000]: 'The transaction was missing or had invalid parameters.',
  [-32002]: 'An approval window is already open. Close it and try again.',
  [-32003]: 'Your wallet rejected the transaction as invalid.',
  [-32603]: 'Something broke inside your wallet. Reopen the extension and try again.',
};

const NESTED_KEYS = ['cause', 'originalError', 'details', 'error', 'inner', 'reason'] as const;

/** Outermost first: the error and everything it wraps, without loops. */
export function errorChain(err: unknown): unknown[] {
  const chain: unknown[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current !== undefined && current !== null && !seen.has(current) && chain.length < 12) {
    seen.add(current);
    chain.push(current);
    if (typeof current !== 'object') break;
    const record = current as Record<string, unknown>;
    let next: unknown = undefined;
    for (const key of NESTED_KEYS) {
      const value = record[key];
      if (value instanceof Error || (typeof value === 'object' && value !== null && 'message' in value) || typeof value === 'string') {
        next = value;
        break;
      }
    }
    current = next;
  }
  return chain;
}

function messageOf(item: unknown): string | null {
  if (typeof item === 'string') return item.trim() || null;
  if (item instanceof Error) return item.message?.trim() || null;
  if (typeof item === 'object' && item !== null) {
    const { message } = item as { message?: unknown };
    return typeof message === 'string' && message.trim() ? message.trim() : null;
  }
  return null;
}

/** The innermost message in the chain: what the wallet or the node actually said. */
export function deepestErrorMessage(err: unknown): string | null {
  const messages = errorChain(err)
    .map(messageOf)
    .filter((m): m is string => m !== null);
  return messages.length > 0 ? messages[messages.length - 1] : null;
}

/** Log the whole chain once, outermost first, so the wrapper and the cause are both on record. */
export function logErrorChain(scope: string, err: unknown): void {
  const chain = errorChain(err);
  console.error(`[${scope}]`, ...chain.flatMap((item, index) => [index === 0 ? '' : `\n  caused by:`, item]));
}

function codeOf(item: unknown): number | null {
  if (typeof item !== 'object' || item === null) return null;
  const { code } = item as { code?: unknown };
  return typeof code === 'number' ? code : null;
}

/** A wallet's known error code anywhere in the chain, mapped to a sentence. */
function walletCodeMessage(err: unknown): string | null {
  for (const item of errorChain(err)) {
    const code = codeOf(item);
    if (code !== null && WALLET_ERROR_MAP[code]) return WALLET_ERROR_MAP[code];
  }
  return null;
}

/** True when any layer says the user rejected the request. */
export function isUserRejection(err: unknown): boolean {
  if (walletCodeMessage(err) === WALLET_ERROR_MAP[4001]) return true;
  const chain = errorChain(err);
  return chain.some(item => {
    const msg = (messageOf(item) ?? '').toLowerCase();
    const code = (item as { code?: unknown } | null)?.code;
    return code === 'USER_REJECTED' || msg.includes('user rejected') || msg.includes('user denied') || msg.includes('cancelled');
  });
}

/**
 * Preflight failures are raised by us, before the wallet is opened, and carry
 * their own sentence; classification passes them through untouched.
 */
export class LaunchPreflightError extends Error {
  constructor(
    message: string,
    public readonly kind: 'size' | 'simulation',
  ) {
    super(message);
    this.name = 'LaunchPreflightError';
  }
}

/** A human sentence for anything thrown on the way to a live pool. */
export function classifyLaunchError(
  err: unknown,
  phase?: 'uploading' | 'signing' | 'confirming' | 'recording',
  cluster: string = config.cluster,
): string {
  if (err instanceof LaunchPreflightError) return err.message;
  if (!(err instanceof Error) && typeof err !== 'object') return 'The launch failed. Try again.';

  if (isUserRejection(err)) return WALLET_ERROR_MAP[4001];
  const byCode = walletCodeMessage(err);
  if (byCode) return withDevnetHint(byCode, cluster);

  const deepest = deepestErrorMessage(err) ?? '';
  const msg = errorChain(err).map(messageOf).filter(Boolean).join(' | ').toLowerCase();

  if (msg.includes('insufficient') || msg.includes('not enough')) {
    return 'Not enough SOL for rent, the launch fee and network gas. Top up and try again.';
  }
  if (msg.includes('blockhash not found') || msg.includes('blockhash expired') || msg.includes('block height exceeded')) {
    return 'The transaction expired before it landed. Try again.';
  }
  if (msg.includes('too large') || msg.includes('transaction size')) {
    return 'The transaction is too large. Lower the dev buy and try again.';
  }
  if (msg.includes('accountnotfound') || msg.includes('account not found')) {
    return 'This wallet has no SOL on this network yet. It needs SOL for rent, the launch fee and gas before it can launch.';
  }
  // Anchor 2506 (0x9ca) on the launch's dev buy: require_gte on the payer's quote balance.
  if (msg.includes('0x9ca') || msg.includes('"custom":2506') || msg.includes('custom: 2506')) {
    return 'The dev buy is larger than the quote balance in this wallet. Lower the dev buy or top up, then try again.';
  }
  if (msg.includes('simulation failed') || msg.includes('preflight')) {
    const inner = deepest.match(/Error: (.+?)(?:\.|$)/);
    return `Simulation failed: ${inner?.[1] ?? (deepest || 'unknown reason')}. Check your balance and try again.`;
  }
  // Before the wallet is even opened, the only host in play is the tracker: a
  // fetch failure or a missed deadline there is the launchpad, not Solana.
  if (phase === 'uploading') {
    return deepest.length > 10 && !/fetch/i.test(deepest)
      ? `The launchpad could not store the image and metadata: ${deepest}`
      : 'Could not reach the launchpad to store the image and metadata. Check your connection and try again.';
  }
  if (msg.includes('metadata') || msg.includes('upload')) {
    return 'The image and metadata upload failed. Check your connection and try again.';
  }
  if (msg.includes('config not found') || msg.includes('quote config')) {
    return 'That quote token has no launch config on this network. Pick another quote.';
  }
  // A wallet Phantom signs on its servers (created with an email or Google
  // sign-in) cannot resolve address lookup tables; the launch is compiled
  // without them whenever it fits, so this only shows for a launch too large
  // to fit plain (see build-launch.ts compileLaunchMessage).
  if (msg.includes('lookup table')) {
    return 'This wallet is signed on Phantom’s servers (an account created with an email or Google sign-in) and cannot sign a launch this large. Lower the dev buy so the transaction is smaller, or launch from a wallet that holds its own seed phrase.';
  }
  if (phase === 'signing' || msg.includes('failed to sign') || msg.includes('signing_failed')) {
    return withDevnetHint(
      deepest && !/^failed to sign transaction$/i.test(deepest)
        ? `Phantom could not sign: ${deepest}`
        : 'Phantom could not sign the transaction. Check the wallet is unlocked and on the right network, then try again.',
      cluster,
    );
  }
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('fetch') || msg.includes('econnrefused')) {
    return 'Could not reach Solana. Check your connection and try again.';
  }
  if (deepest.length > 10) return deepest;
  return 'The launch failed. Try again.';
}
