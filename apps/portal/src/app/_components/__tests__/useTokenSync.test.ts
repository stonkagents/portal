/**
 * Purpose: Tests for useTokenSync hook — wraps useTokenMetrics with guards
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

import type { TokenMetricsResponse } from '@/lib/types/backend';

const mockConfig = vi.hoisted(() => ({
  apiBaseUrl: 'http://localhost:7842',
  daemonUrl: 'http://localhost:7841/api/v1',
  useRealDaemon: true,
}));
vi.mock('@/lib/config/app.config', () => ({
  appConfig: mockConfig,
}));

import { useTokenSync } from '../useTokenSync';

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

const MOCK_TOKEN = {
  name: 'AgentCoin',
  ticker: 'AGENT',
  imageDataUrl: null,
  contractAddr: '7xKdAbcDef123',
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useTokenSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches metrics when peerId, connected, and launchedToken are all provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_METRICS }), { status: 200 }),
    );

    const { result } = renderHook(
      () => useTokenSync('12D3KooWtest', true, MOCK_TOKEN),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.tokenMetrics.isSuccess).toBe(true));

    expect(result.current.tokenMetrics.data).toEqual(MOCK_METRICS);
  });

  it('does not fetch metrics when peerId is empty', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(
      () => useTokenSync('', true, MOCK_TOKEN),
      { wrapper: createWrapper() },
    );

    expect(result.current.tokenMetrics.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not fetch metrics when launchedToken is null', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(
      () => useTokenSync('12D3KooWtest', true, null),
      { wrapper: createWrapper() },
    );

    expect(result.current.tokenMetrics.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('re-POSTs token via daemon when backend GET returns 404 (self-healing)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // First call: useTokenMetrics GET → tracker returns metrics (success)
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_METRICS }), { status: 200 }),
    );
    // Second call: self-healing GET /api/peers/{id}/token → 404 NOT_FOUND
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No token found' } }),
        { status: 404 },
      ),
    );
    // Third call: self-healing re-POST via daemon proxy → 201 success
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 201 }),
    );

    renderHook(
      () => useTokenSync('12D3KooWtest', true, MOCK_TOKEN),
      { wrapper: createWrapper() },
    );

    // Wait for self-healing POST to fire
    await waitFor(() => {
      const { calls } = fetchSpy.mock;
      // Should have: metrics GET, self-healing GET, re-POST
      const postCall = calls.find(
        (c) => typeof c[1] === 'object' && (c[1] as RequestInit).method === 'POST',
      );
      expect(postCall).toBeDefined();
      /* Through the daemon portal proxy (daemonFetch owns the exact prefix). */
      expect(String(postCall![0])).toMatch(/^http:\/\/localhost:7841\/.*\/portal\/token$/);
    });
  });

  it('does NOT re-POST on 5xx errors (prevents write storms)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    // First call: useTokenMetrics GET → tracker returns metrics
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_METRICS }), { status: 200 }),
    );
    // Second call: self-healing GET → 500 INTERNAL_ERROR
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
        { status: 500 },
      ),
    );

    renderHook(
      () => useTokenSync('12D3KooWtest', true, MOCK_TOKEN),
      { wrapper: createWrapper() },
    );

    // Give time for any potential re-POST to fire
    await new Promise((r) => setTimeout(r, 100));

    // Should NOT have any POST call — only the metrics GET and self-healing GET
    const postCalls = fetchSpy.mock.calls.filter(
      (c) => typeof c[1] === 'object' && (c[1] as RequestInit).method === 'POST',
    );
    expect(postCalls).toHaveLength(0);
  });
});
