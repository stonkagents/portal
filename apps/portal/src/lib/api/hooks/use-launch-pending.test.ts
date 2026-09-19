/**
 * Purpose: Tests for useLaunchesByWallet and usePendingLaunches — recovery of
 *          a launch so a creator who launched elsewhere still lands in Step 2,
 *          whether or not an agent has claimed it.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

const mockGetPendingLaunches = vi.fn();
const mockFetchLaunchesByWallet = vi.fn();
vi.mock('@/lib/api/launches', () => ({
  getPendingLaunches: (...args: unknown[]) => mockGetPendingLaunches(...args),
  fetchLaunchesByWallet: (...args: unknown[]) => mockFetchLaunchesByWallet(...args),
  launchKeys: {
    pending: (wallet: string) => ['launches', 'pending', wallet],
    byWallet: (wallet: string) => ['launches', 'by-wallet', wallet],
  },
}));

import { useLaunchesByWallet, usePendingLaunches } from './use-launch-pending';

const WALLET = 'Wa11et11111111111111111111111111111111111111';

const RECORD = {
  mint: 'MinT1111111111111111111111111111111111111111',
  creator_wallet: WALLET,
  quote_mint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  name: 'Agent One',
  symbol: 'AGENT',
  launch_signature: 'sig',
  fee_lamports: 1,
  transfer_fee_bps: 100,
  status: 'confirmed',
  created_at: '2026-09-01T00:00:00Z',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePendingLaunches', () => {
  it('does not query without a wallet', () => {
    const { result } = renderHook(() => usePendingLaunches(null), { wrapper });

    expect(mockGetPendingLaunches).not.toHaveBeenCalled();
    expect(result.current.data).toEqual([]);
    expect(result.current.first).toBeNull();
  });

  it('returns the newest unbound launch for a connected wallet', async () => {
    mockGetPendingLaunches.mockResolvedValue([RECORD]);
    const { result } = renderHook(() => usePendingLaunches(WALLET), { wrapper });

    await waitFor(() => expect(result.current.first).not.toBeNull());

    expect(mockGetPendingLaunches).toHaveBeenCalledWith(WALLET, expect.anything());
    expect(result.current.first?.mint).toBe(RECORD.mint);
    expect(result.current.data).toHaveLength(1);
  });

  it('resolves to no recovery when the tracker is unreachable', async () => {
    mockGetPendingLaunches.mockRejectedValue(new Error('tracker down'));
    const { result } = renderHook(() => usePendingLaunches(WALLET), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });

    expect(result.current.first).toBeNull();
    expect(result.current.data).toEqual([]);
  });

  it('treats an empty list as nothing to recover', async () => {
    mockGetPendingLaunches.mockResolvedValue([]);
    const { result } = renderHook(() => usePendingLaunches(WALLET), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));

    expect(result.current.first).toBeNull();
  });
});

describe('useLaunchesByWallet', () => {
  it('does not query without a wallet', () => {
    const { result } = renderHook(() => useLaunchesByWallet(null), { wrapper });

    expect(mockFetchLaunchesByWallet).not.toHaveBeenCalled();
    expect(result.current.first).toBeNull();
  });

  it('returns the newest launch for a connected wallet, claimed or not', async () => {
    const claimed = { ...RECORD, peer_id: 'peer-1', agentBound: true };
    mockFetchLaunchesByWallet.mockResolvedValue([claimed]);
    const { result } = renderHook(() => useLaunchesByWallet(WALLET), { wrapper });

    await waitFor(() => expect(result.current.first).not.toBeNull());

    expect(mockFetchLaunchesByWallet).toHaveBeenCalledWith(WALLET, expect.anything());
    expect(result.current.first?.mint).toBe(RECORD.mint);
    expect(result.current.first?.agentBound).toBe(true);
  });

  it('resolves to nothing when the tracker is unreachable', async () => {
    mockFetchLaunchesByWallet.mockRejectedValue(new Error('tracker down'));
    const { result } = renderHook(() => useLaunchesByWallet(WALLET), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });

    expect(result.current.first).toBeNull();
    expect(result.current.data).toEqual([]);
  });
});
