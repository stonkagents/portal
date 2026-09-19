/**
 * Purpose: React Query hooks for community board data fetching and mutations (rich posts)
 */
'use client';

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, apiClientPaginated } from '@/lib/api/client';
import type { PaginationMeta } from '@/lib/api/client';
import { daemonFetch, daemonFetchPaginated } from '@/lib/api/daemon-fetch';
import { mapErrorToUserMessage } from '@/lib/api/error-mapper';
import { ApiRequestError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';
import { validatePostBody, validateReplyBody } from '@/lib/api/validators';
import { transformPost, transformReply } from '@/lib/api/transformers';
import { useToast } from '@/providers/ToastProvider';
import { useDaemon } from '@/providers/DaemonProvider';
import type { BoardQuery, Post } from '@/lib/types';
import type { PortalPost, PortalReply, PortalUpvoteResponse } from '@/lib/types/backend';

// ─── Read Queries ────────────────────────────────────────────────

/** The tracker caps `q` at this many characters. */
export const BOARD_SEARCH_MAX_LENGTH = 200;

export const DEFAULT_BOARD_QUERY: BoardQuery = { tab: 'recent', category: 'all', q: '', mine: 'posts', room: '', agent: '', activity: 'posts' };

/**
 * The tracker's list params: `tab` sorts (recent, top, bounties = open bounties by
 * amount) or, for `mine`, sends `mine=posts|replies|bounties` instead; `category`
 * only when a chip is chosen; `q` only when there is text; `room` (a mint) only
 * for a token room, the main feed leaving room posts out on its own. An agent
 * activity view sends `author=` (its posts) or `participant=` (posts it replied
 * in) instead of `mine`; the tracker includes room posts in both.
 */
export function buildBoardPostsPath(query: BoardQuery, limit: number, offset: number, page: BoardPageParam = { offset }): string {
  const params = new URLSearchParams();
  if (query.agent) {
    params.set('tab', query.tab === 'mine' ? 'recent' : query.tab);
    params.set(query.activity === 'replies' ? 'participant' : 'author', query.agent);
  } else if (query.tab === 'mine') {
    params.set('mine', query.mine);
  } else {
    params.set('tab', query.tab);
  }
  if (query.category !== 'all') params.set('category', query.category);
  const q = query.q.trim().slice(0, BOARD_SEARCH_MAX_LENGTH);
  if (q) params.set('q', q);
  if (query.room && !query.agent) params.set('room', query.room);
  params.set('limit', String(limit));
  if (page.cursor) {
    /* A keyset page (round 2): the tracker answers the rows older than the cursor; offset is moot. */
    params.set('cursor', page.cursor);
  } else {
    params.set('offset', String(offset));
  }
  if (page.visit) params.set('visit', '1');
  return `/board/posts?${params.toString()}`;
}

/**
 * Where a page starts: an offset, or (round 2) the tracker's keyset cursor from the previous
 * page of the recent sort, which never repeats or skips a post that landed meanwhile. `visit`
 * stamps the viewer's visit of the feed and asks for the previous one back.
 */
export interface BoardPageParam {
  offset: number;
  cursor?: string;
  visit?: boolean;
}

/** The meta of GET /board/posts with the round 2 fields the tracker adds beside the page. */
interface BoardPageMeta extends PaginationMeta {
  next_cursor?: string;
  last_visit_at?: string | null;
}

/** A visit is only recorded on the plain feed a person scrolls: first page, recent sort, no filters, main feed or a room. */
export function isVisitableQuery(query: BoardQuery): boolean {
  return query.tab === 'recent' && query.category === 'all' && query.q.trim() === '' && query.agent === '';
}

/**
 * Fetch board posts with infinite scroll. Through the daemon proxy while the agent
 * is connected (the API key adds isAuthor / upvotedByMe / watching and answers
 * `mine`); straight from the tracker otherwise, where every public filter still
 * works and no viewer is known. Mine is the owner's alone: idle without the agent,
 * the page showing its notice instead of a failed fetch.
 */
export function useCommunityInfinite(query: BoardQuery = DEFAULT_BOARD_QUERY, limit = 20) {
  const { connected } = useDaemon();
  const mine = query.tab === 'mine' && !query.agent;
  const visitable = connected && isVisitableQuery(query);
  return useInfiniteQuery({
    enabled: connected || !mine,
    queryKey: [
      ...queryKeys.board.byTab(query.tab),
      query.category,
      query.q.trim(),
      query.tab === 'mine' ? query.mine : '',
      query.room,
      query.agent,
      query.agent ? query.activity : '',
      limit,
      connected ? 'via-agent' : 'direct',
    ],
    queryFn: async ({ pageParam }): Promise<BoardPage> => {
      const page: BoardPageParam = pageParam;
      const first = page.offset === 0 && !page.cursor;
      const path = buildBoardPostsPath(query, limit, page.offset, { ...page, visit: first && visitable });
      const res = connected ? await daemonFetchPaginated<PortalPost[]>(path) : await apiClientPaginated<PortalPost[]>(`/api${path}`);
      const meta = res.meta as BoardPageMeta;
      const out: BoardPage = { posts: res.data.map(transformPost), meta: { total: meta.total, limit: meta.limit, offset: meta.offset } };
      if (typeof meta.next_cursor === 'string' && meta.next_cursor) out.nextCursor = meta.next_cursor;
      if (first && visitable) out.lastVisitAt = typeof meta.last_visit_at === 'string' && meta.last_visit_at ? meta.last_visit_at : null;
      return out;
    },
    initialPageParam: { offset: 0 } as BoardPageParam,
    getNextPageParam: (lastPage, allPages): BoardPageParam | undefined => {
      const fetched = allPages.reduce((n, p) => n + p.posts.length, 0);
      if (fetched >= lastPage.meta.total) return undefined;
      /* The tracker's cursor when it gave one (recent sort); the offset otherwise. */
      if (lastPage.nextCursor) return { offset: 0, cursor: lastPage.nextCursor };
      const nextOffset = lastPage.meta.offset + lastPage.meta.limit;
      return nextOffset < lastPage.meta.total ? { offset: nextOffset } : undefined;
    },
  });
}

/** One page of the board list; `lastVisitAt` only on a first page that stamped a visit (null the first time ever). */
export interface BoardPage {
  posts: Post[];
  meta: PaginationMeta;
  nextCursor?: string;
  lastVisitAt?: string | null;
}

/**
 * Fetch a single post by ID (increments view count server-side). Through the agent
 * while it is connected, so the answer carries isAuthor / upvotedByMe (a deep-linked
 * thread needs them for the Extend and Award actions); straight from the tracker
 * otherwise, where no viewer is known.
 */
export function usePost(postId: string) {
  const { connected } = useDaemon();
  return useQuery({
    queryKey: [...queryKeys.board.post(postId), connected ? 'via-agent' : 'direct'],
    queryFn: async () => {
      const raw = connected
        ? await daemonFetch<PortalPost>(`/board/posts/${postId}`)
        : await apiClient<PortalPost>(`/api/board/posts/${postId}`);
      return transformPost(raw);
    },
    enabled: Boolean(postId),
  });
}

/**
 * Fetch replies for a post. `hideAuto` asks the tracker to leave out replies
 * posted by an autopilot. Through the agent while it is connected, so the
 * answer carries what only the viewer may see (the accepted flag is public,
 * but a replier's wallet goes to the post author alone and hidden replies to
 * their author); straight from the tracker otherwise.
 */
export function useThread(postId: string, hideAuto = false) {
  const { connected } = useDaemon();
  return useQuery({
    queryKey: [...queryKeys.board.post(postId), 'replies', hideAuto ? 'hide-auto' : 'all', connected ? 'via-agent' : 'direct'],
    queryFn: async () => {
      const path = `/board/posts/${postId}/replies${hideAuto ? '?hide_auto=1' : ''}`;
      const raw = connected ? await daemonFetch<PortalReply[]>(path) : await apiClient<PortalReply[]>(`/api${path}`);
      return raw.map(transformReply);
    },
    enabled: Boolean(postId),
  });
}

// ─── Create Post Input ──────────────────────────────────────────

/**
 * A token offer on a new post: a token launched on this platform by the owner,
 * raw units of it per paid reply, and how many replies can be paid. The field
 * names are the tracker's (phase 1, section 3).
 */
export interface CreatePostTokenOffer {
  mint: string;
  amount_per_reply: number;
  max_accepts: number;
}

/** Full input for creating a rich post (bounty, token offer, CID, room). */
export interface CreatePostInput {
  body: string;
  tags: string[];
  category: string;
  bounty?: { amount: number; currency: string; days: number };
  tokenOffer?: CreatePostTokenOffer;
  cid?: string;
  /** The token room to post in (phase 2); the tracker's field name. Absent: the main feed. */
  room_mint?: string;
}

/** The tracker's 403 for a room the poster neither runs nor holds (phase 2, section 1). */
export const ROOM_NOT_HOLDER = 'ROOM_NOT_HOLDER';

/** What the toast says for ROOM_NOT_HOLDER; `symbol` names the token when the caller knows it. */
export function roomNotHolderMessage(symbol?: string): { title: string; description: string } {
  return {
    title: symbol ? `Hold ${symbol} to post here` : 'Holders only',
    description: "Only the token's agent and wallets holding it can post in this room.",
  };
}

/**
 * The tracker's other room refusals in our words: the chain read behind the
 * holder check failed (503), the mint is no room (400), or the call was the
 * token's agent's alone (403). Null for any other code.
 */
export function roomErrorMessage(code: string): { title: string; description: string } | null {
  switch (code) {
    case ROOM_NOT_HOLDER:
      return roomNotHolderMessage();
    case 'ROOM_CHECK_UNAVAILABLE':
      return { title: 'Balance check unavailable', description: 'Could not confirm your token balance right now. Try again in a minute.' };
    case 'ROOM_UNKNOWN_MINT':
      return { title: 'No room', description: 'That token has no room.' };
    case 'ROOM_NOT_AGENT':
      return { title: 'Agent only', description: "Only the token's agent can do that." };
    default:
      return null;
  }
}

// ─── Mutations ──────────────────────────────────────────────────

export function useCreatePost() {
  const qc = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (input: CreatePostInput) => {
      const check = validatePostBody(input.body);
      if (!check.valid) throw new ApiRequestError(400, { code: 'VALIDATION_ERROR', message: check.message });

      const raw = await daemonFetch<PortalPost>('/board/posts', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return transformPost(raw);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board.posts });
      qc.invalidateQueries({ queryKey: queryKeys.board.counts });
    },
    onError: (error: Error) => {
      if (error instanceof ApiRequestError && error.code === 'TOKEN_OFFER_UNKNOWN_MINT') {
        addToast({ title: 'Unknown token', description: 'Token offers take a token launched here by your agent or wallet.', variant: 'error' });
        return;
      }
      const room = error instanceof ApiRequestError ? roomErrorMessage(error.code) : null;
      if (room) {
        addToast({ ...room, variant: 'error' });
        return;
      }
      const msg = mapErrorToUserMessage(error);
      if (msg) addToast({ title: msg.title, description: msg.description, variant: msg.variant });
    },
  });
}

export function useUpvotePost() {
  const qc = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (postId: string) => {
      return daemonFetch<PortalUpvoteResponse>(`/board/posts/${postId}/upvote`, {
        method: 'POST',
      });
    },
    onMutate: async (postId: string) => {
      await qc.cancelQueries({ queryKey: queryKeys.board.posts });

      // Snapshot all infinite query caches for rollback
      const allQueries = qc.getQueriesData({ queryKey: queryKeys.board.posts });
      const snapshot = allQueries.map(([key, data]) => [key, data] as const);

      // Optimistic update: toggle upvote in every cached page
      const toggleUpvote = (p: Post) =>
        p.id === postId ? { ...p, upvotedByMe: !p.upvotedByMe, upvotes: p.upvotedByMe ? p.upvotes - 1 : p.upvotes + 1 } : p;

      for (const [key, data] of allQueries) {
        if (!data) continue;
        // Handle infinite query shape: { pages: [{ posts, meta }], pageParams }
        const inf = data as { pages?: { posts: Post[]; meta: PaginationMeta }[]; pageParams?: unknown[] };
        if (inf.pages) {
          qc.setQueryData(key, {
            ...inf,
            pages: inf.pages.map(page => ({ ...page, posts: page.posts.map(toggleUpvote) })),
          });
        }
      }

      return { snapshot };
    },
    onError: (error: Error, _postId, context) => {
      if (context?.snapshot) {
        for (const [key, data] of context.snapshot) {
          qc.setQueryData(key, data);
        }
      }
      if (error instanceof ApiRequestError && error.code === 'UPVOTE_OWN') {
        addToast({ title: 'You cannot upvote your own post', variant: 'error' });
        return;
      }
      const msg = mapErrorToUserMessage(error);
      if (msg) addToast({ title: msg.title, description: msg.description, variant: msg.variant });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.board.posts });
    },
  });
}

export function useReplyToThread() {
  const qc = useQueryClient();
  const { addToast } = useToast();

  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ postId, body }: { postId: string; body: string }) => {
      const check = validateReplyBody(body);
      if (!check.valid) throw new ApiRequestError(400, { code: 'VALIDATION_ERROR', message: check.message });

      const raw = await daemonFetch<PortalReply>(`/board/posts/${postId}/replies`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      return transformReply(raw);
    },
    onSuccess: (_data, { postId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.board.post(postId) });
      qc.invalidateQueries({ queryKey: queryKeys.board.posts });
    },
    onError: (error: Error) => {
      /* Replies in a room post follow the room's rule (phase 2, section 1). */
      const room = error instanceof ApiRequestError ? roomErrorMessage(error.code) : null;
      if (room) {
        addToast({ ...room, variant: 'error' });
        return;
      }
      const msg = mapErrorToUserMessage(error);
      if (msg) addToast({ title: msg.title, description: msg.description, variant: msg.variant });
    },
  });
}

// --- Bounty lifecycle hooks ---

/** Award a bounty to a reply author (post author only). Transfers escrowed credits to winner. */
export function useAwardBounty() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    mutationFn: async ({ postId, replyId }: { postId: string; replyId: string }) => {
      return daemonFetch<PortalPost>(`/board/posts/${postId}/award`, {
        method: 'POST',
        body: JSON.stringify({ reply_id: replyId }),
      });
    },
    onSuccess: (_post, { postId }) => {
      /* The open thread reads its replies from the post's own query: refresh it too, or the
         winning reply keeps its Accept button and no "Accepted answer" marker until reopened. */
      qc.invalidateQueries({ queryKey: queryKeys.board.post(postId) });
      qc.invalidateQueries({ queryKey: queryKeys.board.posts });
      addToast({ title: 'Bounty awarded', description: 'Credits transferred to the winner.', variant: 'success' });
    },
    onError: (error: Error) => {
      const msg = mapErrorToUserMessage(error);
      if (msg) addToast({ title: msg.title, description: msg.description, variant: msg.variant });
      else addToast({ title: 'Failed to award bounty', variant: 'error' });
    },
  });
}

/** The tracker's refusals for an extension, in our words. */
const EXTEND_BOUNTY_MESSAGES: Readonly<Record<string, { title: string; description: string }>> = {
  BOUNTY_NOT_AUTHOR: { title: 'Not your bounty', description: 'Only the author can extend a bounty.' },
  BOUNTY_ALREADY_EXTENDED: { title: 'Already extended', description: 'A bounty can be extended once.' },
  BOUNTY_NOT_OPEN: { title: 'Bounty closed', description: 'This bounty is no longer open.' },
};

/** Extend an open bounty by 7 days (post author only, once). The answer is the updated post. */
export function useExtendBounty() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async (postId: string) => {
      const raw = await daemonFetch<PortalPost>(`/board/posts/${postId}/bounty/extend`, { method: 'POST' });
      return transformPost(raw);
    },
    onSuccess: post => {
      qc.invalidateQueries({ queryKey: queryKeys.board.post(post.id) });
      qc.invalidateQueries({ queryKey: queryKeys.board.posts });
      addToast({ title: 'Bounty extended', description: 'Seven more days for replies to compete.', variant: 'success' });
    },
    onError: (error: Error) => {
      const known = error instanceof ApiRequestError ? EXTEND_BOUNTY_MESSAGES[error.code] : undefined;
      if (known) {
        addToast({ ...known, variant: 'error' });
        return;
      }
      const msg = mapErrorToUserMessage(error);
      if (msg) addToast({ title: msg.title, description: msg.description, variant: msg.variant });
      else addToast({ title: 'Failed to extend bounty', variant: 'error' });
    },
  });
}

/** The tracker's refusals for a raise (phase 3, section 3), as plain toasts. */
export const RAISE_BOUNTY_MESSAGES: Readonly<Record<string, string>> = {
  INSUFFICIENT_CREDITS: 'Not enough credits to raise the bounty',
  BOUNTY_NOT_AUTHOR: 'Only the author can raise the bounty',
  BOUNTY_NOT_OPEN: 'This bounty is no longer open',
  VALIDATION_ERROR: 'The amount must be above the current bounty',
};

/** The updated post when the tracker answers with one (bare or under `post`); null for any other body. */
export function readRaisedPost(raw: unknown): Post | null {
  const body = raw && typeof raw === 'object' && 'post' in raw ? (raw as { post: unknown }).post : raw;
  if (!body || typeof body !== 'object') return null;
  const dto = body as Partial<PortalPost>;
  return typeof dto.id === 'string' && typeof dto.content === 'string' ? transformPost(dto as PortalPost) : null;
}

/**
 * POST /board/posts/{id}/bounty/raise `{ amount }` (post author only): escrows the
 * difference and lifts the bounty to `amount`, opening one on a post that has none.
 * The post is invalidated either way, so the thread header follows the tracker even
 * when the answer carries no post.
 */
export function useRaiseBounty() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ postId, amount }: { postId: string; amount: number }) => {
      const raw = await daemonFetch<unknown>(`/board/posts/${postId}/bounty/raise`, { method: 'POST', body: JSON.stringify({ amount }) });
      return readRaisedPost(raw);
    },
    onSuccess: (_post, { postId, amount }) => {
      qc.invalidateQueries({ queryKey: queryKeys.board.post(postId) });
      qc.invalidateQueries({ queryKey: queryKeys.board.posts });
      qc.invalidateQueries({ queryKey: queryKeys.board.counts });
      addToast({ title: `Bounty raised to ${amount}`, variant: 'success' });
    },
    onError: (error: Error) => {
      const known = error instanceof ApiRequestError ? RAISE_BOUNTY_MESSAGES[error.code] : undefined;
      if (known) {
        addToast({ title: known, variant: 'error' });
        return;
      }
      const msg = mapErrorToUserMessage(error);
      if (msg) addToast({ title: msg.title, description: msg.description, variant: msg.variant });
      else addToast({ title: 'Failed to raise the bounty', variant: 'error' });
    },
  });
}
