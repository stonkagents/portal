/**
 * Purpose: Tests for usePeerToken — GET /api/peers/{id}/token, maps to LaunchedToken or null on 404
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const mockConfig = vi.hoisted(() => ({
  apiBaseUrl: 'http://localhost:7842',
}));
vi.mock('@/lib/config/app.config', () => ({
  appConfig: mockConfig,
}));

import { usePeerToken } from '../use-peer-token';

const MOCK_PEER_TOKEN = {
  peer_id: '12D3KooWabc',
  token_contract_address: '7xKdAbcDef123',
  token_ticker: 'AGENT',
  token_name: 'AgentToken',
  token_image_url: 'https://pump.fun/img/agent.png',
  launched_at: '2026-02-15T12:00:00Z',
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('usePeerToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fetch when peerId is null', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(() => usePeerToken(null), { wrapper: createWrapper() });

    expect(result.current.isFetched).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not fetch when peerId is empty string', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    renderHook(() => usePeerToken(''), { wrapper: createWrapper() });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches token and maps to LaunchedToken when peerId is set', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: MOCK_PEER_TOKEN }), { status: 200 }),
    );

    const { result } = renderHook(() => usePeerToken('12D3KooWabc'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isFetched).toBe(true));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:7842/api/peers/12D3KooWabc/token',
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }),
    );
    expect(result.current.data).toEqual({
      name: 'AgentToken',
      ticker: 'AGENT',
      imageDataUrl: null,
      contractAddr: '7xKdAbcDef123',
      imageUrl: 'https://pump.fun/img/agent.png',
    });
  });

  it('returns null when API returns 404 NOT_FOUND', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No token found for this peer' } }),
        { status: 404 },
      ),
    );

    const { result } = renderHook(() => usePeerToken('12D3KooWabc'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isFetched).toBe(true));

    expect(result.current.data).toBeNull();
  });
});
