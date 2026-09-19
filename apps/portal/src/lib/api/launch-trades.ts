/**
 * The tracker's indexed trade feed for a launch.
 *
 *   GET /api/launch/{mint}/trades?limit=&cursor=      newest first, { data, next_cursor }
 *   GET /api/launch/{mint}/candles?interval=&limit=    OHLC in quote units, { data: [{ t, o, h, l, c, v }] }
 *
 * Both are public and cached for a few seconds per URL on the tracker. The
 * tracker indexes every trade of a recorded launch, so the tape, the candles
 * and the 24h figures on the card and the detail page come from one source.
 * A mint the tracker never recorded (the external $AGENT pool) has no feed;
 * the page reads the RPC for that one instead.
 *
 * The tracker buckets at 1m|5m|15m|1h|1d; the chart's 4h candles are rolled
 * up from 1h here.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { trackerEndpoint } from '@/config';
import { LaunchApiError, type LaunchMetricsView } from '@/lib/api/launches';
import type { TokenTxItem } from '@/lib/api/hooks/use-token-transactions';
import type { Candle } from '@/app/tokens/_lib/candles';

/* ────────────────────────────────────────────────────────────
   Wire shapes
   ──────────────────────────────────────────────────────────── */

/** One row of `GET /api/launch/{mint}/trades`, as the tracker returns it. */
export interface LaunchTradeView {
  signature: string;
  /** ISO 8601. */
  blockTime: string;
  side: string;
  trader: string;
  /** Whole base tokens. */
  baseAmount: number;
  /** Whole quote tokens. */
  quoteAmount: number;
  /** Whole quote tokens per whole base token. */
  priceQuote: number;
}

/** One bucket of `GET /api/launch/{mint}/candles`: start (unix seconds), OHLC in quote, quote volume. */
export interface LaunchCandleView {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * The trade-derived block of `LaunchMetricsView`, which the tracker sends on
 * every launch. Null until the indexer has seen a trade of the launch;
 * `priceChange24hPct` is null until a trade is 24h old.
 */
export interface LaunchMetrics24h {
  /** Live curve price in quote units; what the trade feed prices in. */
  priceQuote: number | null;
  priceChange24hPct: number | null;
  volume24hQuote: number | null;
  volume24hUsd: number | null;
  trades24h: number | null;
}

/** Intervals the tracker buckets at. */
export const TRACKER_CANDLE_INTERVALS = ['1m', '5m', '15m', '1h', '1d'] as const;
export type TrackerCandleInterval = (typeof TRACKER_CANDLE_INTERVALS)[number];

/** Page size the tape asks for; the tracker caps a page at 200. */
export const DEFAULT_TRADES_LIMIT = 150;
/** Candles the chart asks for; the tracker caps at 500. */
export const DEFAULT_CANDLES_LIMIT = 300;

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Read the 24h block off a launch's metrics. Pure; tolerant of an older tracker that omits it. */
export function readMetrics24h(metrics: LaunchMetricsView | null | undefined): LaunchMetrics24h {
  const m = (metrics ?? {}) as Partial<Record<keyof LaunchMetrics24h, unknown>>;
  return {
    priceQuote: num(m.priceQuote),
    priceChange24hPct: num(m.priceChange24hPct),
    volume24hQuote: num(m.volume24hQuote),
    volume24hUsd: num(m.volume24hUsd),
    trades24h: num(m.trades24h),
  };
}

/* ────────────────────────────────────────────────────────────
   Mapping
   ──────────────────────────────────────────────────────────── */

/** A tracker trade row as the tape's item. Pure. */
export function tradeFromView(view: LaunchTradeView): TokenTxItem {
  const ms = Date.parse(view.blockTime);
  const side = view.side === 'buy' || view.side === 'sell' ? view.side : 'unknown';
  return {
    signature: view.signature,
    blockTime: Number.isFinite(ms) ? Math.floor(ms / 1000) : null,
    type: side,
    amountToken: num(view.baseAmount) ?? undefined,
    amountQuote: num(view.quoteAmount) ?? undefined,
    price: num(view.priceQuote) ?? undefined,
    wallet: view.trader || undefined,
  };
}

/** A tracker bucket as a chart candle. The tracker sends no trade count; a bucket exists only when something traded. */
export function candleFromView(view: LaunchCandleView): Candle {
  return { time: view.t, open: view.o, high: view.h, low: view.l, close: view.c, volume: view.v, trades: 1, gap: false };
}

/**
 * Roll candles up into wider buckets, e.g. 1h → 4h. Buckets align to the
 * epoch like the tracker's own. Pure.
 */
export function rollUpCandles(candles: readonly Candle[], intervalSeconds: number): Candle[] {
  if (intervalSeconds <= 0) return [];
  const out = new Map<number, Candle>();
  for (const c of [...candles].sort((a, b) => a.time - b.time)) {
    const time = Math.floor(c.time / intervalSeconds) * intervalSeconds;
    const existing = out.get(time);
    if (existing) {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume;
      existing.trades += c.trades;
    } else {
      out.set(time, { ...c, time });
    }
  }
  return [...out.values()];
}

/**
 * Fill the gaps between candles so the chart draws a flat bar at the last
 * close where nothing traded (the same shape `buildCandles` produces from a
 * tape), and extend the series to `now`. Pure.
 */
export function fillCandleGaps(candles: readonly Candle[], intervalSeconds: number, now?: number): Candle[] {
  if (intervalSeconds <= 0 || candles.length === 0) return [];
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const bucketOf = (t: number) => Math.floor(t / intervalSeconds) * intervalSeconds;
  const first = sorted[0]!.time;
  const last = sorted[sorted.length - 1]!.time;
  const end = Math.max(last, now != null ? bucketOf(now) : last);
  const byTime = new Map(sorted.map(c => [c.time, c] as const));
  const out: Candle[] = [];
  let lastClose = 0;
  for (let time = first; time <= end; time += intervalSeconds) {
    const candle = byTime.get(time);
    if (candle) {
      const open = lastClose > 0 ? lastClose : candle.open;
      out.push({ ...candle, open, high: Math.max(candle.high, open), low: Math.min(candle.low, open) });
      lastClose = candle.close;
    } else if (lastClose > 0) {
      out.push({ time, open: lastClose, high: lastClose, low: lastClose, close: lastClose, volume: 0, trades: 0, gap: true });
    }
  }
  return out;
}

/** Scale every price on a candle series, e.g. by supply for a market cap chart or by a USD rate. Pure. */
export function scaleCandles(candles: readonly Candle[], scale: number): Candle[] {
  if (scale === 1) return [...candles];
  return candles.map(c => ({ ...c, open: c.open * scale, high: c.high * scale, low: c.low * scale, close: c.close * scale }));
}

/**
 * The change over a window off a candle series: the close of the last bucket
 * that ended at or before `nowTs - windowSec`, against `price`. Null when the
 * series does not reach back that far. Pure.
 */
export function deltaFromCandles(candles: readonly Candle[], price: number | null, windowSec: number, nowTs: number): number | null {
  if (price == null || !(price > 0)) return null;
  const cutoff = nowTs - windowSec;
  let ref: Candle | null = null;
  for (const c of [...candles].sort((a, b) => a.time - b.time)) {
    if (c.time <= cutoff) ref = c;
    else break;
  }
  if (!ref || !(ref.close > 0)) return null;
  return ((price - ref.close) / ref.close) * 100;
}

/* ────────────────────────────────────────────────────────────
   Transport
   ──────────────────────────────────────────────────────────── */

async function getJson<T>(path: string, what: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(trackerEndpoint(path), { headers: { Accept: 'application/json' }, signal });
  const body = (await response.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null;
  if (!response.ok) {
    throw new LaunchApiError(body?.error?.message ?? `Could not ${what} (${response.status}).`, response.status, body?.error?.code);
  }
  if (!body) throw new LaunchApiError(`The tracker returned nothing for ${what}.`, response.status);
  return body;
}

export interface LaunchTradesPage {
  /** Newest first, in the tape's shape. */
  trades: TokenTxItem[];
  /** Opaque cursor for the next (older) page, or null at the end. */
  nextCursor: string | null;
}

export interface LaunchTradesQuery {
  limit?: number;
  cursor?: string | null;
}

/** A page of a launch's trades, newest first. */
export async function fetchLaunchTrades(mint: string, query: LaunchTradesQuery = {}, signal?: AbortSignal): Promise<LaunchTradesPage> {
  const params = new URLSearchParams();
  params.set('limit', String(query.limit ?? DEFAULT_TRADES_LIMIT));
  if (query.cursor) params.set('cursor', query.cursor);
  const body = await getJson<{ data?: LaunchTradeView[]; next_cursor?: string }>(
    `/api/launch/${encodeURIComponent(mint)}/trades?${params.toString()}`,
    'load the trades',
    signal,
  );
  const rows = Array.isArray(body.data) ? body.data : [];
  return { trades: rows.map(tradeFromView), nextCursor: body.next_cursor ? body.next_cursor : null };
}

/** A launch's candles at one of the tracker's intervals, oldest first, gaps unfilled. */
export async function fetchLaunchCandles(
  mint: string,
  interval: TrackerCandleInterval,
  limit: number = DEFAULT_CANDLES_LIMIT,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const params = new URLSearchParams({ interval, limit: String(limit) });
  const body = await getJson<{ data?: LaunchCandleView[] }>(
    `/api/launch/${encodeURIComponent(mint)}/candles?${params.toString()}`,
    'load the candles',
    signal,
  );
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows.map(candleFromView).sort((a, b) => a.time - b.time);
}

/* ────────────────────────────────────────────────────────────
   Hooks
   ──────────────────────────────────────────────────────────── */

export const launchTradeKeys = {
  trades: (mint: string, limit: number) => ['launches', 'trades', mint, limit] as const,
  candles: (mint: string, interval: string, limit: number) => ['launches', 'candles', mint, interval, limit] as const,
};

/** The tracker caches for five seconds; polling faster only re-reads the cache. */
const TRADES_POLL_MS = 10_000;
const CANDLES_POLL_MS = 15_000;
const ERROR_REFETCH_MS = 15_000;

const retryDelay = (attempt: number): number => Math.min(1_000 * 2 ** attempt, 8_000);
const noRetryOn4xx = (count: number, err: unknown): boolean => !(err instanceof LaunchApiError && err.status < 500) && count < 3;

/** The newest trades of a launch, polled while the page is open. */
export function useLaunchTrades(mint: string | null, options: { enabled?: boolean; limit?: number; poll?: boolean } = {}) {
  const enabled = Boolean(mint) && (options.enabled ?? true);
  const limit = options.limit ?? DEFAULT_TRADES_LIMIT;
  const poll = options.poll ?? true;
  return useQuery({
    queryKey: launchTradeKeys.trades(mint ?? '', limit),
    queryFn: ({ signal }) => fetchLaunchTrades(mint as string, { limit }, signal),
    enabled,
    staleTime: TRADES_POLL_MS,
    retry: noRetryOn4xx,
    retryDelay,
    refetchInterval: query => (query.state.status === 'error' ? ERROR_REFETCH_MS : poll ? TRADES_POLL_MS : false),
    refetchOnWindowFocus: false,
  });
}

/**
 * A launch's candles at a tracker interval. The chart's own intervals map
 * onto these with `trackerIntervalFor`; a 4h chart reads 1h and rolls up.
 */
export function useLaunchCandles(
  mint: string | null,
  interval: TrackerCandleInterval,
  options: { enabled?: boolean; limit?: number } = {},
) {
  const enabled = Boolean(mint) && (options.enabled ?? true);
  const limit = options.limit ?? DEFAULT_CANDLES_LIMIT;
  return useQuery({
    queryKey: launchTradeKeys.candles(mint ?? '', interval, limit),
    queryFn: ({ signal }) => fetchLaunchCandles(mint as string, interval, limit, signal),
    enabled,
    staleTime: CANDLES_POLL_MS,
    retry: noRetryOn4xx,
    retryDelay,
    refetchInterval: query => (query.state.status === 'error' ? ERROR_REFETCH_MS : CANDLES_POLL_MS),
    refetchOnWindowFocus: false,
  });
}

/**
 * Which tracker interval serves a chart interval, and by what factor the
 * answer is rolled up: '4h' → 1h × 4. Null for an interval the tracker cannot serve.
 */
export function trackerIntervalFor(chartSeconds: number): { interval: TrackerCandleInterval; factor: number } | null {
  const seconds: Record<TrackerCandleInterval, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3_600, '1d': 86_400 };
  for (const interval of [...TRACKER_CANDLE_INTERVALS].reverse()) {
    const s = seconds[interval];
    if (chartSeconds >= s && chartSeconds % s === 0) return { interval, factor: chartSeconds / s };
  }
  return null;
}
