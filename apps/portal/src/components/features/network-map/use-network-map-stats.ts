/**
 * Purpose: The map's single data feed. Peers come from the shared `['peers']` query
 *          (same key as the gallery and peers pages, so one cache entry and one polling
 *          timer no matter how many pages mount the map); the hero's Online/Offline
 *          counts come from the tracker stats query. Real peers or none: while the
 *          tracker cannot answer, the map shows the land layer with no peers.
 */
'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/keys';
import { fetchPeers } from '@/lib/api/hooks/use-peers';
import { useBoardStats } from '@/lib/api/hooks/use-board-stats';
import type { Peer } from '@/lib/types/peer';
import { countPeersByCountry, type CountryCounts } from './country-codes';

/** Peers are re-read once a minute; React Query runs one timer per query regardless of pages. */
export const NETWORK_MAP_POLL_MS = 60_000;

/** Real tracker numbers for the hero's agent status. Null until the tracker answers. */
export interface MapLiveStats {
  onlinePeers: number;
  offlinePeers: number;
  totalPeers: number;
}

export interface NetworkMapStats {
  /** Current peer set, empty until loaded or while the tracker is unreachable. */
  peers: Peer[];
  live: MapLiveStats | null;
  /** Null until the peer list has answered. */
  countries: CountryCounts | null;
}

const NO_PEERS: Peer[] = [];

export function useNetworkMapStats(): NetworkMapStats {
  const peersQuery = useQuery({
    queryKey: queryKeys.peers.all,
    queryFn: fetchPeers,
    staleTime: NETWORK_MAP_POLL_MS,
    refetchInterval: NETWORK_MAP_POLL_MS,
    refetchOnWindowFocus: false,
  });
  const board = useBoardStats();

  const peers = peersQuery.data ?? NO_PEERS;
  const countries = useMemo(() => (peersQuery.data ? countPeersByCountry(peersQuery.data) : null), [peersQuery.data]);

  const live = useMemo<MapLiveStats | null>(() => {
    if (board.data) {
      return { onlinePeers: board.data.online_peers, offlinePeers: board.data.offline_peers, totalPeers: board.data.total_peers };
    }
    if (!peersQuery.data) return null;
    const offline = peersQuery.data.filter(p => p.status === 'offline').length;
    return { onlinePeers: peersQuery.data.length - offline, offlinePeers: offline, totalPeers: peersQuery.data.length };
  }, [board.data, peersQuery.data]);

  return { peers, live, countries };
}
