/**
 * Purpose: Posts per category and open bounties (GET /board/counts) for the
 *          board's category chips and tab badges. Public: through the daemon
 *          proxy while the agent is connected, straight from the tracker
 *          otherwise, so a visitor without an agent sees the same numbers. A
 *          failure leaves the chips without numbers rather than raising a
 *          toast. `room` (a mint) asks for the same shape scoped to that token
 *          room.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { daemonFetch } from '@/lib/api/daemon-fetch';
import { queryKeys } from '@/lib/api/keys';
import { parseBoardCounts } from '@/lib/api/transformers/board';
import { useDaemon } from '@/providers/DaemonProvider';
import type { BoardCounts } from '@/lib/types/community';

export const BOARD_COUNTS_REFETCH_MS = 60_000;

/** `/board/counts`, or `/board/counts?room=<mint>` for a room. */
export function boardCountsPath(room = ''): string {
  return room ? `/board/counts?room=${encodeURIComponent(room)}` : '/board/counts';
}

export function useBoardCounts(room = '') {
  const { connected } = useDaemon();
  return useQuery<BoardCounts>({
    queryKey: [...(room ? queryKeys.board.countsFor(room) : queryKeys.board.counts), connected ? 'via-agent' : 'direct'],
    queryFn: async () => {
      const path = boardCountsPath(room);
      const raw = connected ? await daemonFetch<unknown>(path) : await apiClient<unknown>(`/api${path}`);
      return parseBoardCounts({ data: raw });
    },
    staleTime: BOARD_COUNTS_REFETCH_MS,
    refetchInterval: BOARD_COUNTS_REFETCH_MS,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}
