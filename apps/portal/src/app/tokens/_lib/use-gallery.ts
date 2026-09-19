'use client';

/**
 * Data for the Agent Tokens pages.
 *
 * The gallery reads every recorded launch (`GET /api/launches`, paged until the
 * end) and the legacy token list (`GET /api/tokens`) and merges them into one
 * list. The detail page reads one launch (`GET /api/launch/{mint}`), and falls
 * back to the legacy list for a mint the launchpad does not know.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getLaunch, LaunchApiError, launchKeys, listLaunches, type LaunchRecord } from '@/lib/api/launches';
import { useTokens } from '@/lib/api/hooks/use-tokens';
import { useTokenByContract } from '@/lib/api/hooks/use-token-by-contract';
import { fromLaunch, fromListing, mergeGallery, type GalleryToken } from './gallery-token';

/** Largest page the tracker serves; the gallery walks pages until the end. */
const LAUNCH_PAGE_SIZE = 100;

/** Hard stop on how many launches the gallery pulls, so a runaway list cannot hang the page. */
const LAUNCH_MAX_ITEMS = 1_000;

/** Every recorded launch, newest first. */
async function fetchAllLaunches(signal?: AbortSignal): Promise<LaunchRecord[]> {
  const items: LaunchRecord[] = [];
  let cursor: number | null = 0;
  while (cursor !== null && items.length < LAUNCH_MAX_ITEMS) {
    const page = await listLaunches({ cursor, limit: LAUNCH_PAGE_SIZE }, signal);
    items.push(...page.items);
    cursor = page.nextCursor;
  }
  return items;
}

const galleryLaunchesKey = ['launches', 'gallery'] as const;

function useAllLaunches() {
  return useQuery({
    queryKey: galleryLaunchesKey,
    queryFn: ({ signal }) => fetchAllLaunches(signal),
    staleTime: 60_000,
    // A tracker rollout leaves the ALB without a healthy task for up to a minute;
    // back off through it instead of surfacing a banner on the first blip, and
    // keep trying in the background while the list is in error.
    retry: 3,
    retryDelay: attempt => Math.min(1_000 * 2 ** attempt, 8_000),
    refetchInterval: query => (query.state.status === 'error' ? 15_000 : false),
    refetchOnWindowFocus: false,
  });
}

export interface GalleryData {
  tokens: GalleryToken[];
  /** True only until either source has answered once. A refetch never brings the skeleton back. */
  isLoading: boolean;
  /** True while a refetch is in flight after the first answer. */
  isRefetching: boolean;
  /**
   * True when the launch list failed, and still true while it is being retried,
   * so the unreachable copy holds until a retry actually succeeds.
   */
  launchesFailed: boolean;
  refetch: () => void;
}

/**
 * The merged gallery. Loading until one source has answered or failed; after
 * that the cards (or the empty state) stay on screen through every refetch,
 * with the error banner still up while the launch list keeps failing.
 */
export function useGallery(): GalleryData {
  const launches = useAllLaunches();
  const listings = useTokens();

  const tokens = useMemo(() => mergeGallery(launches.data ?? [], listings.data ?? []), [launches.data, listings.data]);

  return {
    tokens,
    isLoading: !launches.isFetched && !listings.isFetched,
    isRefetching: launches.isFetching || listings.isFetching,
    // Sticky through the automatic retry: react-query clears isError while it
    // re-fetches, and a page must not flip to "nothing launched" mid-retry.
    launchesFailed: launches.isError || (launches.failureCount > 0 && launches.isFetching),
    refetch: () => {
      void launches.refetch();
      void listings.refetch();
    },
  };
}

export interface TokenDetailData {
  token: GalleryToken | null;
  isLoading: boolean;
  isFetched: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * One token by mint: the launch record when the tracker has it, otherwise the
 * legacy listing. A 404 from the launchpad is a normal answer, not an error.
 */
/** The tracker has no such launch: 404, or a 400/422 for an address it will never accept. */
function isMissing(status: number): boolean {
  return status === 404 || status === 400 || status === 422;
}

export function useTokenDetail(mint: string | null, options: { enablePolling?: boolean } = {}): TokenDetailData {
  const enablePolling = options.enablePolling ?? false;

  const launch = useQuery({
    queryKey: launchKeys.detail(mint ?? ''),
    queryFn: async ({ signal }): Promise<LaunchRecord | null> => {
      try {
        return await getLaunch(mint as string, signal);
      } catch (err) {
        if (err instanceof LaunchApiError && isMissing(err.status)) return null;
        throw err;
      }
    },
    enabled: !!mint,
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof LaunchApiError && isMissing(err.status)) && count < 3,
    retryDelay: attempt => Math.min(1_000 * 2 ** attempt, 8_000),
    refetchInterval: query => (query.state.status === 'error' ? 15_000 : enablePolling ? 30_000 : false),
  });

  const launchMissing = launch.isFetched && launch.data === null;
  const legacy = useTokenByContract(launchMissing ? mint : null, { enablePolling });

  const token = useMemo((): GalleryToken | null => {
    if (launch.data) return fromLaunch(launch.data);
    if (legacy.data) return fromListing(legacy.data);
    return null;
  }, [launch.data, legacy.data]);

  const isFetched = launch.isFetched && (!launchMissing || legacy.isFetched || legacy.isError);

  return {
    token,
    isLoading: launch.isLoading || (launchMissing && legacy.isLoading),
    isFetched,
    isError: launch.isError,
    refetch: () => {
      void launch.refetch();
      if (launchMissing) void legacy.refetch();
    },
  };
}
