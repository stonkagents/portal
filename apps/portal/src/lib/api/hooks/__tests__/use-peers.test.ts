/**
 * Purpose: Tests for peer hooks — reputation, assets, activity, untrust, unblock, trusted/blocked lists
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// Mock app config
vi.mock('@/lib/config/app.config', () => ({
  appConfig: {
    daemonUrl: 'http://localhost:7841/api/v1',
    apiBaseUrl: 'http://localhost:7842',
  },
}));

// Trusted/blocked lists are read through the agent; connected unless a test says otherwise
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

import {
  usePeerReputation,
  usePeerAssets,
  usePeerActivity,
  useUntrustPeer,
  useUnblockPeer,
  useTrustedPeers,
  useBlockedPeers,
  readPeerIdList,
} from '../use-peers';
import { queryKeys } from '@/lib/api/keys';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('usePeerReputation', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('fetches reputation for a peer ID', async () => {
    const mockData = {
      composite_score: 0.65,
      bandwidth_score: 0.8,
      quality_score: 0.5,
      security_score: 0.7,
      citizenship_score: 0.6,
      tier: 'Gold',
      badges: [{ id: 'early_adopter', status: 'earned' }],
      weekly_bonus: 50,
      trend: 0.05,
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: mockData }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const { result } = renderHook(() => usePeerReputation('peer-abc'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      clout: 65,
      rank: 'gold',
      factors: [
        { name: 'Bandwidth', value: 8.0, weight: 40, color: 'green' },
        { name: 'Quality', value: 5.0, weight: 30, color: 'blue' },
        { name: 'Security', value: 7.0, weight: 20, color: 'yellow' },
        { name: 'Citizenship', value: 6.0, weight: 10, color: 'green' },
      ],
      badges: [{ id: 'early_adopter', icon: 'zap', label: 'Early Adopter', status: 'earned' }],
      weeklyBonus: 50,
      trend: 0.05,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:7842/api/peers/peer-abc/reputation',
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
    );
  });

  it('is disabled when peerId is empty', () => {
    const { result } = renderHook(() => usePeerReputation(''), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('usePeerAssets', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('fetches assets for a peer ID', async () => {
    const mockAssets = [
      { cid: 'Qm123', filename: 'model.at-vec', file_type: '.at-vec', size_bytes: 1048576, download_count: 42 },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: mockAssets }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const { result } = renderHook(() => usePeerAssets('peer-abc'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].cid).toBe('Qm123');
  });
});

describe('usePeerActivity', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('fetches activity for a peer ID', async () => {
    const mockActivity = [
      { action: 'trusted_by', details: 'Trusted by peer-xyz', time: '2026-02-16T12:00:00Z' },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: mockActivity }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const { result } = renderHook(() => usePeerActivity('peer-abc'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].action).toBe('trusted_by');
  });
});

describe('useUntrustPeer', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sends DELETE to daemon proxy for untrust', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { success: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const { result } = renderHook(() => useUntrustPeer(), { wrapper: createWrapper() });
    result.current.mutate('peer-abc');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/portal/peers/peer-abc/trust',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('useUnblockPeer', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sends DELETE to daemon proxy for unblock', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { success: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const { result } = renderHook(() => useUnblockPeer(), { wrapper: createWrapper() });
    result.current.mutate('peer-abc');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/portal/peers/peer-abc/block',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('useTrustedPeers', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('fetches trusted peer list from daemon proxy', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { peer_ids: ['peer-a', 'peer-b'] } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const { result } = renderHook(() => useTrustedPeers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.peer_ids).toEqual(['peer-a', 'peer-b']);
  });
});

describe('useBlockedPeers', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('fetches blocked peer list from daemon proxy', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { peer_ids: ['peer-c'] } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const { result } = renderHook(() => useBlockedPeers(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.peer_ids).toEqual(['peer-c']);
  });

  it('does not ask the agent for either list while it is offline', () => {
    mockDaemon.connected = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const trusted = renderHook(() => useTrustedPeers(), { wrapper: createWrapper() });
    const blocked = renderHook(() => useBlockedPeers(), { wrapper: createWrapper() });

    expect(trusted.result.current.fetchStatus).toBe('idle');
    expect(blocked.result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
    mockDaemon.connected = true;
  });
});

describe('query keys', () => {
  it('has reputation key factory', () => {
    expect(queryKeys.peers.reputation('abc')).toEqual(['peers', 'abc', 'reputation']);
  });

  it('has assets key factory', () => {
    expect(queryKeys.peers.assets('abc')).toEqual(['peers', 'abc', 'assets']);
  });

  it('has activity key factory', () => {
    expect(queryKeys.peers.activity('abc')).toEqual(['peers', 'abc', 'activity']);
  });

  it('has trusted list key', () => {
    expect(queryKeys.peers.trusted).toEqual(['peers', 'trusted']);
  });

  it('has blocked list key', () => {
    expect(queryKeys.peers.blocked).toEqual(['peers', 'blocked']);
  });
});

describe('trusted and blocked lists in the shape the tracker sends', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('reads `data: [ids]`, the bare array, for both lists', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: ['peer-a', 'peer-b'] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: ['peer-c'] }), { status: 200 }));

    const trusted = renderHook(() => useTrustedPeers(), { wrapper: createWrapper() });
    await waitFor(() => expect(trusted.result.current.isSuccess).toBe(true));
    expect(trusted.result.current.data?.peer_ids).toEqual(['peer-a', 'peer-b']);

    const blocked = renderHook(() => useBlockedPeers(), { wrapper: createWrapper() });
    await waitFor(() => expect(blocked.result.current.isSuccess).toBe(true));
    expect(blocked.result.current.data?.peer_ids).toEqual(['peer-c']);
  });

  it('still reads { peer_ids } and { peerIds }, and is empty for anything else', () => {
    expect(readPeerIdList({ peer_ids: ['a'] })).toEqual({ peer_ids: ['a'] });
    expect(readPeerIdList({ peerIds: ['b'] })).toEqual({ peer_ids: ['b'] });
    expect(readPeerIdList(['c', 7, '', null])).toEqual({ peer_ids: ['c'] });
    expect(readPeerIdList(null)).toEqual({ peer_ids: [] });
    expect(readPeerIdList({ peer_ids: 'nope' })).toEqual({ peer_ids: [] });
  });
});
