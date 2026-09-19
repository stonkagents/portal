/**
 * Purpose: Tests for useLaunchDetail — the home page trusts a remembered launch
 *          only when the tracker confirms it, so the hook must distinguish
 *          "not a launch" (any 4xx) from "tracker unreachable" (network / 5xx).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

const mockGetLaunch = vi.fn();
vi.mock('@/lib/api/launches', () => {
  class LaunchApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string,
    ) {
      super(message);
    }
  }
  return {
    getLaunch: (...args: unknown[]) => mockGetLaunch(...args),
    LaunchApiError,
    launchKeys: { detail: (mint: string) => ['launches', 'detail', mint] },
  };
});

import { LaunchApiError } from '@/lib/api/launches';
import { useLaunchDetail } from './use-launch-detail';

const MINT = 'MinT1111111111111111111111111111111111111111';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useLaunchDetail', () => {
  beforeEach(() => {
    mockGetLaunch.mockReset();
  });

  it('returns the record when the tracker has the launch', async () => {
    mockGetLaunch.mockResolvedValue({ mint: MINT, status: 'confirmed' });
    const { result } = renderHook(() => useLaunchDetail(MINT), { wrapper });
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toMatchObject({ mint: MINT });
    expect(result.current.isError).toBe(false);
  });

  it('treats a 404 as "no launch", not an error', async () => {
    mockGetLaunch.mockRejectedValue(new LaunchApiError('launch not found', 404, 'NOT_FOUND'));
    const { result } = renderHook(() => useLaunchDetail(MINT), { wrapper });
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('treats a 400 for a mint that is not a real public key as "no launch" too', async () => {
    mockGetLaunch.mockRejectedValue(new LaunchApiError('mint must be a base58 32-byte public key', 400, 'VALIDATION_ERROR'));
    const { result } = renderHook(() => useLaunchDetail('mock-mint-from-the-old-wizard'), { wrapper });
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('surfaces a network failure as an error so the caller can degrade instead of forgetting', { timeout: 15_000 }, async () => {
    mockGetLaunch.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useLaunchDetail(MINT), { wrapper });
    /* network failures retry with backoff (1s, 2s, 4s) before settling as an error */
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 10_000 });
    expect(result.current.data).toBeNull();
  });

  it('surfaces a 5xx as an error', { timeout: 15_000 }, async () => {
    mockGetLaunch.mockRejectedValue(new LaunchApiError('upstream', 503));
    const { result } = renderHook(() => useLaunchDetail(MINT), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 10_000 });
  });
});
