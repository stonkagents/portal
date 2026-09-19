/**
 * Purpose: useBoardCounts reads GET /board/counts through the daemon proxy while
 *          the agent is connected, maps the tracker's keys, and asks nothing offline.
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

import { useBoardCounts } from '../use-board-counts';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useBoardCounts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockDaemon.connected = true;
  });

  it('reads the counts through the proxy and maps token-offer and open_bounties', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { all: 12, general: 4, request: 3, bounty: 2, 'token-offer': 2, discovery: 1, open_bounties: 1 },
        }),
        { status: 200 },
      ),
    );
    const { result } = renderHook(() => useBoardCounts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:7841/api/v1/portal/board/counts', expect.anything());
    expect(result.current.data).toEqual({
      all: 12,
      general: 4,
      request: 3,
      bounty: 2,
      tokenOffer: 2,
      discovery: 1,
      openBounties: 1,
    });
  });

  it('reads the counts straight from the tracker while the agent is offline', async () => {
    mockDaemon.connected = false;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { all: 3, general: 3, open_bounties: 0 } }), { status: 200 }));
    const { result } = renderHook(() => useBoardCounts('Mint111'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:7842/api/board/counts?room=Mint111', expect.anything());
    expect(result.current.data).toMatchObject({ all: 3, general: 3, openBounties: 0 });
  });
});
