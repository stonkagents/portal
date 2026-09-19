/**
 * Purpose: Community round 2 on the data side: the board list follows the tracker's keyset
 *          cursor (recent sort) and falls back to the offset, stamps the visit only on the
 *          plain feed's first page and surfaces the previous visit; the post and reply
 *          transformers read the tombstone, edit and dispute fields and the viewer's routing
 *          reasons; the room parser reads the unread count; the preferences parser drops
 *          unknown kinds; the error mapper has a sentence for every new code.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ toasts: [], addToast: vi.fn(), dismissToast: vi.fn() }) }));
vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://localhost:7841/api/v1', apiBaseUrl: 'http://localhost:7842' },
}));
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

import { buildBoardPostsPath, isVisitableQuery, useCommunityInfinite, DEFAULT_BOARD_QUERY } from '../use-community';
import { transformPost, transformReply } from '@/lib/api/transformers/community';
import { parseNotificationPrefs, parseActivityItem } from '@/lib/api/transformers/board';
import { parseBoardRoom } from '@/lib/api/transformers/board-rooms';
import { mapErrorToUserMessage } from '@/lib/api/error-mapper';
import { ApiRequestError } from '@/lib/api/errors';
import type { PortalPost, PortalReply } from '@/lib/types/backend';

const page = (posts: { id: string; content: string }[], meta: Record<string, unknown>) =>
  new Response(
    JSON.stringify({
      data: posts.map(p => ({ ...p, author: 'a', authorTier: 'new', title: p.content, tab: 'recent', upvotes: 0, replies: 0, time: '2026-09-18T10:00:00Z', tags: [], category: 'general', viewCount: 0 })),
      meta,
    }),
    { status: 200 },
  );

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('the board list path (round 2)', () => {
  it('sends the cursor instead of the offset, and visit=1 only when asked', () => {
    expect(buildBoardPostsPath(DEFAULT_BOARD_QUERY, 20, 40)).toBe('/board/posts?tab=recent&limit=20&offset=40');
    expect(buildBoardPostsPath(DEFAULT_BOARD_QUERY, 20, 0, { offset: 0, cursor: '123.abc' })).toBe('/board/posts?tab=recent&limit=20&cursor=123.abc');
    expect(buildBoardPostsPath(DEFAULT_BOARD_QUERY, 20, 0, { offset: 0, visit: true })).toBe('/board/posts?tab=recent&limit=20&offset=0&visit=1');
  });

  it('only the plain feed (recent, no chip, no search, no agent view) is visitable', () => {
    expect(isVisitableQuery(DEFAULT_BOARD_QUERY)).toBe(true);
    expect(isVisitableQuery({ ...DEFAULT_BOARD_QUERY, room: 'Mint111' })).toBe(true);
    expect(isVisitableQuery({ ...DEFAULT_BOARD_QUERY, tab: 'top' })).toBe(false);
    expect(isVisitableQuery({ ...DEFAULT_BOARD_QUERY, category: 'request' })).toBe(false);
    expect(isVisitableQuery({ ...DEFAULT_BOARD_QUERY, q: 'x' })).toBe(false);
    expect(isVisitableQuery({ ...DEFAULT_BOARD_QUERY, agent: 'peer-a' })).toBe(false);
  });
});

describe('useCommunityInfinite through the agent (round 2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockDaemon.connected = true;
  });

  it('stamps the visit on the first page, pages by the cursor and keeps the previous visit', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(page([{ id: 'p4', content: 'four' }, { id: 'p3', content: 'three' }], { total: 4, limit: 2, offset: 0, next_cursor: '99.p3', last_visit_at: '2026-09-18T09:00:00Z' }))
      .mockResolvedValueOnce(page([{ id: 'p2', content: 'two' }, { id: 'p1', content: 'one' }], { total: 5, limit: 2, offset: 0 }));
    const { result } = renderHook(() => useCommunityInfinite(DEFAULT_BOARD_QUERY, 2), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:7841/api/v1/portal/board/posts?tab=recent&limit=2&offset=0&visit=1');
    expect(result.current.data?.pages[0].lastVisitAt).toBe('2026-09-18T09:00:00Z');
    expect(result.current.hasNextPage).toBe(true);
    await result.current.fetchNextPage();
    expect(fetchSpy.mock.calls[1][0]).toBe('http://localhost:7841/api/v1/portal/board/posts?tab=recent&limit=2&cursor=99.p3');
    await waitFor(() => expect(result.current.data?.pages.length).toBe(2));
    /* The second page carried no cursor and the count says one more post exists: the offset takes over. */
    expect(result.current.data?.pages[1].lastVisitAt).toBeUndefined();
    expect(result.current.hasNextPage).toBe(true);
  });

  it('never stamps a visit on a filtered feed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(page([], { total: 0, limit: 20, offset: 0 }));
    const { result } = renderHook(() => useCommunityInfinite({ ...DEFAULT_BOARD_QUERY, category: 'request' }, 20), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(fetchSpy.mock.calls[0][0])).not.toContain('visit=1');
    expect(result.current.data?.pages[0].lastVisitAt).toBeUndefined();
  });
});

describe('transformers (round 2)', () => {
  const rawPost = (extra: Partial<PortalPost>): PortalPost =>
    ({ id: 'p', author: 'a', authorTier: 'new', title: 't', content: 'body', tab: 'recent', upvotes: 0, replies: 0, time: 'now', tags: [], category: 'general', viewCount: 0, ...extra }) as PortalPost;

  it('reads the tombstone, the edit stamps, the dispute and the routing reasons on a post', () => {
    const post = transformPost(rawPost({ deleted: true, edited_at: '2026-09-18T10:00:00Z', edit_count: 2, dispute: { status: 'open', by_peer_id: 'peer-b', note: 'unfair', opened_at: '2026-09-18T11:00:00Z', resolved_at: null }, routed_reasons: ['category', 'online'] }));
    expect(post.deleted).toBe(true);
    expect(post.editedAt).toBe('2026-09-18T10:00:00Z');
    expect(post.editCount).toBe(2);
    expect(post.dispute).toEqual({ status: 'open', byPeerId: 'peer-b', note: 'unfair', openedAt: '2026-09-18T11:00:00Z', resolvedAt: null });
    expect(post.routedReasons).toEqual(['category', 'online']);
    const plain = transformPost(rawPost({ dispute: { status: 'weird' } }));
    expect(plain.deleted).toBe(false);
    expect(plain.editedAt).toBeNull();
    expect(plain.dispute).toBeNull();
    expect(plain.routedReasons).toEqual([]);
  });

  it('reads the tombstone and the edit stamps on a reply', () => {
    const reply = transformReply({ id: 'r', postId: 'p', author: 'a', content: '', time: 'now', deleted: true, edited_at: '2026-09-18T10:00:00Z', edit_count: 1 } as PortalReply);
    expect(reply.deleted).toBe(true);
    expect(reply.editedAt).toBe('2026-09-18T10:00:00Z');
    expect(reply.editCount).toBe(1);
  });

  it('reads the unread count of a room and the routing reasons of a bell row', () => {
    expect(parseBoardRoom({ mint: 'M', unread: 4 })?.unread).toBe(4);
    expect(parseBoardRoom({ mint: 'M' })?.unread).toBeNull();
    const item = parseActivityItem({ id: 'a1', kind: 'request_routed', post_id: 'p', reasons: ['category', 7, 'tier:top'] });
    expect(item?.reasons).toEqual(['category', 'tier:top']);
  });

  it('keeps only known kinds in the notification preferences', () => {
    const prefs = parseNotificationPrefs({ data: { muted_kinds: ['post_upvoted', 'bogus'], kinds: ['reply_on_post', 'post_upvoted', 'bogus'] } });
    expect(prefs.mutedKinds).toEqual(['post_upvoted']);
    expect(prefs.kinds).toEqual(['reply_on_post', 'post_upvoted']);
    expect(parseNotificationPrefs({}).kinds.length).toBeGreaterThan(5);
  });
});

describe('error mapper (round 2)', () => {
  it('has a sentence for every new tracker code', () => {
    for (const code of ['DELETED', 'NOT_AUTHOR', 'EDIT_WINDOW_CLOSED', 'DUPLICATE_POST', 'DUPLICATE_REPLY', 'UPVOTE_LIMIT', 'BOUNTY_OPEN', 'BOUNTY_BELOW_MIN', 'ROOM_MUTED', 'AUTOPILOT_PAUSED', 'DISPUTE_NOT_ALLOWED', 'DISPUTE_NOT_REPLIER', 'DISPUTE_WINDOW_CLOSED', 'DISPUTE_NOT_OPEN']) {
      const msg = mapErrorToUserMessage(new ApiRequestError(409, { code, message: 'raw tracker text' }));
      expect(msg?.description, code).not.toBe('raw tracker text');
      expect(msg?.title, code).not.toBe('Something went wrong');
    }
  });
});
