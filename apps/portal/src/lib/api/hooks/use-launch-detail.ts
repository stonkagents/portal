/**
 * Story: Home token card reads the tracker launch record
 * Purpose: React Query wrapper over `getLaunch(mint)` (GET /api/launch/{mint}) —
 *          the token's identity and quote as the tracker recorded them. Live
 *          numbers (market cap, curve, price, holders) come from the metrics
 *          hooks, which route LaunchLab tokens through the same recorded launch.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { getLaunch, LaunchApiError, launchKeys, type LaunchRecord } from '@/lib/api/launches';
import { STONK_MINT } from '@/lib/launchlab/quote-catalog';

/** Best label for a quote mint without the launch config to hand. */
export function quoteSymbolForMint(quoteMint: string | undefined | null): string | null {
  if (!quoteMint) return null;
  if (quoteMint === STONK_MINT) return 'STONK';
  return `${quoteMint.slice(0, 4)}…`;
}

export function useLaunchDetail(mint: string | null) {
  const query = useQuery({
    queryKey: launchKeys.detail(mint ?? ''),
    queryFn: async ({ signal }): Promise<LaunchRecord | null> => {
      try {
        return await getLaunch(mint as string, signal);
      } catch (err) {
        /* Not recorded yet is a normal state right after a launch; any other 4xx
         * (e.g. 400 for a mint that is not a real public key, left over from the
         * old mock launch path) also means "this is not a launch", not an outage.
         * Only network failures and 5xx propagate as errors. */
        if (err instanceof LaunchApiError && err.status >= 400 && err.status < 500) return null;
        throw err;
      }
    },
    enabled: !!mint,
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof LaunchApiError && err.status < 500) && count < 3,
    retryDelay: attempt => Math.min(1_000 * 2 ** attempt, 8_000),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetched: query.isFetched,
    isError: query.isError,
  };
}
