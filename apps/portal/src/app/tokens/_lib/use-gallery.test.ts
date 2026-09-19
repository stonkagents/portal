import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const listLaunches = vi.fn();
vi.mock('@/lib/api/launches', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/api/launches');
  return { ...actual, listLaunches: (...args: unknown[]) => listLaunches(...args) };
});
vi.mock('@/lib/api/hooks/use-tokens', () => ({
  useTokens: () => ({ data: [], isLoading: false, isFetched: true, isFetching: false, isError: false, refetch: vi.fn() }),
}));

import { useGallery } from './use-gallery';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 1 } } }) },
    children,
  );

afterEach(() => vi.clearAllMocks());

describe('useGallery failure state', () => {
  it('stays failed through the automatic retry instead of flipping to "nothing launched"', async () => {
    let release: (value: unknown) => void = () => undefined;
    listLaunches.mockRejectedValueOnce(new Error('down')).mockImplementationOnce(() => new Promise(resolve => (release = resolve)));

    const { result } = renderHook(() => useGallery(), { wrapper });
    expect(result.current.isLoading).toBe(false); // the legacy list answered already

    // While the retry is in flight react-query clears isError; the flag must not.
    await waitFor(() => expect(listLaunches).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(result.current.launchesFailed).toBe(true);
    expect(result.current.isRefetching).toBe(true);

    release({ items: [], total: 0, limit: 100, offset: 0, nextCursor: null });
    await waitFor(() => expect(result.current.launchesFailed).toBe(false));
    expect(result.current.isRefetching).toBe(false);
  });
});
