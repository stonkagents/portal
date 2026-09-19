/**
 * Purpose: Tests for useNodeStats hook — daemon node stats via React Query
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const { mockNodeStats, mockUseDaemon } = vi.hoisted(() => ({
  mockNodeStats: vi.fn(),
  mockUseDaemon: vi.fn().mockReturnValue({ connected: true, isOnline: true, health: null }),
}));

vi.mock('@/lib/api/daemon', () => ({
  daemonApi: { nodeStats: mockNodeStats },
}));

vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: mockUseDaemon,
}));

import { useNodeStats } from '../use-node-stats';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useNodeStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns node stats when daemon is connected', async () => {
    mockNodeStats.mockResolvedValue({
      uploadSpeed: 1024000,
      downloadSpeed: 512000,
      activePeers: 5,
      totalShared: '1.2 GB',
      reputation: 0.75,
      shareRatio: 1.5,
      uptime: '2h 30m',
    });

    const { result } = renderHook(() => useNodeStats(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.uploadSpeed).toBe(1024000);
    expect(result.current.data?.downloadSpeed).toBe(512000);
  });

  it('does not fetch when daemon is disconnected', () => {
    mockUseDaemon.mockReturnValue({ connected: false, isOnline: false, health: null });

    renderHook(() => useNodeStats(), { wrapper });

    expect(mockNodeStats).not.toHaveBeenCalled();
  });
});
