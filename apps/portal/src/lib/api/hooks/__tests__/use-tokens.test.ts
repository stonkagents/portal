/**
 * Purpose: Tests for useTokens hook — gallery listing from /api/tokens
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

import type { PeerTokenListing } from '@/lib/types/backend';

vi.mock('@/lib/api/tokens-list', () => ({
  TOKEN_LIST_LIMIT: 100,
  fetchTokenList: vi.fn(),
}));

import { fetchTokenList } from '@/lib/api/tokens-list';
import { useTokens } from '../use-tokens';

const mockedFetchTokenList = vi.mocked(fetchTokenList);

const mockListing: PeerTokenListing[] = [
  {
    peer_id: 'peer-1',
    token_contract_address: 'So11111111111111111111111111111111111111112',
    token_ticker: 'AGENT',
    token_name: 'AgentCoin',
    token_image_url: 'https://example.com/agent.png',
    launched_at: '2026-02-10T12:00:00Z',
    metrics: {
      marketCapUsd: 50000,
      solRaised: 120,
      bondingCurvePercent: 85,
      complete: false,
      createdAt: '2026-02-10T12:00:00Z',
      imageUrl: 'https://example.com/agent.png',
      holders: 42,
      priceUsd: 0.01,
    },
  },
  {
    peer_id: 'peer-2',
    token_contract_address: 'So22222222222222222222222222222222222222223',
    token_ticker: 'CLAW',
    token_name: 'ClawToken',
    token_image_url: '',
    launched_at: '2026-02-11T08:00:00Z',
    metrics: null,
  },
];

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches token listings from /api/tokens and returns PeerTokenListing[]', async () => {
    mockedFetchTokenList.mockResolvedValueOnce(mockListing);

    const { result } = renderHook(() => useTokens(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedFetchTokenList).toHaveBeenCalledWith(100);
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].token_ticker).toBe('AGENT');
    expect(result.current.data![1].metrics).toBeNull();
  });

  it('is enabled by default (no daemon dependency)', async () => {
    mockedFetchTokenList.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useTokens(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedFetchTokenList).toHaveBeenCalledTimes(1);
  });
});
