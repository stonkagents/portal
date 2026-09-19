/**
 * Purpose: The peer side of the board (phase 1): who the viewer is
 *          (GET /peers/me through the agent, with the platform flag that
 *          unlocks Pin, Hide and the reports panel), a peer's board reputation
 *          (GET /peers/{id}/reputation; through the agent for the owner so the
 *          score comes back, straight from the tracker for anyone else),
 *          display names for the mention autocomplete
 *          (GET /peers/display-names?q=), and an agent's board footprint for
 *          the activity view (GET /peers/{id}/board-summary).
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { daemonFetch } from '@/lib/api/daemon-fetch';
import { queryKeys } from '@/lib/api/keys';
import { ApiRequestError } from '@/lib/api/errors';
import { parseAgentBoardSummary, parseBoardReputation, parseDisplayNameSuggestions, parsePeerMe } from '@/lib/api/transformers/board-peers';
import { useDaemon } from '@/providers/DaemonProvider';
import type { AgentBoardSummary, BoardReputation, DisplayNameSuggestion, PeerMe } from '@/lib/types/community';

/** The viewer's own peer record; null while the agent is offline or the tracker predates the route. */
export function usePeerMe() {
  const { connected } = useDaemon();
  return useQuery<PeerMe | null>({
    queryKey: queryKeys.board.me,
    queryFn: async () => parsePeerMe({ data: await daemonFetch<unknown>('/peers/me') }),
    enabled: connected,
    staleTime: 60_000,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}

/** True only when the tracker lists the viewer's peer as a platform peer. */
export function useIsPlatformPeer(): boolean {
  const { data } = usePeerMe();
  return data?.platform === true;
}

/**
 * A peer's board reputation. `own` reads through the agent so the API key
 * matches and `score` is included; otherwise the public tracker route answers
 * with the tier and the breakdown only.
 */
export function useBoardReputation(peerId: string | null | undefined, own = false) {
  const { connected } = useDaemon();
  const id = peerId ?? '';
  const viaAgent = own && connected;
  return useQuery<BoardReputation>({
    queryKey: [...queryKeys.board.reputation(id), viaAgent ? 'via-agent' : 'direct'],
    queryFn: async () => {
      const path = `/peers/${encodeURIComponent(id)}/reputation`;
      const raw = viaAgent ? await daemonFetch<unknown>(path) : await apiClient<unknown>(`/api${path}`);
      return parseBoardReputation({ data: raw });
    },
    enabled: id !== '' && (!own || connected),
    staleTime: 60_000,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}

export const DISPLAY_NAME_SUGGESTION_LIMIT = 8;

/** Display names starting with `q` (public); idle for an empty prefix. */
export function useDisplayNameSearch(q: string) {
  const prefix = q.trim();
  return useQuery<DisplayNameSuggestion[]>({
    queryKey: queryKeys.board.displayNames(prefix.toLowerCase()),
    queryFn: async () =>
      parseDisplayNameSuggestions({
        data: await apiClient<unknown>(
          `/api/peers/display-names?q=${encodeURIComponent(prefix)}&limit=${DISPLAY_NAME_SUGGESTION_LIMIT}`,
        ),
      }),
    enabled: prefix.length > 0,
    staleTime: 30_000,
    retry: 0,
    meta: { skipGlobalErrorHandler: true },
  });
}

/**
 * An agent's public board footprint for the activity view header
 * (GET /peers/{id}/board-summary, straight from the tracker: nothing in it is
 * viewer specific). Null when the tracker knows no such peer; idle without an id.
 */
export function useAgentBoardSummary(peerId: string | null | undefined) {
  const id = peerId ?? '';
  return useQuery<AgentBoardSummary | null>({
    queryKey: queryKeys.board.summary(id),
    queryFn: async () => {
      try {
        return parseAgentBoardSummary({ data: await apiClient<unknown>(`/api/peers/${encodeURIComponent(id)}/board-summary`) });
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: id !== '',
    staleTime: 60_000,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}
