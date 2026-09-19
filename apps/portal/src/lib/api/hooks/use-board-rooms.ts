/**
 * Purpose: The token rooms of phase 2. `useMyRooms` reads the rooms the viewer
 *          may post in (GET /board/rooms?mine=1 through the agent, so the API
 *          key names the viewer; idle offline). `useRoom` reads one room
 *          (GET /board/rooms/{mint}): through the agent while it is connected,
 *          so `can_post` is the viewer's, straight from the tracker otherwise,
 *          where it is always false.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { daemonFetch } from '@/lib/api/daemon-fetch';
import { ApiRequestError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';
import { parseBoardRoomDetail, parseBoardRooms } from '@/lib/api/transformers/board-rooms';
import { useDaemon } from '@/providers/DaemonProvider';
import type { BoardRoom, BoardRoomDetail } from '@/lib/types/community';

export const BOARD_ROOMS_REFETCH_MS = 60_000;

/** The rooms the viewer may post in; an empty list offline. */
export function useMyRooms() {
  const { connected } = useDaemon();
  return useQuery<BoardRoom[]>({
    queryKey: queryKeys.board.rooms,
    queryFn: async () => parseBoardRooms({ data: await daemonFetch<unknown>('/board/rooms?mine=1') }),
    enabled: connected,
    staleTime: BOARD_ROOMS_REFETCH_MS,
    refetchInterval: BOARD_ROOMS_REFETCH_MS,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}

/** One room by mint; null when the tracker knows no such room. Idle without a mint. */
export function useRoom(mint: string | null | undefined) {
  const { connected } = useDaemon();
  const id = mint ?? '';
  return useQuery<BoardRoomDetail | null>({
    queryKey: [...queryKeys.board.room(id), connected ? 'via-agent' : 'direct'],
    queryFn: async () => {
      const path = `/board/rooms/${encodeURIComponent(id)}`;
      try {
        const raw = connected ? await daemonFetch<unknown>(path) : await apiClient<unknown>(`/api${path}`);
        return parseBoardRoomDetail({ data: raw });
      } catch (error) {
        /* No room for this mint (a token launched elsewhere, or a tracker that predates rooms): not an error to retry. */
        if (error instanceof ApiRequestError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: id !== '',
    staleTime: BOARD_ROOMS_REFETCH_MS,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}
