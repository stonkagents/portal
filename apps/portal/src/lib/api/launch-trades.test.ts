/**
 * The tracker's trade feed: URLs and shapes of GET /api/launch/{mint}/trades
 * and /candles (as tracker/internal/api/handler_launch_trades.go serves them),
 * the mapping onto the tape and the chart, and the pure candle helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '@/app/tokens/_lib/candles';
import {
  candleFromView,
  deltaFromCandles,
  fetchLaunchCandles,
  fetchLaunchTrades,
  fillCandleGaps,
  readMetrics24h,
  rollUpCandles,
  scaleCandles,
  tradeFromView,
  trackerIntervalFor,
  type LaunchCandleView,
  type LaunchTradeView,
} from './launch-trades';
import { LaunchApiError } from './launches';

const MINT = 'EMJPUbXXDgEYsftDsh8kw2m89muA7SaVrf2WejVNXEJe';

/** One row as the tracker's `tradeView` encodes it (blockTime is a time.Time → RFC 3339). */
const tradeRow: LaunchTradeView = {
  signature: '5zW4k1Sig',
  blockTime: '2026-09-14T10:15:30Z',
  side: 'buy',
  trader: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  baseAmount: 12_500,
  quoteAmount: 3.75,
  priceQuote: 0.0003,
};

/** Buckets as `services.Candle` encodes them: t (unix seconds), o/h/l/c in quote, v quote volume. */
const candleRows: LaunchCandleView[] = [
  { t: 1_800_000_000, o: 1, h: 1.2, l: 0.9, c: 1.1, v: 10 },
  { t: 1_800_000_300, o: 1.1, h: 1.3, l: 1.0, c: 1.25, v: 4 },
];

const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('mapping', () => {
  it('turns a tracker trade row into a tape item, in unix seconds', () => {
    expect(tradeFromView(tradeRow)).toEqual({
      signature: '5zW4k1Sig',
      blockTime: Math.floor(Date.parse('2026-09-14T10:15:30Z') / 1000),
      type: 'buy',
      amountToken: 12_500,
      amountQuote: 3.75,
      price: 0.0003,
      wallet: tradeRow.trader,
    });
    expect(tradeFromView({ ...tradeRow, side: 'sell' }).type).toBe('sell');
    expect(tradeFromView({ ...tradeRow, side: 'other', blockTime: 'nope' })).toMatchObject({ type: 'unknown', blockTime: null });
  });

  it('turns a tracker bucket into a chart candle', () => {
    expect(candleFromView(candleRows[0]!)).toEqual({
      time: 1_800_000_000,
      open: 1,
      high: 1.2,
      low: 0.9,
      close: 1.1,
      volume: 10,
      trades: 1,
      gap: false,
    });
  });

  it('reads the 24h block off a launch record defensively', () => {
    expect(readMetrics24h(null)).toEqual({ priceQuote: null, priceChange24hPct: null, volume24hQuote: null, volume24hUsd: null, trades24h: null });
    expect(
      readMetrics24h({
        marketCapUsd: 1,
        curveProgressPct: 1,
        holders: 1,
        priceUsd: 1,
        quoteRaised: 1,
        quoteTarget: 1,
        graduated: false,
        // The tracker's extra fields, as LaunchMetricsView on the wire carries them.
        ...({ priceQuote: 0.02, priceChange24hPct: -6.4, volume24hQuote: 812, volume24hUsd: 8.12, trades24h: 17 } as object),
      }),
    ).toEqual({ priceQuote: 0.02, priceChange24hPct: -6.4, volume24hQuote: 812, volume24hUsd: 8.12, trades24h: 17 });
  });
});

describe('fetchLaunchTrades', () => {
  it('reads GET /api/launch/{mint}/trades with limit and cursor, newest first, and the next cursor', async () => {
    fetchMock.mockResolvedValue(reply(200, { data: [tradeRow], next_cursor: 'abc' }));
    const page = await fetchLaunchTrades(MINT, { limit: 50, cursor: 'prev' });
    expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`/api/launch/${MINT}/trades\\?limit=50&cursor=prev$`));
    expect(page.trades).toEqual([tradeFromView(tradeRow)]);
    expect(page.nextCursor).toBe('abc');
  });

  it('ends the cursor on an empty next_cursor and tolerates a missing data array', async () => {
    fetchMock.mockResolvedValue(reply(200, { data: [], next_cursor: '' }));
    expect(await fetchLaunchTrades(MINT)).toEqual({ trades: [], nextCursor: null });
    fetchMock.mockResolvedValue(reply(200, {}));
    expect(await fetchLaunchTrades(MINT)).toEqual({ trades: [], nextCursor: null });
  });

  it("throws the tracker's error with its status", async () => {
    fetchMock.mockResolvedValue(reply(404, { error: { code: 'NOT_FOUND', message: 'launch not found' } }));
    await expect(fetchLaunchTrades('not-a-mint')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'launch not found' });
    await expect(fetchLaunchTrades('not-a-mint')).rejects.toBeInstanceOf(LaunchApiError);
  });
});

describe('fetchLaunchCandles', () => {
  it('reads GET /api/launch/{mint}/candles at a tracker interval, oldest first', async () => {
    fetchMock.mockResolvedValue(reply(200, { data: [candleRows[1], candleRows[0]] }));
    const candles = await fetchLaunchCandles(MINT, '5m', 200);
    expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`/api/launch/${MINT}/candles\\?interval=5m&limit=200$`));
    expect(candles.map(c => c.time)).toEqual([1_800_000_000, 1_800_000_300]);
  });

  it('returns nothing for a launch with no trades', async () => {
    fetchMock.mockResolvedValue(reply(200, { data: [] }));
    expect(await fetchLaunchCandles(MINT, '1h')).toEqual([]);
  });
});

describe('candle helpers', () => {
  const base: Candle = { time: 0, open: 1, high: 1, low: 1, close: 1, volume: 0, trades: 1, gap: false };

  it('rolls 1h candles up into 4h buckets aligned to the epoch', () => {
    const hourly: Candle[] = [
      { ...base, time: 3_600, open: 1, high: 2, low: 0.5, close: 1.5, volume: 1 },
      { ...base, time: 7_200, open: 1.5, high: 3, low: 1, close: 2, volume: 2 },
      { ...base, time: 14_400, open: 2, high: 2.5, low: 1.5, close: 2.2, volume: 3 },
    ];
    expect(rollUpCandles(hourly, 14_400)).toEqual([
      { time: 0, open: 1, high: 3, low: 0.5, close: 2, volume: 3, trades: 2, gap: false },
      { time: 14_400, open: 2, high: 2.5, low: 1.5, close: 2.2, volume: 3, trades: 1, gap: false },
    ]);
    expect(rollUpCandles(hourly, 0)).toEqual([]);
  });

  it('fills the gaps between buckets at the last close, connects opens, and extends to now', () => {
    const sparse: Candle[] = [
      { ...base, time: 300, open: 1, high: 1.2, low: 0.9, close: 1.1, volume: 10 },
      { ...base, time: 1_200, open: 1.3, high: 1.4, low: 1.25, close: 1.3, volume: 2 },
    ];
    const filled = fillCandleGaps(sparse, 300, 1_650);
    expect(filled.map(c => [c.time, c.open, c.close, c.gap])).toEqual([
      [300, 1, 1.1, false],
      [600, 1.1, 1.1, true],
      [900, 1.1, 1.1, true],
      [1_200, 1.1, 1.3, false],
      [1_500, 1.3, 1.3, true],
    ]);
    // The connected open widens the range when the bucket opened above the previous close.
    expect(filled[3]!.low).toBe(1.1);
    expect(fillCandleGaps([], 300)).toEqual([]);
  });

  it('scales prices and leaves volume alone', () => {
    const scaled = scaleCandles([{ ...base, open: 1, high: 2, low: 0.5, close: 1.5, volume: 7 }], 10);
    expect(scaled[0]).toMatchObject({ open: 10, high: 20, low: 5, close: 15, volume: 7 });
  });

  it('reads the change over a window off a series, or gives up when it does not reach', () => {
    const now = 10_000;
    const series: Candle[] = [
      { ...base, time: 1_000, close: 2 },
      { ...base, time: 4_000, close: 4 },
      { ...base, time: 9_000, close: 5 },
    ];
    expect(deltaFromCandles(series, 5, 1_000, now)).toBeCloseTo(0);
    expect(deltaFromCandles(series, 5, 6_000, now)).toBeCloseTo(25);
    expect(deltaFromCandles(series, 5, 9_000, now)).toBeCloseTo(150);
    expect(deltaFromCandles(series, 5, 9_500, now)).toBeNull();
    expect(deltaFromCandles(series, null, 1_000, now)).toBeNull();
  });

  it('maps chart intervals onto the tracker set, rolling 4h up from 1h', () => {
    expect(trackerIntervalFor(300)).toEqual({ interval: '5m', factor: 1 });
    expect(trackerIntervalFor(900)).toEqual({ interval: '15m', factor: 1 });
    expect(trackerIntervalFor(3_600)).toEqual({ interval: '1h', factor: 1 });
    expect(trackerIntervalFor(14_400)).toEqual({ interval: '1h', factor: 4 });
    expect(trackerIntervalFor(86_400)).toEqual({ interval: '1d', factor: 1 });
    expect(trackerIntervalFor(7)).toBeNull();
  });
});
