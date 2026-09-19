/**
 * The Network token as stonkfun's public API serves it, when the build reads
 * it from there (`NEXT_PUBLIC_AGENT_SOURCE=stonkfun`).
 *
 * Two reads: the token (price, market cap, volume, liquidity, status) and the
 * flywheel's burns. Both are cached and polled no faster than every 30 s, per
 * stonkfun's rate limit. The burns become the same `BurnPlan` the tracker's
 * ledger produces, so the ring, the burn figures and the burn list render
 * unchanged: burned is stonkfun's total, the created supply is what the mint
 * reports now plus that total, and there is no plan target, no next burn and
 * no cadence, because a flywheel has none.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { AGENT_TOTAL_SUPPLY, createdSupplyFromBurns } from '@/lib/agent-token';
import type { BurnPlan, LedgerState } from '@/lib/api/hooks/use-agent-ledgers';
import { fetchStonkfunBurns, fetchStonkfunToken, StonkfunApiError, type StonkfunBurns } from '@/lib/api/stonkfun';

/** How often the token is re-read while a page is open. Never faster: 300 requests a minute per IP, shared with every tab. */
export const STONKFUN_POLL_MS = 30_000;
/** Burns move slower than the price. */
export const STONKFUN_BURNS_POLL_MS = 60_000;

export const stonkfunKeys = {
  token: (mint: string | null) => ['stonkfun', 'token', mint ?? ''] as const,
  burns: (mint: string | null) => ['stonkfun', 'burns', mint ?? ''] as const,
};

/** Retry an outage twice, never a 4xx (an answer, or the rate limit, which a retry only worsens). */
const stonkfunRetry = (count: number, error: unknown): boolean =>
  !(error instanceof StonkfunApiError && error.status >= 400 && error.status < 500) && count < 2;
const stonkfunRetryDelay = (attempt: number): number => Math.min(2_000 * 2 ** attempt, 10_000);

/** The token as stonkfun lists it. Off until a mint is named. */
export function useStonkfunToken(mint: string | null, enabled = true) {
  return useQuery({
    queryKey: stonkfunKeys.token(mint),
    queryFn: ({ signal }) => fetchStonkfunToken(mint as string, signal),
    enabled: enabled && Boolean(mint),
    staleTime: STONKFUN_POLL_MS,
    retry: stonkfunRetry,
    retryDelay: stonkfunRetryDelay,
    refetchInterval: STONKFUN_POLL_MS,
    refetchOnWindowFocus: false,
  });
}

/** The flywheel's burns for the mint, newest first. Off until a mint is named. */
export function useStonkfunBurns(mint: string | null, enabled = true) {
  return useQuery({
    queryKey: stonkfunKeys.burns(mint),
    queryFn: ({ signal }) => fetchStonkfunBurns(mint as string, 25, signal),
    enabled: enabled && Boolean(mint),
    staleTime: STONKFUN_BURNS_POLL_MS,
    retry: stonkfunRetry,
    retryDelay: stonkfunRetryDelay,
    refetchInterval: STONKFUN_BURNS_POLL_MS,
    refetchOnWindowFocus: false,
  });
}

/**
 * stonkfun's burns as the tracker's burn plan: burned and the burn count from
 * the totals, the burn list from the entries, the created supply from the
 * mint's live supply plus what was burned (or the environment's figure), no
 * plan target, no next burn, no cadence. Pure; exported for tests.
 */
export function burnPlanFromStonkfun(burns: StonkfunBurns, currentSupply: number | null): BurnPlan {
  const burned = Math.max(0, burns.totals.amountTokens);
  const total = AGENT_TOTAL_SUPPLY ?? createdSupplyFromBurns(currentSupply, burned) ?? 0;
  return {
    mint: burns.mint,
    total,
    planTotal: null,
    burned,
    remaining: Math.max(0, total - burned),
    burns: Math.max(0, Math.round(burns.totals.burnCount)),
    next: null,
    schedule: null,
    recent: burns.burns.map(burn => ({ at: burn.burnedAt, amount: burn.amountTokens, sig: burn.signature })),
  };
}

/** The stonkfun burns as the same ledger state the tracker's plan is read into. `idle` when off. */
export function useStonkfunBurnPlan(mint: string | null, currentSupply: number | null, enabled = true): LedgerState<BurnPlan> {
  const query = useStonkfunBurns(mint, enabled);
  if (!enabled || !mint) return { status: 'idle' };
  if (query.data) return { status: 'ready', data: burnPlanFromStonkfun(query.data, currentSupply) };
  if (query.isError) return { status: 'error', error: query.error instanceof Error ? query.error : new Error(String(query.error)) };
  return { status: 'loading' };
}
