/**
 * Purpose: What happened to the owner on the board, for the bell: replies on
 *          their posts, awards, upvotes, bounties about to expire or refunded.
 *          GET /activity through the daemon proxy every 60 s while the agent is
 *          connected, nothing while it is not; POST /activity/read marks rows
 *          read, updating the cache first so the badge drops at once.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { daemonFetch } from '@/lib/api/daemon-fetch';
import { queryKeys } from '@/lib/api/keys';
import { parseActivityFeed, parseNotificationPrefs } from '@/lib/api/transformers/board';
import { useDaemon } from '@/providers/DaemonProvider';
import type { BoardActivityFeed, BoardActivityKind, BoardNotificationPrefs } from '@/lib/types/community';

export const BOARD_ACTIVITY_POLL_MS = 60_000;
/** How many rows the bell asks for; it shows the newest and links out for the rest. */
export const BOARD_ACTIVITY_LIMIT = 50;

export const EMPTY_ACTIVITY_FEED: BoardActivityFeed = { items: [], unread: 0 };

export function useBoardActivity() {
  const { connected } = useDaemon();
  return useQuery<BoardActivityFeed>({
    queryKey: queryKeys.board.activity,
    queryFn: async () => parseActivityFeed({ data: await daemonFetch<unknown>(`/activity?limit=${BOARD_ACTIVITY_LIMIT}`) }),
    enabled: connected,
    staleTime: BOARD_ACTIVITY_POLL_MS,
    refetchInterval: connected ? BOARD_ACTIVITY_POLL_MS : false,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}

/** GET /activity/prefs (round 2): which activity kinds the bell leaves out. Idle offline. */
export function useNotificationPrefs() {
  const { connected } = useDaemon();
  return useQuery<BoardNotificationPrefs>({
    queryKey: queryKeys.board.activityPrefs,
    queryFn: async () => parseNotificationPrefs({ data: await daemonFetch<unknown>('/activity/prefs') }),
    enabled: connected,
    staleTime: 5 * 60_000,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}

/** PUT /activity/prefs `{ muted_kinds }`: the cache follows the answer, and the feed is refetched under the new filter. */
export function useSetNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation<BoardNotificationPrefs, Error, BoardActivityKind[]>({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async mutedKinds =>
      parseNotificationPrefs({ data: await daemonFetch<unknown>('/activity/prefs', { method: 'PUT', body: JSON.stringify({ muted_kinds: mutedKinds }) }) }),
    onSuccess: prefs => {
      qc.setQueryData(queryKeys.board.activityPrefs, prefs);
      qc.invalidateQueries({ queryKey: queryKeys.board.activity });
    },
  });
}

/** `{ ids: [...] }` for a few rows, `{ all: true }` for everything. */
export type MarkActivityReadInput = { ids: string[] } | { all: true };

/**
 * The cached feed holds only the newest page, so `unread` is the tracker's total
 * stepped down by the rows this call turns read, never a recount of the page.
 */
function markRead(feed: BoardActivityFeed | undefined, input: MarkActivityReadInput, at: string): BoardActivityFeed {
  if (!feed) return EMPTY_ACTIVITY_FEED;
  if ('all' in input) return { items: feed.items.map(i => (i.readAt === null ? { ...i, readAt: at } : i)), unread: 0 };
  const ids = new Set(input.ids);
  let turned = 0;
  const items = feed.items.map(i => {
    if (i.readAt !== null || !ids.has(i.id)) return i;
    turned += 1;
    return { ...i, readAt: at };
  });
  return { items, unread: Math.max(0, feed.unread - turned) };
}

/** The tracker's answer to POST /activity/read; `unread` is its count after the write. */
interface MarkReadResponse {
  ok?: boolean;
  unread?: number;
}

/**
 * Marks rows read. The cache is updated before the request; the tracker's own
 * unread count replaces the estimate when it answers, and a refusal restores it.
 */
export function useMarkActivityRead() {
  const qc = useQueryClient();
  return useMutation<MarkReadResponse, Error, MarkActivityReadInput, { previous: BoardActivityFeed | undefined }>({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async input => daemonFetch<MarkReadResponse>('/activity/read', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: answer => {
      const unread = answer?.unread;
      if (typeof unread !== 'number' || !Number.isFinite(unread)) return;
      qc.setQueryData<BoardActivityFeed>(queryKeys.board.activity, feed => (feed ? { ...feed, unread } : feed));
    },
    onMutate: async input => {
      await qc.cancelQueries({ queryKey: queryKeys.board.activity });
      const previous = qc.getQueryData<BoardActivityFeed>(queryKeys.board.activity);
      qc.setQueryData<BoardActivityFeed>(queryKeys.board.activity, feed => markRead(feed, input, new Date().toISOString()));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.board.activity, context.previous);
    },
  });
}
