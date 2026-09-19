/**
 * Purpose: Phase 2 room reads. useMyRooms asks GET /board/rooms?mine=1 through
 *          the proxy while the agent is connected and nothing offline; useRoom
 *          reads GET /board/rooms/{mint} through the agent when connected (so
 *          can_post is the viewer's) and straight from the tracker otherwise,
 *          answering null for a 404; the counts hook scopes to a room with
 *          ?room=; the list path carries room=.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://localhost:7841/api/v1', apiBaseUrl: 'http://localhost:7842' },
}));
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

import { useMyRooms, useRoom } from '../use-board-rooms';
import { boardCountsPath, useBoardCounts } from '../use-board-counts';
import { buildBoardPostsPath, DEFAULT_BOARD_QUERY, roomErrorMessage } from '../use-community';

const MINT = 'So11111111111111111111111111111111111111112';
const ROOM = { mint: MINT, symbol: 'STONK', name: 'Stonk', role: 'holder', posts_7d: 2, last_post_at: '2026-09-16T10:00:00Z' };

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('useMyRooms', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockDaemon.connected = true;
  });

  it('reads the rooms the viewer may post in through the proxy', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ data: [ROOM] }));
    const { result } = renderHook(() => useMyRooms(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:7841/api/v1/portal/board/rooms?mine=1', expect.anything());
    expect(result.current.data).toEqual([expect.objectContaining({ mint: MINT, symbol: 'STONK', role: 'holder', posts7d: 2 })]);
  });

  it('asks nothing offline', () => {
    mockDaemon.connected = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useMyRooms(), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('useRoom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockDaemon.connected = true;
  });

  it('reads one room through the agent with can_post', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ data: { ...ROOM, can_post: true } }));
    const { result } = renderHook(() => useRoom(MINT), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(`http://localhost:7841/api/v1/portal/board/rooms/${MINT}`, expect.anything());
    expect(result.current.data).toMatchObject({ mint: MINT, canPost: true });
  });

  it('reads straight from the tracker offline, where can_post is false', async () => {
    mockDaemon.connected = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ data: { ...ROOM, can_post: false } }));
    const { result } = renderHook(() => useRoom(MINT), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(fetchSpy.mock.calls[0][0])).toContain(`/api/board/rooms/${MINT}`);
    expect(result.current.data).toMatchObject({ mint: MINT, canPost: false });
  });

  it('is null for a mint the tracker has no room for', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ error: { code: 'NOT_FOUND', message: 'no room' } }, 404));
    const { result } = renderHook(() => useRoom(MINT), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('is idle without a mint', () => {
    const { result } = renderHook(() => useRoom(null), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('room scoping', () => {
  afterEach(() => vi.restoreAllMocks());

  it('scopes the counts to the room', async () => {
    expect(boardCountsPath()).toBe('/board/counts');
    expect(boardCountsPath(MINT)).toBe(`/board/counts?room=${MINT}`);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ data: { all: 3 } }));
    const { result } = renderHook(() => useBoardCounts(MINT), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(`http://localhost:7841/api/v1/portal/board/counts?room=${MINT}`, expect.anything());
    expect(result.current.data?.all).toBe(3);
  });

  it('sends room= on the list only for a room', () => {
    expect(buildBoardPostsPath({ ...DEFAULT_BOARD_QUERY, room: MINT }, 20, 0)).toBe(`/board/posts?tab=recent&room=${MINT}&limit=20&offset=0`);
    expect(buildBoardPostsPath(DEFAULT_BOARD_QUERY, 20, 0)).not.toContain('room=');
  });
});

describe('roomErrorMessage', () => {
  it('has words for every room refusal and none for the rest', () => {
    expect(roomErrorMessage('ROOM_NOT_HOLDER')?.title).toBe('Holders only');
    expect(roomErrorMessage('ROOM_CHECK_UNAVAILABLE')?.description).toBe('Could not confirm your token balance right now. Try again in a minute.');
    expect(roomErrorMessage('ROOM_UNKNOWN_MINT')?.description).toBe('That token has no room.');
    expect(roomErrorMessage('ROOM_NOT_AGENT')?.description).toBe("Only the token's agent can do that.");
    expect(roomErrorMessage('VALIDATION_ERROR')).toBeNull();
  });
});
