/**
 * The tape picks its source: the tracker's indexed feed for a recorded launch,
 * the RPC for a pool the tracker never recorded, and only one of them runs.
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenTxItem } from '@/lib/api/hooks/use-token-transactions';

const useLaunchTrades = vi.fn();
vi.mock('@/lib/api/launch-trades', () => ({ useLaunchTrades: (...args: unknown[]) => useLaunchTrades(...args) }));
const useTokenTransactions = vi.fn();
vi.mock('@/lib/api/hooks/use-token-transactions', () => ({ useTokenTransactions: (...args: unknown[]) => useTokenTransactions(...args) }));

import { useTokenTape } from './use-token-tape';

const NOW = Math.floor(Date.now() / 1000);
const idle = { data: undefined, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() };
const trades: TokenTxItem[] = [
  { signature: 'S2', blockTime: NOW - 60, type: 'buy', price: 2, amountQuote: 20, amountToken: 10 },
  { signature: 'S1', blockTime: NOW - 600, type: 'sell', price: 1, amountQuote: 5, amountToken: 5 },
];

describe('useTokenTape', () => {
  beforeEach(() => {
    useLaunchTrades.mockReset().mockReturnValue(idle);
    useTokenTransactions.mockReset().mockReturnValue(idle);
  });

  it("reads the tracker's feed by default and derives the stats from it", () => {
    useLaunchTrades.mockReturnValue({ ...idle, data: { trades, nextCursor: null } });
    const { result } = renderHook(() => useTokenTape('Mint', 'Quote', 'Pool'));
    expect(useLaunchTrades).toHaveBeenCalledWith('Mint', { enabled: true });
    expect(useTokenTransactions).toHaveBeenCalledWith('Mint', expect.objectContaining({ enabled: false }));
    expect(result.current.source).toBe('tracker');
    expect(result.current.trades).toBe(trades);
    expect(result.current.lastPrice).toBe(2);
    expect(result.current.stats.volume24hQuote).toBe(25);
    expect(result.current.stats.trades24h).toBe(2);
  });

  it('reads the RPC on the pool for an external or legacy token, and leaves the tracker feed off', () => {
    useTokenTransactions.mockReturnValue({ ...idle, data: trades });
    const { result } = renderHook(() => useTokenTape('Mint', 'Quote', 'Pool', { source: 'rpc' }));
    expect(useLaunchTrades).toHaveBeenCalledWith('Mint', { enabled: false });
    expect(useTokenTransactions).toHaveBeenCalledWith(
      'Mint',
      expect.objectContaining({ enabled: true, quoteMint: 'Quote', address: 'Pool', enablePolling: true }),
    );
    expect(result.current.source).toBe('rpc');
    expect(result.current.trades).toBe(trades);
  });

  it('runs neither when disabled, and reports reconnecting with a stale tape', () => {
    useLaunchTrades.mockReturnValue({ ...idle, data: { trades, nextCursor: null }, isError: true, error: new Error('down') });
    const { result } = renderHook(() => useTokenTape('Mint', 'Quote', 'Pool', { enabled: false }));
    expect(useLaunchTrades).toHaveBeenCalledWith('Mint', { enabled: false });
    expect(useTokenTransactions).toHaveBeenCalledWith('Mint', expect.objectContaining({ enabled: false }));
    expect(result.current.reconnecting).toBe(true);
    expect(result.current.error?.message).toBe('down');
  });
});
