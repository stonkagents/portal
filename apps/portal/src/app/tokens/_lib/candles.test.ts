import { describe, it, expect } from 'vitest';
import { buildCandles, lastTradePrice, pricedTrades, type TapeTrade } from './candles';
import { concentration, tapeStats } from './tape-stats';

const T0 = 1_700_000_400; // a multiple of 3600, so buckets are easy to read

const tape: TapeTrade[] = [
  { blockTime: T0 + 10, type: 'buy', price: 1.0, amountQuote: 10, amountToken: 10 },
  { blockTime: T0 + 40, type: 'sell', price: 1.2, amountQuote: 12, amountToken: 10 },
  { blockTime: T0 + 50, type: 'buy', price: 0.9, amountQuote: 9, amountToken: 10 },
  // a two-minute gap
  { blockTime: T0 + 190, type: 'buy', price: 1.5, amountQuote: 15, amountToken: 10 },
  { blockTime: T0 + 200, type: 'unknown' },
  { blockTime: null, type: 'buy', price: 99 },
  { blockTime: T0 + 210, type: 'buy', amountToken: 5 }, // no price
];

describe('buildCandles', () => {
  it('buckets by interval, connects opens to the previous close, and fills gaps flat', () => {
    const candles = buildCandles(tape, { intervalSeconds: 60 });
    expect(candles.map(c => c.time)).toEqual([T0, T0 + 60, T0 + 120, T0 + 180]);

    expect(candles[0]).toMatchObject({ open: 1.0, high: 1.2, low: 0.9, close: 0.9, volume: 31, trades: 3, gap: false });
    expect(candles[1]).toMatchObject({ open: 0.9, high: 0.9, low: 0.9, close: 0.9, volume: 0, trades: 0, gap: true });
    expect(candles[2].gap).toBe(true);
    // Opens at the last close (0.9), trades up to 1.5.
    expect(candles[3]).toMatchObject({ open: 0.9, high: 1.5, low: 0.9, close: 1.5, volume: 15, trades: 1, gap: false });
  });

  it('extends flat candles up to now', () => {
    const candles = buildCandles(tape, { intervalSeconds: 60, now: T0 + 330 });
    expect(candles).toHaveLength(6);
    expect(candles[5]).toMatchObject({ time: T0 + 300, close: 1.5, gap: true });
  });

  it('caps the window and seeds the first open from older trades', () => {
    const candles = buildCandles(tape, { intervalSeconds: 60, now: T0 + 200, maxBuckets: 2 });
    expect(candles.map(c => c.time)).toEqual([T0 + 120, T0 + 180]);
    expect(candles[0]).toMatchObject({ open: 0.9, close: 0.9, gap: true });
  });

  it('scales prices, e.g. into market cap', () => {
    const candles = buildCandles(tape, { intervalSeconds: 3600, scale: 1000 });
    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({ open: 1000, high: 1500, low: 900, close: 1500 });
  });

  it('returns nothing without priced trades', () => {
    expect(buildCandles([{ blockTime: T0, type: 'unknown' }], { intervalSeconds: 60 })).toEqual([]);
    expect(buildCandles(tape, { intervalSeconds: 0 })).toEqual([]);
  });

  it('exposes the priced tape and the last price', () => {
    expect(pricedTrades(tape)).toHaveLength(4);
    expect(lastTradePrice(tape)).toBe(1.5);
    expect(lastTradePrice([])).toBeNull();
  });
});

describe('tapeStats', () => {
  const now = T0 + 24 * 3600 + 100; // just past one day after T0
  const midnight = Math.floor(now / 86400) * 86400;

  it('sums quote volume and counts sides inside the last 24h', () => {
    const trades: TapeTrade[] = [
      { blockTime: now - 10, type: 'buy', amountQuote: 100 },
      { blockTime: now - 3600, type: 'sell', amountQuote: 40 },
      { blockTime: now - 86_400 - 1, type: 'buy', amountQuote: 999 }, // outside
      { blockTime: now - 100, type: 'unknown' },
    ];
    const stats = tapeStats(trades, now);
    expect(stats).toMatchObject({ volume24hQuote: 140, trades24h: 2, buys24h: 1, sells24h: 1, truncated: false });
    expect(stats.tradesToday).toBe([now - 10, now - 3600].filter(t => t >= midnight).length);
  });

  it('flags a tape that does not reach back a full day', () => {
    expect(tapeStats([{ blockTime: now - 60, type: 'buy', amountQuote: 1 }], now).truncated).toBe(true);
    expect(tapeStats([], now).truncated).toBe(false);
  });
});

describe('concentration', () => {
  it('measures top-10 and next-100 over the circulating supply, ignoring the pool', () => {
    const holders = [
      { amount: 1_000, isPool: true },
      ...Array.from({ length: 10 }, () => ({ amount: 50 })), // 500
      ...Array.from({ length: 20 }, () => ({ amount: 10 })), // 200
      { amount: 0 },
    ];
    const c = concentration(holders);
    expect(c.holders).toBe(30);
    expect(c.top10Pct).toBeCloseTo((500 / 700) * 100);
    expect(c.next100Pct).toBeCloseTo((200 / 700) * 100);
  });

  it('is zero without holders', () => {
    expect(concentration([{ amount: 5, isPool: true }])).toEqual({ top10Pct: 0, next100Pct: 0, holders: 0 });
  });
});

describe('query resilience', () => {
  it('backs off exponentially, capped, and polls faster while in error', async () => {
    const { ERROR_REFETCH_MS, refetchInterval, resilient, retryDelay, isReconnecting } = await import('./query-resilience');
    expect([0, 1, 2, 3, 4].map(retryDelay)).toEqual([1_000, 2_000, 4_000, 8_000, 8_000]);
    const healthy = { state: { status: 'success' } };
    const failing = { state: { status: 'error' } };
    expect(refetchInterval(60_000)(healthy)).toBe(60_000);
    expect(refetchInterval(false)(healthy)).toBe(false);
    expect(refetchInterval(60_000)(failing)).toBe(ERROR_REFETCH_MS);
    expect(resilient(30_000)).toMatchObject({ retry: 3, refetchOnWindowFocus: false });
    expect(isReconnecting({ isError: true, data: [] })).toBe(true);
    expect(isReconnecting({ isError: true, data: undefined })).toBe(false);
    expect(isReconnecting({ isError: false, data: [] })).toBe(false);
  });
});
