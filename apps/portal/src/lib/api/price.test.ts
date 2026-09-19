/**
 * Track A2 — SOL price feed and the launch fee quote.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const WSOL = 'So11111111111111111111111111111111111111112';

const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    api: { solPriceUrl: 'https://lite-api.jup.ag/price/v3' },
    solana: { wrappedSolMint: 'So11111111111111111111111111111111111111112', lamportsPerSol: 1_000_000_000 },
    fees: { launchFeeUsd: 0.5, fallbackSolUsd: 100 },
  },
}));

vi.mock('@/config', () => ({ config: mockConfig }));

import { getSolUsd, usdToLamports, launchFeeQuote, resetSolUsdCache, peekSolUsd, PRICE_CACHE_MS } from './price';

const priceResponse = (usdPrice: unknown) =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve({ data: { [WSOL]: { usdPrice } } }),
  }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetSolUsdCache();
  mockConfig.api.solPriceUrl = 'https://lite-api.jup.ag/price/v3';
  mockConfig.fees.launchFeeUsd = 0.5;
  mockConfig.fees.fallbackSolUsd = 100;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  resetSolUsdCache();
});

describe('getSolUsd', () => {
  it('reads data[mint].usdPrice from the live feed', async () => {
    fetchMock.mockResolvedValue(priceResponse(212.5));

    const price = await getSolUsd();

    expect(price.usd).toBe(212.5);
    expect(price.source).toBe('live');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://lite-api.jup.ag/price/v3?ids=${WSOL}`);
  });

  it('accepts a numeric string price', async () => {
    fetchMock.mockResolvedValue(priceResponse('180.25'));
    await expect(getSolUsd()).resolves.toMatchObject({ usd: 180.25, source: 'live' });
  });

  it('falls back when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(getSolUsd()).resolves.toMatchObject({ usd: 100, source: 'fallback' });
  });

  it('falls back on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway' } as Response);
    await expect(getSolUsd()).resolves.toMatchObject({ usd: 100, source: 'fallback' });
  });

  it('falls back when the mint is missing from the payload', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) } as unknown as Response);
    await expect(getSolUsd()).resolves.toMatchObject({ usd: 100, source: 'fallback' });
  });

  it.each([[null], [0], [-1], ['abc'], [undefined]])('falls back when usdPrice is %p', async value => {
    fetchMock.mockResolvedValue(priceResponse(value));
    await expect(getSolUsd()).resolves.toMatchObject({ usd: 100, source: 'fallback' });
  });

  it('uses the configured fallback price', async () => {
    mockConfig.fees.fallbackSolUsd = 175;
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(getSolUsd()).resolves.toMatchObject({ usd: 175, source: 'fallback' });
  });

  it('strips a trailing slash from the feed url', async () => {
    mockConfig.api.solPriceUrl = 'https://lite-api.jup.ag/price/v3/';
    fetchMock.mockResolvedValue(priceResponse(200));
    await getSolUsd();
    expect(fetchMock.mock.calls[0][0]).toBe(`https://lite-api.jup.ag/price/v3?ids=${WSOL}`);
  });
});

describe('the 60 second cache', () => {
  it('serves the second call from memory', async () => {
    fetchMock.mockResolvedValue(priceResponse(200));

    await getSolUsd();
    await getSolUsd();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one request between concurrent callers', async () => {
    fetchMock.mockResolvedValue(priceResponse(200));

    const [a, b] = await Promise.all([getSolUsd(), getSolUsd()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.usd).toBe(b.usd);
  });

  it('refetches once the cache is 60 seconds old', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T00:00:00Z'));
    fetchMock.mockResolvedValue(priceResponse(200));

    await getSolUsd();
    vi.setSystemTime(new Date(Date.now() + PRICE_CACHE_MS + 1));
    fetchMock.mockResolvedValue(priceResponse(250));

    await expect(getSolUsd()).resolves.toMatchObject({ usd: 250 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('peekSolUsd returns nothing before the first fetch and the price after', async () => {
    expect(peekSolUsd()).toBeNull();
    fetchMock.mockResolvedValue(priceResponse(200));
    await getSolUsd();
    expect(peekSolUsd()?.usd).toBe(200);
  });

  it('resetSolUsdCache forces a refetch', async () => {
    fetchMock.mockResolvedValue(priceResponse(200));
    await getSolUsd();
    resetSolUsdCache();
    await getSolUsd();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('usdToLamports', () => {
  it('converts at the given price', () => {
    expect(usdToLamports(100, 100)).toBe(1_000_000_000);
    expect(usdToLamports(0.5, 100)).toBe(5_000_000);
  });

  it('rounds up so we never under-collect', () => {
    // 0.5 / 3 SOL = 0.1666…, which is not a whole number of lamports.
    expect(usdToLamports(0.5, 3)).toBe(166_666_667);
    expect(usdToLamports(1, 3)).toBe(333_333_334);
  });

  it('returns zero for a zero fee', () => {
    expect(usdToLamports(0, 200)).toBe(0);
  });

  it('rejects a non-positive SOL price', () => {
    expect(() => usdToLamports(0.5, 0)).toThrow(RangeError);
    expect(() => usdToLamports(0.5, -1)).toThrow(RangeError);
    expect(() => usdToLamports(0.5, Number.NaN)).toThrow(RangeError);
  });

  it('rejects a negative fee', () => {
    expect(() => usdToLamports(-1, 100)).toThrow(RangeError);
  });
});

describe('launchFeeQuote', () => {
  it('quotes the configured fee against the live price', async () => {
    fetchMock.mockResolvedValue(priceResponse(200));

    const quote = await launchFeeQuote();

    expect(quote).toEqual({
      usd: 0.5,
      sol: 0.0025,
      lamports: 2_500_000,
      solUsd: 200,
      source: 'live',
    });
  });

  it('reports the fallback source when the feed is down', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const quote = await launchFeeQuote();

    expect(quote.source).toBe('fallback');
    expect(quote.solUsd).toBe(100);
    expect(quote.lamports).toBe(5_000_000);
  });

  it('follows the configured launch fee', async () => {
    mockConfig.fees.launchFeeUsd = 2;
    fetchMock.mockResolvedValue(priceResponse(200));

    await expect(launchFeeQuote()).resolves.toMatchObject({ usd: 2, lamports: 10_000_000 });
  });

  it('accepts an override amount', async () => {
    fetchMock.mockResolvedValue(priceResponse(200));
    await expect(launchFeeQuote(1)).resolves.toMatchObject({ usd: 1, lamports: 5_000_000 });
  });

  it('keeps sol and lamports consistent', async () => {
    fetchMock.mockResolvedValue(priceResponse(173.42));

    const quote = await launchFeeQuote();

    expect(quote.lamports).toBe(Math.ceil((0.5 / 173.42) * 1_000_000_000));
    expect(quote.sol).toBeCloseTo(quote.lamports / 1_000_000_000, 12);
  });
});
