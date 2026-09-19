'use client';

/**
 * The candles behind the chart card, from either source.
 *
 * A launch the tracker recorded reads the tracker's OHLC buckets at the
 * chart's interval (1h rolled up for 4h) and a 5m series for the delta strip,
 * so the chart, the deltas and the card's 24h figures come from one indexer.
 * Anything else (the external $AGENT pool, a legacy token) builds candles
 * from the tape the RPC gave us, as before.
 */

import { useMemo } from 'react';
import type { TokenTxItem } from '@/lib/api/hooks/use-token-transactions';
import {
  deltaFromCandles,
  fillCandleGaps,
  rollUpCandles,
  scaleCandles,
  trackerIntervalFor,
  useLaunchCandles,
} from '@/lib/api/launch-trades';
import { buildCandles, lastTradePrice, type Candle } from './candles';
import { deltaPct } from '../_components/chart-card';

/** Candles kept on screen; older trades still seed the first open. */
export const MAX_BUCKETS = 300;

/** The tracker caps a candle read at this many buckets. */
const TRACKER_CANDLE_CAP = 500;

/** Window the delta strip reads from, in 5m buckets: a little over 24h. */
const DELTA_SERIES_LIMIT = 300;

export type CandleSource = 'tracker' | 'tape';

export interface ChartCandles {
  /** Candles for the chosen interval, gaps filled, scaled, oldest first. */
  candles: Candle[];
  /** The last traded price in the quote, unscaled. */
  lastPrice: number | null;
  /** Unix seconds the series was built at. */
  nowTs: number;
  isLoading: boolean;
  /** The last refresh failed but an earlier series is still on screen. */
  reconnecting: boolean;
  /** The change over a window in percent, or null when the series does not reach back that far. */
  delta: (windowSec: number) => number | null;
}

export interface UseChartCandlesInput {
  mint: string;
  source: CandleSource;
  /** Bucket width, in seconds. */
  intervalSeconds: number;
  /** Multiply every price, e.g. by supply for a market cap chart or by a USD rate. */
  scale: number;
  trades: readonly TokenTxItem[];
  tapeLoading: boolean;
  tapeReconnecting?: boolean;
  /** The tracker's own 24h change, preferred over one read off the series. */
  change24hPct?: number | null;
}

export function useChartCandles(input: UseChartCandlesInput): ChartCandles {
  const { mint, source, intervalSeconds, scale, trades, tapeLoading, tapeReconnecting = false, change24hPct = null } = input;
  const tracker = source === 'tracker';
  const mapping = trackerIntervalFor(intervalSeconds);
  const chartLimit = Math.min(TRACKER_CANDLE_CAP, MAX_BUCKETS * (mapping?.factor ?? 1));

  const series = useLaunchCandles(mint, mapping?.interval ?? '5m', { enabled: tracker && mapping != null, limit: chartLimit });
  const deltaSeries = useLaunchCandles(mint, '5m', { enabled: tracker, limit: DELTA_SERIES_LIMIT });

  return useMemo(() => {
    const nowTs = Math.floor(Date.now() / 1000);
    const tapePrice = lastTradePrice(trades);

    if (!tracker) {
      const candles = buildCandles(trades, { intervalSeconds, now: nowTs, maxBuckets: MAX_BUCKETS, scale });
      return {
        candles,
        lastPrice: tapePrice,
        nowTs,
        isLoading: tapeLoading,
        reconnecting: tapeReconnecting,
        delta: windowSec => deltaPct(trades, tapePrice, windowSec, nowTs),
      };
    }

    const raw = series.data ?? [];
    const rolled = mapping && mapping.factor > 1 ? rollUpCandles(raw, intervalSeconds) : raw;
    const filled = fillCandleGaps(rolled, intervalSeconds, nowTs).slice(-MAX_BUCKETS);
    const lastClose = raw.length > 0 ? raw[raw.length - 1]!.close : null;
    const lastPrice = tapePrice ?? lastClose;
    const strip = deltaSeries.data ?? [];
    return {
      candles: scaleCandles(filled, scale),
      lastPrice,
      nowTs,
      isLoading: series.isLoading,
      reconnecting: series.isError && series.data !== undefined,
      delta: windowSec =>
        windowSec === 86_400 && change24hPct != null ? change24hPct : deltaFromCandles(strip, lastPrice, windowSec, nowTs),
    };
  }, [tracker, trades, intervalSeconds, scale, tapeLoading, tapeReconnecting, series.data, series.isLoading, series.isError, deltaSeries.data, mapping, change24hPct]);
}
