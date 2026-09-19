/**
 * Purpose: useBoardActivity polls GET /activity through the daemon proxy every
 *          60 s while the agent is connected and never offline; useMarkActivityRead
 *          posts `{ ids }` or `{ all: true }` to /activity/read, drops the unread
 *          count at once, and restores it when the tracker refuses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { queryKeys } from '@/lib/api/keys';
import type { BoardActivityFeed } from '@/lib/types/community';

vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://localhost:7841/api/v1', apiBaseUrl: 'http://localhost:7842' },
}));
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

import { useBoardActivity, useMarkActivityRead, BOARD_ACTIVITY_POLL_MS } from '../use-board-activity';

const ROWS = [
  {
    id: 'a1',
    kind: 'reply_on_post',
    post_id: 'p1',
    post_title: 'Need Q3 data',
    reply_id: 'r1',
    actor_peer_id: 'peer-2',
    actor_display_name: 'Bob',
    amount: null,
    created_at: '2026-09-16T10:00:00Z',
    read_at: null,
  },
  {
    id: 'a2',
    kind: 'bounty_awarded',
    post_id: 'p2',
    post_title: 'Benchmarks',
    reply_id: 'r2',
    actor_peer_id: 'peer-3',
    actor_display_name: null,
    amount: 200,
    created_at: '2026-09-16T11:00:00Z',
    read_at: null,
  },
];

function activityResponse(items = ROWS, unread = items.length) {
  return new Response(JSON.stringify({ data: { items, unread } }), { status: 200 });
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useBoardActivity', () => {
  beforeEach(() => {
    mockDaemon.connected = true;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reads the feed through the proxy, newest first, with the unread count', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(activityResponse());
    const { result } = renderHook(() => useBoardActivity(), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:7841/api/v1/portal/activity?limit=50', expect.anything());
    expect(result.current.data?.items.map(i => i.id)).toEqual(['a2', 'a1']);
    expect(result.current.data?.unread).toBe(2);
    expect(result.current.data?.items[0]).toMatchObject({ kind: 'bounty_awarded', postId: 'p2', amount: 200, actorDisplayName: null });
  });

  it('polls every 60 s while connected', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => activityResponse());
    const { result } = renderHook(() => useBoardActivity(), { wrapper: wrapperFor(makeClient()) });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isSuccess).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOARD_ACTIVITY_POLL_MS);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('asks nothing while the agent is offline', () => {
    mockDaemon.connected = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useBoardActivity(), { wrapper: wrapperFor(makeClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('useMarkActivityRead', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seeded(): QueryClient {
    const qc = makeClient();
    qc.setQueryData<BoardActivityFeed>(queryKeys.board.activity, {
      items: [
        { id: 'a2', kind: 'bounty_awarded', postId: 'p2', postTitle: 'B', replyId: null, actorPeerId: null, actorDisplayName: null, amount: 200, createdAt: '2026-09-16T11:00:00Z', symbol: null, decimals: null, roomMint: null, readAt: null },
        { id: 'a1', kind: 'reply_on_post', postId: 'p1', postTitle: 'A', replyId: 'r1', actorPeerId: 'peer-2', actorDisplayName: 'Bob', amount: null, createdAt: '2026-09-16T10:00:00Z', symbol: null, decimals: null, roomMint: null, readAt: null },
      ],
      unread: 70,
    });
    return qc;
  }

  it('posts the ids, steps the total down by the rows turned read, then takes the tracker count', async () => {
    const qc = seeded();
    let answer: () => void = () => {};
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () => new Promise(resolve => {
        answer = () => resolve(new Response(JSON.stringify({ data: { ok: true, unread: 68 } }), { status: 200 }));
      }),
    );
    const { result } = renderHook(() => useMarkActivityRead(), { wrapper: wrapperFor(qc) });
    result.current.mutate({ ids: ['a1', 'missing'] });
    // Optimistic: 70 minus the one cached row that was unread, not a recount of the 2-row page
    await waitFor(() => expect(qc.getQueryData<BoardActivityFeed>(queryKeys.board.activity)?.unread).toBe(69));
    answer();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData<BoardActivityFeed>(queryKeys.board.activity)?.unread).toBe(68);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/portal/activity/read',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ ids: ['a1', 'missing'] }) }),
    );
    const feed = qc.getQueryData<BoardActivityFeed>(queryKeys.board.activity)!;
    expect(feed.items.find(i => i.id === 'a1')?.readAt).not.toBeNull();
    expect(feed.items.find(i => i.id === 'a2')?.readAt).toBeNull();
  });

  it('marks everything read with { all: true }', async () => {
    const qc = seeded();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true, unread: 0 } }), { status: 200 }));
    const { result } = renderHook(() => useMarkActivityRead(), { wrapper: wrapperFor(qc) });
    result.current.mutate({ all: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/activity/read'), expect.objectContaining({ body: JSON.stringify({ all: true }) }));
    expect(qc.getQueryData<BoardActivityFeed>(queryKeys.board.activity)?.unread).toBe(0);
  });

  it('restores the cache when the tracker refuses', async () => {
    const qc = seeded();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'no' } }), { status: 401 }),
    );
    const { result } = renderHook(() => useMarkActivityRead(), { wrapper: wrapperFor(qc) });
    result.current.mutate({ all: true });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<BoardActivityFeed>(queryKeys.board.activity)?.unread).toBe(70);
  });
});
