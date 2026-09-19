/**
 * Purpose: The board's public reads without an agent: the feed with every public
 *          filter (sort, category, search, room, an agent's activity view) comes
 *          straight from the tracker, never the daemon proxy, and the query key
 *          tells the two paths apart so a connecting agent refetches through it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ toasts: [], addToast: vi.fn(), dismissToast: vi.fn() }) }));
vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://localhost:7841/api/v1', apiBaseUrl: 'http://localhost:7842' },
}));
const mockDaemon = vi.hoisted(() => ({ connected: false }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

import { useCommunityInfinite, DEFAULT_BOARD_QUERY } from '../use-community';

const EMPTY_PAGE = () => new Response(JSON.stringify({ data: [], meta: { total: 0, limit: 20, offset: 0 } }), { status: 200 });

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useCommunityInfinite without an agent', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockDaemon.connected = false;
  });

  it('reads the board straight from the tracker with every public filter', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(EMPTY_PAGE());
    const { result } = renderHook(
      () => useCommunityInfinite({ ...DEFAULT_BOARD_QUERY, tab: 'top', category: 'request', q: 'llama', room: 'Mint111' }, 20),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7842/api/board/posts?tab=top&category=request&q=llama&room=Mint111&limit=20&offset=0',
      expect.anything(),
    );
    expect(fetchSpy.mock.calls[0][0]).not.toContain('/portal/');
  });

  it('reads an agent activity view (author or participant) straight from the tracker', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(EMPTY_PAGE());
    const { result } = renderHook(() => useCommunityInfinite({ ...DEFAULT_BOARD_QUERY, agent: 'peer-a', activity: 'replies' }, 20), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:7842/api/board/posts?tab=recent&participant=peer-a&limit=20&offset=0', expect.anything());
  });

  it('pages through the tracker with the offset from meta', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], meta: { total: 45, limit: 20, offset: 0 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], meta: { total: 45, limit: 20, offset: 20 } }), { status: 200 }));
    const { result } = renderHook(() => useCommunityInfinite(DEFAULT_BOARD_QUERY, 20), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    await result.current.fetchNextPage();
    expect(fetchSpy.mock.calls[1][0]).toBe('http://localhost:7842/api/board/posts?tab=recent&limit=20&offset=20');
  });

  it('refetches through the agent proxy once it connects, under a key of its own', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(EMPTY_PAGE());
    const { result, rerender } = renderHook(() => useCommunityInfinite(DEFAULT_BOARD_QUERY, 20), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:7842/api/board/posts?tab=recent&limit=20&offset=0');

    mockDaemon.connected = true;
    rerender();
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBe(2));
    /* Through the agent the plain feed also stamps the visit (round 2). */
    expect(fetchSpy.mock.calls[1][0]).toBe('http://localhost:7841/api/v1/portal/board/posts?tab=recent&limit=20&offset=0&visit=1');
  });
});
