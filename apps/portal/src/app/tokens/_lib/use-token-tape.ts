'use client';

/**
 * The live tape for one token: recent trades, plus everything the page
 * derives from them — the last traded price, 24h volume, today's count. One
 * query feeds the header, the chart, the stats grid and the trades table.
 *
 * Two sources. A launch the tracker recorded reads the tracker's indexed feed
 * (`GET /api/launch/{mint}/trades`), which goes back as far as the pool has
 * traded and is the same feed the card's 24h figures come from. A pool the
 * tracker never recorded (the external $AGENT pool) or a legacy token reads
 * the RPC: the last signatures on the pool, parsed one by one.
 */

import { useMemo } from 'react';
import { useTokenTransactions, type TokenTxItem } from '@/lib/api/hooks/use-token-transactions';
import { useLaunchTrades } from '@/lib/api/launch-trades';
import { lastTradePrice } from './candles';
import { tapeStats, type TapeStats } from './tape-stats';

/** Signatures listed per RPC refresh; enough for a day of a quiet pool. */
const TAPE_LIMIT = 60;
/** How many of them are parsed for sides and amounts. */
const TAPE_ENRICH_LIMIT = 30;

/** Where the tape comes from: the tracker's indexer, or the RPC. */
export type TapeSource = 'tracker' | 'rpc';

export interface TokenTape {
  trades: TokenTxItem[];
  /** Whole quote tokens per token, from the last trade with a price. */
  lastPrice: number | null;
  stats: TapeStats;
  source: TapeSource;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  /** The last refresh failed but an earlier tape is still on screen. */
  reconnecting: boolean;
  refetch: () => void;
}

export function useTokenTape(
  mint: string | null,
  quoteMint: string | null,
  poolId: string | null,
  options: { enabled?: boolean; source?: TapeSource } = {},
): TokenTape {
  const enabled = options.enabled ?? true;
  const source: TapeSource = options.source ?? 'tracker';

  const tracker = useLaunchTrades(mint, { enabled: enabled && source === 'tracker' });
  const rpc = useTokenTransactions(mint, {
    enablePolling: true,
    enabled: enabled && source === 'rpc',
    quoteMint,
    address: poolId,
    limit: TAPE_LIMIT,
    enrichLimit: TAPE_ENRICH_LIMIT,
  });

  const query = source === 'tracker' ? tracker : rpc;
  const trades = useMemo(() => (source === 'tracker' ? (tracker.data?.trades ?? []) : (rpc.data ?? [])), [source, tracker.data, rpc.data]);
  const stats = useMemo(() => tapeStats(trades), [trades]);
  const lastPrice = useMemo(() => lastTradePrice(trades), [trades]);

  return {
    trades,
    lastPrice,
    stats,
    source,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error : null,
    reconnecting: query.isError && query.data !== undefined,
    refetch: () => void query.refetch(),
  };
}
