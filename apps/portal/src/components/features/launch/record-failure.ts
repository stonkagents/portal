/**
 * One agent per wallet, as the tracker sees it.
 *
 * Two reads of the same rule: the wallet's existing launch, asked for before
 * anything is paid for, and what a refused `POST /api/launch/record` means once
 * the token is already on chain.
 */

import { fetchLaunchesByWallet, getLaunch, LaunchApiError } from '@/lib/api/launches';
import { logErrorChain } from '@/lib/launchlab/errors';
import { QUOTE_NOT_ALLOWED_CODE } from '@/lib/launchlab/launch-config';
import type { RecordFailure } from './types';

/** The agent a wallet already has on the tracker. */
export interface ExistingLaunch {
  mint: string;
  name: string | null;
  symbol: string | null;
}

/**
 * The tracker's newest launch for this wallet, claimed or not, or null. A
 * tracker that cannot answer does not block the launch: it will refuse the
 * record itself if it must, and that refusal is shown as such.
 */
export async function findExistingLaunch(wallet: string): Promise<ExistingLaunch | null> {
  try {
    const [first] = await fetchLaunchesByWallet(wallet);
    return first ? { mint: first.mint, name: first.name, symbol: first.symbol } : null;
  } catch (err) {
    logErrorChain('launch/by-wallet', err);
    return null;
  }
}

/**
 * What a failed `POST /api/launch/record` means for the creator. A 409
 * LAUNCH_EXISTS names the wallet's existing launch by mint; its name and symbol
 * are looked up so the notice can say which agent, and are null when the lookup
 * fails. Anything the tracker answered is a refusal with its code; a request
 * that never reached it, or that it never answered (TIMEOUT), is transient.
 */
export async function classifyRecordFailure(err: unknown, attempts: number): Promise<RecordFailure> {
  if (err instanceof LaunchApiError && err.walletHasLaunch && err.mint) {
    const existing = await getLaunch(err.mint).catch(() => null);
    return { kind: 'exists', mint: err.mint, name: existing?.name ?? null, symbol: existing?.symbol ?? null };
  }
  if (err instanceof LaunchApiError) {
    const quoteRefused = err.code === QUOTE_NOT_ALLOWED_CODE;
    return {
      kind: 'error',
      code: err.code ?? null,
      message: quoteRefused ? `only $STONK launches are listed, and this one was not raised in $STONK (${err.message})` : err.message,
      // A deadline that fired is the tracker not answering, not a refusal.
      transient: err.code === 'TIMEOUT',
      retryable: !quoteRefused,
      attempts,
    };
  }
  return {
    kind: 'error',
    code: null,
    message: err instanceof Error ? err.message : String(err),
    transient: true,
    retryable: true,
    attempts,
  };
}
