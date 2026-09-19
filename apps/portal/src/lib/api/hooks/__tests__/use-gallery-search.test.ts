/**
 * Purpose: Tests for useGallerySearch hook — server-side search with debounce
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const mockApiClient = vi.fn();

vi.mock('@/lib/api/client', () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

import { useGallerySearch } from '../use-gallery-search';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useGallerySearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches /api/gallery/search without query param when query is empty', async () => {
    mockApiClient.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => useGallerySearch(''), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockApiClient).toHaveBeenCalledWith('/api/gallery/search');
  });

  it('fetches /api/gallery/search?q=... when query is provided', async () => {
    mockApiClient.mockResolvedValueOnce({
      items: [{ cid: 'bafytest', name: 'test.vec', type: '.vec', size: 1024, peers: 3, download_count: 10 }],
      total: 1,
    });

    const { result } = renderHook(() => useGallerySearch('test'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockApiClient).toHaveBeenCalledWith('/api/gallery/search?q=test');
    expect(result.current.data?.results[0].cid).toBe('bafytest');
    expect(result.current.data?.results[0].name).toBe('test.vec');
  });

  it('transforms response through transformGalleryResponse', async () => {
    mockApiClient.mockResolvedValueOnce({
      items: [{ cid: 'bafyabc', name: 'data.traj', type: '.traj', size: 2048, peers: 5, download_count: 42, author_peer_id: 'peer1', peer_rep: 50 }],
      total: 100,
      total_size_bytes: 2048,
    });

    const { result } = renderHook(() => useGallerySearch('data'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.results[0].downloads).toBe(42);
    expect(result.current.data?.results[0].size).toBe('2.0 KB');
    expect(result.current.data?.stats.totalShared).toBe('2.0 KB');
  });

  it('appends type param when typeFilter is provided', async () => {
    mockApiClient.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => useGallerySearch('model', '.vec'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockApiClient).toHaveBeenCalledWith('/api/gallery/search?q=model&type=.vec');
  });

  it('sends only type param when query is empty but typeFilter is set', async () => {
    mockApiClient.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => useGallerySearch('', '.traj'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockApiClient).toHaveBeenCalledWith('/api/gallery/search?type=.traj');
  });

  it('sends no type param when typeFilter is All', async () => {
    mockApiClient.mockResolvedValueOnce({ items: [], total: 0 });

    const { result } = renderHook(() => useGallerySearch('test', 'All'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockApiClient).toHaveBeenCalledWith('/api/gallery/search?q=test');
  });
});
