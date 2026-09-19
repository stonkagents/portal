/**
 * Purpose: Tests for useTokenMetrics React Query hook — tracker direct read
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

import type { TokenMetricsResponse } from '@/lib/types/backend';

// Mock app config — vi.hoisted ensures mockConfig exists before vi.mock factory runs
const mockConfig = vi.hoisted(() => ({
  apiBaseUrl: 'http://localhost:7842',
  daemonUrl: 'http://localhost:7841/api/v1',
  useRealDaemon: true,
}));
vi.mock('@/lib/config/app.config', () => ({
  appConfig: mockConfig,
}));

import { useTokenMetrics } from '../use-token-metrics';

const MOCK_METRICS: TokenMetricsResponse = {
  marketCapUsd: 12400,
  solRaised: 3.2,
  bondingCurvePercent: 42,
  complete: false,
  createdAt: '2026-02-15T12:00:00Z',
  imageUrl: 'https://pump.fun/img/test.png',
  holders: null,
  priceUsd: null,
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useTokenMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches metrics from tracker when peerId and contractAddr are provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_METRICS }), { status: 200 }),
    );

    const { result } = renderHook(
      () => useTokenMetrics('12D3KooWtest', '7xKdAbcDef'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:7842/api/peers/12D3KooWtest/token/metrics',
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
    expect(result.current.data).toEqual(MOCK_METRICS);
  });

  it('does not fetch when peerId is null', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(
      () => useTokenMetrics(null, '7xKdAbcDef'),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not fetch when contractAddr is null', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(
      () => useTokenMetrics('12D3KooWtest', null),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
