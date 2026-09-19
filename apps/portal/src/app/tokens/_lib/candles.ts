/**
 * Candles from the live tape.
 *
 * The chart does not come from a venue: every trade the RPC shows us has a
 * price (quote paid ÷ tokens moved), and those prices bucketed by time are the
 * candles. A bucket with no trade is drawn flat at the last close and marked
 * so the chart can say "no trades · held at the last close". Pure, so it is
 * tested on its own.
 */

export interface TapeTrade {
  /** Unix seconds. */
  blockTime: number | null;
  type: 'buy' | 'sell' | 'unknown';
  /** Whole quote tokens per whole base token. */
  price?: number;
  amountQuote?: number;
  amountToken?: number;
}

export interface Candle {
  /** Bucket start, unix seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Quote volume traded inside the bucket. */
  volume: number;
  trades: number;
  /** True for a bucket with no trade, drawn flat at the previous close. */
  gap: boolean;
}

export interface CandleTimeframe {
  id: string;
  label: string;
  seconds: number;
}

export const CANDLE_TIMEFRAMES: readonly CandleTimeframe[] = [
  { id: '1m', label: '1m', seconds: 60 },
  { id: '5m', label: '5m', seconds: 5 * 60 },
  { id: '15m', label: '15m', seconds: 15 * 60 },
  { id: '1h', label: '1h', seconds: 60 * 60 },
  { id: '4h', label: '4h', seconds: 4 * 60 * 60 },
  { id: '1d', label: '1D', seconds: 24 * 60 * 60 },
];

export const DEFAULT_CANDLE_TIMEFRAME = '15m';

/** Trades with a usable price, oldest first. */
export function pricedTrades(trades: readonly TapeTrade[]): TapeTrade[] {
  return trades
    .filter(t => t.blockTime != null && t.price != null && Number.isFinite(t.price) && t.price > 0 && (t.type === 'buy' || t.type === 'sell'))
    .sort((a, b) => (a.blockTime as number) - (b.blockTime as number));
}

export interface BuildCandlesOptions {
  /** Bucket width in seconds. */
  intervalSeconds: number;
  /** The current time, unix seconds; the last bucket is extended to it. */
  now?: number;
  /** Cap on buckets, counted back from `now`. Older trades still seed the first open. */
  maxBuckets?: number;
  /** Multiply every price, e.g. by supply for a market cap chart or by a USD rate. */
  scale?: number;
}

/**
 * Bucket priced trades into OHLC candles.
 *
 * The first candle opens at the first trade. Between the first and the last
 * bucket every interval is present: a bucket with no trade carries the
 * previous close as a flat candle with `gap: true`. Volume is quote volume.
 */
export function buildCandles(trades: readonly TapeTrade[], options: BuildCandlesOptions): Candle[] {
  const { intervalSeconds, scale = 1 } = options;
  if (intervalSeconds <= 0) return [];
  const priced = pricedTrades(trades);
  if (priced.length === 0) return [];

  const bucketOf = (t: number) => Math.floor(t / intervalSeconds) * intervalSeconds;
  const byBucket = new Map<number, Candle>();
  for (const trade of priced) {
    const time = bucketOf(trade.blockTime as number);
    const price = (trade.price as number) * scale;
    const volume = trade.amountQuote ?? 0;
    const existing = byBucket.get(time);
    if (existing) {
      existing.high = Math.max(existing.high, price);
      existing.low = Math.min(existing.low, price);
      existing.close = price;
      existing.volume += volume;
      existing.trades += 1;
    } else {
      byBucket.set(time, { time, open: price, high: price, low: price, close: price, volume, trades: 1, gap: false });
    }
  }

  const firstBucket = Math.min(...byBucket.keys());
  const lastTrade = Math.max(...byBucket.keys());
  const now = options.now ?? lastTrade;
  const lastBucket = Math.max(lastTrade, bucketOf(now));

  const start = options.maxBuckets ? Math.max(firstBucket, lastBucket - (options.maxBuckets - 1) * intervalSeconds) : firstBucket;

  // The open of the window is the close of everything before it.
  let lastClose = 0;
  for (const [time, candle] of [...byBucket.entries()].sort((a, b) => a[0] - b[0])) {
    if (time < start) lastClose = candle.close;
  }

  const out: Candle[] = [];
  for (let time = start; time <= lastBucket; time += intervalSeconds) {
    const candle = byBucket.get(time);
    if (candle) {
      // The open of a bucket is the previous close, so candles connect.
      if (lastClose > 0) {
        candle.open = lastClose;
        candle.high = Math.max(candle.high, lastClose);
        candle.low = Math.min(candle.low, lastClose);
      }
      out.push(candle);
      lastClose = candle.close;
    } else if (lastClose > 0) {
      out.push({ time, open: lastClose, high: lastClose, low: lastClose, close: lastClose, volume: 0, trades: 0, gap: true });
    }
  }
  return out;
}

/** The last traded price on the tape, or null when nothing has traded. */
export function lastTradePrice(trades: readonly TapeTrade[]): number | null {
  const priced = pricedTrades(trades);
  return priced.length > 0 ? (priced[priced.length - 1]!.price as number) : null;
}
