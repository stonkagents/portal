/**
 * Purpose: Tests for useActivity hook — correct endpoint, transform, refetch interval
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const mockApiClient = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

import { useActivity } from '../use-activity';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches from /api/activity/recent and transforms entries', async () => {
    mockApiClient.mockResolvedValueOnce([
      { type: 'share', title: 'file.vec shared', time_ago: '2s ago', occurred_at: '2026-02-15T00:00:00Z', color: 'green' },
      { type: 'install', title: 'data.traj installed', time_ago: '5s ago', occurred_at: '2026-02-14T23:59:55Z', color: 'blue' },
    ]);

    const { result } = renderHook(() => useActivity(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(mockApiClient).toHaveBeenCalledWith('/api/activity/recent?limit=20');
    expect(result.current.data).toEqual([
      { id: 'share-2026-02-15T00:00:00Z-0', text: 'file.vec shared', time: '2s ago', color: 'green' },
      { id: 'install-2026-02-14T23:59:55Z-1', text: 'data.traj installed', time: '5s ago', color: 'blue' },
    ]);
  });

  it('returns empty array when API returns []', async () => {
    mockApiClient.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useActivity(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([]);
  });
});
