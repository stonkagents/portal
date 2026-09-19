/**
 * Purpose: Tests for useBoardStats hook — network stats from /api/v1/tracker/stats
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

import type { DashboardStats } from '@/lib/types/backend';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from '@/lib/api/client';
import { useBoardStats } from '../use-board-stats';

const mockedApiClient = vi.mocked(apiClient);

const mockStats: DashboardStats = {
  total_peers: 42,
  online_peers: 15,
  offline_peers: 27,
  total_seeders: 8,
  total_leechers: 7,
  total_assets: 120,
  total_upload_bytes: 5000000,
  total_download_bytes: 3000000,
  trending_count: 5,
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useBoardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches dashboard stats from /api/v1/tracker/stats', async () => {
    mockedApiClient.mockResolvedValueOnce(mockStats);

    const { result } = renderHook(() => useBoardStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedApiClient).toHaveBeenCalledWith('/api/v1/tracker/stats');
    expect(result.current.data?.online_peers).toBe(15);
    expect(result.current.data?.total_assets).toBe(120);
  });
});
