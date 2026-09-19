/**
 * Story: Home two-step flow — recover a launch on wallet connect
 * Purpose: React Query wrappers over the tracker's per-wallet launch reads
 *          (public, straight to the tracker):
 *            `getLaunchesByWallet(wallet)` — GET /api/launch/by-wallet?wallet=…,
 *              every launch the wallet made, claimed or not. This decides
 *              "does this wallet already have an agent".
 *            `getPendingLaunches(wallet)`  — GET /api/launch/pending?wallet=…,
 *              only the unclaimed ones. A fallback for an older tracker.
 *          A creator who launched on another device still lands in Step 2.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchLaunchesByWallet, getPendingLaunches, launchKeys, type LaunchRecord } from '@/lib/api/launches';

interface WalletLaunches {
  data: LaunchRecord[];
  /** The launch Step 2 should pick up. */
  first: LaunchRecord | null;
  isLoading: boolean;
  isFetched: boolean;
  isError: boolean;
}

/**
 * Every launch this wallet created, newest first, claimed or not.
 * Disabled until a wallet is connected; a tracker outage resolves to nothing.
 */
export function useLaunchesByWallet(wallet: string | null): WalletLaunches {
  const query = useQuery({
    queryKey: launchKeys.byWallet(wallet ?? ''),
    queryFn: ({ signal }) => fetchLaunchesByWallet(wallet as string, signal),
    enabled: !!wallet,
    staleTime: 30_000,
    retry: 1,
  });

  const data: LaunchRecord[] = query.data ?? [];

  return {
    data,
    first: data[0] ?? null,
    isLoading: query.isLoading,
    isFetched: query.isFetched,
    isError: query.isError,
  };
}

/**
 * Launches this wallet created that no agent has claimed yet, newest first.
 * Disabled until a wallet is connected; a tracker outage resolves to no recovery.
 */
export function usePendingLaunches(wallet: string | null): WalletLaunches {
  const query = useQuery({
    queryKey: launchKeys.pending(wallet ?? ''),
    queryFn: ({ signal }) => getPendingLaunches(wallet as string, signal),
    enabled: !!wallet,
    staleTime: 30_000,
    retry: 1,
  });

  const data: LaunchRecord[] = query.data ?? [];

  return {
    data,
    first: data[0] ?? null,
    isLoading: query.isLoading,
    isFetched: query.isFetched,
    isError: query.isError,
  };
}
