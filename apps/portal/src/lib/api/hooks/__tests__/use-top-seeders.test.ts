/**
 * Purpose: Tests for useTopSeeders hook — leaderboard from /api/v1/tracker/leaderboard/seeders
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

import type { LeaderboardEntry } from '@/lib/types/backend';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from '@/lib/api/client';
import { useTopSeeders } from '../use-top-seeders';

const mockedApiClient = vi.mocked(apiClient);

const mockSeeders: LeaderboardEntry[] = [
  { rank: 1, masked_peer_id: 'peer-abc1...x7z9', total_upload_bytes: 50000000 },
  { rank: 2, masked_peer_id: 'peer-def2...w8y0', total_upload_bytes: 30000000 },
  { rank: 3, masked_peer_id: 'peer-ghi3...v9x1', total_upload_bytes: 10000000 },
];

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useTopSeeders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches top seeders from /api/v1/tracker/leaderboard/seeders with limit=5', async () => {
    mockedApiClient.mockResolvedValueOnce(mockSeeders);

    const { result } = renderHook(() => useTopSeeders(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedApiClient).toHaveBeenCalledWith('/api/v1/tracker/leaderboard/seeders?limit=5');
    expect(result.current.data).toHaveLength(3);
    expect(result.current.data![0].rank).toBe(1);
  });
});
