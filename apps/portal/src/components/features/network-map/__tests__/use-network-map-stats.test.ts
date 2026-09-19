/**
 * Purpose: The map reads peers through the shared ['peers'] query: one cache entry, one
 *          fetch and one polling timer no matter how many maps or pages observe it.
 */
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/api/keys';
import { usePeers } from '@/lib/api/hooks/use-peers';
import { NETWORK_MAP_POLL_MS, useNetworkMapStats } from '../use-network-map-stats';

const fetchSpy = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiClient: (path: string) => fetchSpy(path),
}));

const rawPeer = (id: string, country: string, status = 'online') => ({
  id,
  name: `peer-${id}`,
  peerId: `12D3${id}`,
  status,
  reputation: 5,
  tier: 'bronze',
  sharedFiles: 0,
  location: '',
  country,
  city: '',
  lat: 0,
  lng: 0,
  totalUploadBytes: 0,
  totalDownloadBytes: 0,
  lastSeen: '',
});

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

describe('useNetworkMapStats', () => {
  it('shares the peers query with usePeers: two observers, one fetch, one cache entry', async () => {
    fetchSpy.mockReset();
    fetchSpy.mockImplementation(async (path: string) => {
      if (path === '/api/peers') return [rawPeer('1', 'US'), rawPeer('2', 'DE', 'offline'), rawPeer('3', '')];
      if (path === '/api/v1/tracker/stats') return { total_peers: 3, online_peers: 2, offline_peers: 1 };
      throw new Error(`unexpected ${path}`);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = wrapperFor(client);

    const map = renderHook(() => useNetworkMapStats(), { wrapper });
    const page = renderHook(() => usePeers(), { wrapper });

    await waitFor(() => expect(map.result.current.peers).toHaveLength(3));
    await waitFor(() => expect(page.result.current.data).toHaveLength(3));

    expect(fetchSpy.mock.calls.filter(([p]) => p === '/api/peers')).toHaveLength(1);
    expect(client.getQueryCache().findAll({ queryKey: queryKeys.peers.all, exact: true })).toHaveLength(1);
    expect(map.result.current.peers).toBe(page.result.current.data);
  });

  it('derives HUD numbers from tracker stats and country counts from the peer list', async () => {
    fetchSpy.mockReset();
    fetchSpy.mockImplementation(async (path: string) => {
      if (path === '/api/peers') return [rawPeer('1', 'US'), rawPeer('2', 'DE', 'offline'), rawPeer('3', '')];
      return { total_peers: 30, online_peers: 20, offline_peers: 10 };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNetworkMapStats(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.live).not.toBeNull());
    expect(result.current.live).toEqual({ onlinePeers: 20, offlinePeers: 10, totalPeers: 30 });
    await waitFor(() => expect(result.current.countries).not.toBeNull());
    expect(result.current.countries?.byCountry).toEqual({ '840': 1 });
    expect(result.current.countries?.unknown).toBe(1);
  });

  it('polls the shared query once a minute and shows no peers while the tracker is down', async () => {
    fetchSpy.mockReset();
    fetchSpy.mockRejectedValue(new Error('tracker down'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNetworkMapStats(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(client.getQueryCache().find({ queryKey: queryKeys.peers.all })?.state.status).toBe('error'));
    expect(result.current.peers).toEqual([]);
    expect(result.current.countries).toBeNull();
    expect(result.current.live).toBeNull();

    const query = client.getQueryCache().find({ queryKey: queryKeys.peers.all, exact: true });
    const intervals = query?.observers.map(o => o.options.refetchInterval);
    expect(intervals).toEqual([NETWORK_MAP_POLL_MS]);
  });
});
