/**
 * Purpose: useTokenByContract shares the canonical token list query with useTokens (single fetch).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import { useTokenByContract } from '../use-token-by-contract';

const mockedFetchTokenList = vi.mocked(fetchTokenList);

const CONTRACT = 'So11111111111111111111111111111111111111112';

const mockListing: PeerTokenListing[] = [
  {
    peer_id: 'peer-1',
    token_contract_address: CONTRACT,
    token_ticker: 'AGENT',
    token_name: 'AgentCoin',
    token_image_url: '',
    launched_at: '2026-02-10T12:00:00Z',
    metrics: null,
  },
];

function createSharedWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return Wrapper;
}

describe('useTokenByContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves token from cached list without a second network call', async () => {
    mockedFetchTokenList.mockResolvedValue(mockListing);
    const wrapper = createSharedWrapper();

    const listHook = renderHook(() => useTokens(), { wrapper });
    await waitFor(() => expect(listHook.result.current.isSuccess).toBe(true));

    const detailHook = renderHook(() => useTokenByContract(CONTRACT), { wrapper });
    await waitFor(() => expect(detailHook.result.current.isSuccess).toBe(true));

    expect(mockedFetchTokenList).toHaveBeenCalledTimes(1);
    expect(detailHook.result.current.data?.token_ticker).toBe('AGENT');
  });

  it('returns null when contract is absent from list', async () => {
    mockedFetchTokenList.mockResolvedValue(mockListing);
    const wrapper = createSharedWrapper();

    const { result } = renderHook(() => useTokenByContract('So99999999999999999999999999999999999999999'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(mockedFetchTokenList).toHaveBeenCalledTimes(1);
  });
});
