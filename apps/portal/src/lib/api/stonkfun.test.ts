/**
 * stonkfun's public API client: the parsers against a captured answer for
 * $KNOTS (fixtures under `__fixtures__/stonkfun/`, taken with curl on
 * 2026-09-14), tolerance for missing fields, and the fetchers' error paths.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STONKFUN_API_BASE,
  StonkfunApiError,
  fetchStonkfunBurns,
  fetchStonkfunToken,
  parseStonkfunBurns,
  parseStonkfunToken,
  stonkfunTokenUrl,
} from './stonkfun';

const KNOTS = '8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS';
const STONK = '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';

const read = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'stonkfun', name), 'utf8'));
const tokenBody = read('knots-token.json');
const burnsBody = read('knots-burns.json');

describe('stonkfunTokenUrl', () => {
  it('is the token page on stonkfun', () => {
    expect(stonkfunTokenUrl(KNOTS)).toBe(`https://www.stonkfun.xyz/token/${KNOTS}`);
  });
});

describe('parseStonkfunToken', () => {
  it('reads the captured $KNOTS answer: identity, quote, market, status, launch', () => {
    const token = parseStonkfunToken(tokenBody)!;
    expect(token).toMatchObject({
      mint: KNOTS,
      pool: 'GeNDy5afAWz7S9w2tMLgpK3xQqXjeDaCvYV9h8joEmjo',
      name: 'KNOTS',
      symbol: 'KNOTS',
      quote: { mint: STONK, symbol: 'STONK', name: 'STONK' },
      launchpad: 'launchlab',
      mode: 'reward',
      transferFeeBps: 300,
      flywheelActive: true,
      imageUrl: 'https://gateway.irys.xyz/3KNgu99JvZ961wXUxcZ8LXDXjaWK4651Wo9oUZSA5U4L',
      links: { website: 'https://www.stonkfun.xyz/', twitter: 'https://x.com/KnotsOnStonk' },
      status: 'graduated',
      graduated: true,
      graduationProgress: 1,
      graduatedAt: '2026-09-06T14:47:58.750Z',
      createdAt: '2026-09-05T16:34:45.099Z',
      creator: 'FYL2HTK3wZyDxdXwEMvCNKhS5J4LyvbggBr6Yj23SUs1',
      network: 'mainnet-beta',
    });
    expect(token.market.priceUsd).toBeCloseTo(0.0194, 4);
    expect(token.market.marketCapUsd).toBeCloseTo(19_403_285.93, 2);
    expect(token.market.fdvUsd).toBeCloseTo(19_403_285.93, 2);
    expect(token.market.volume24hUsd).toBeCloseTo(1_477_671.96, 2);
    expect(token.market.liquidityUsd).toBeCloseTo(980_821.94, 2);
    expect(token.market.priceChange24h).toBeCloseTo(-10.86, 2);
    expect(token.market.peakMarketCapUsd).toBeCloseTo(51_612_421.53, 2);
  });

  it('tolerates a missing field: null for it, never a guess', () => {
    const token = parseStonkfunToken({ data: { token: { mint: KNOTS, symbol: 'KNOTS', status: 'live', graduationProgress: 0.42 } } })!;
    expect(token).toMatchObject({
      mint: KNOTS,
      name: '',
      symbol: 'KNOTS',
      pool: null,
      quote: { mint: null, symbol: null, name: null },
      transferFeeBps: null,
      flywheelActive: null,
      imageUrl: null,
      links: { website: null, twitter: null },
      market: { priceUsd: null, marketCapUsd: null, volume24hUsd: null, liquidityUsd: null, priceChange24h: null },
      status: 'live',
      graduated: false,
      graduationProgress: 0.42,
      graduatedAt: null,
      createdAt: null,
      creator: null,
      network: null,
    });
  });

  it('falls back to the launch record for what the token block leaves out', () => {
    const token = parseStonkfunToken({
      data: { launch: { mint: KNOTS, name: 'KNOTS', symbol: 'KNOTS', pool: 'Pool', quote: { mint: STONK, symbol: 'STONK' }, logoUrl: 'https://img', createdAt: '2026-09-05T16:34:18.065Z' } },
    })!;
    expect(token).toMatchObject({ mint: KNOTS, pool: 'Pool', name: 'KNOTS', imageUrl: 'https://img', createdAt: '2026-09-05T16:34:18.065Z' });
    expect(token.quote.symbol).toBe('STONK');
  });

  it('is null without a mint, and for a body that is not an object', () => {
    expect(parseStonkfunToken({ data: { token: { name: 'x' } } })).toBeNull();
    expect(parseStonkfunToken(null)).toBeNull();
    expect(parseStonkfunToken('nope')).toBeNull();
  });

  it('drops a non-numeric market figure rather than passing it through', () => {
    const token = parseStonkfunToken({ data: { token: { mint: KNOTS, market: { priceUsd: '0.01', marketCapUsd: NaN, volume24hUsd: 5 } } } })!;
    expect(token.market).toMatchObject({ priceUsd: null, marketCapUsd: null, volume24hUsd: 5 });
  });
});

describe('parseStonkfunBurns', () => {
  it('reads the captured $KNOTS burns: totals and the list, newest first', () => {
    const burns = parseStonkfunBurns(burnsBody);
    expect(burns.mint).toBe(KNOTS);
    expect(burns.totals).toMatchObject({ symbol: 'KNOTS', amountTokens: 1_275_455.037554, burnCount: 1966, lastBurnAt: '2026-09-14T16:15:58.148Z' });
    expect(burns.totals.valueUsdAtBurn).toBeCloseTo(16_373.86, 2);
    expect(burns.burns).toHaveLength(5);
    expect(burns.burns[0]).toEqual({
      signature: '4RaJAZQW3eJaa2P7ZcQhLxzDnGcUk62K9dSUF1bK8s6YNNM1YkD9tkNu6JJdkViBDgGcJipaRoagff7ieHRzAb4P',
      symbol: 'KNOTS',
      amountTokens: 7043.046204,
      valueUsdAtBurn: 142.96179064264328,
      source: 'flywheel',
      burnedAt: '2026-09-14T16:15:58.148Z',
    });
    expect(Date.parse(burns.burns[0].burnedAt)).toBeGreaterThan(Date.parse(burns.burns[4].burnedAt));
  });

  it('sums the list and counts it when the totals are missing, and drops a burn without a signature or a time', () => {
    const burns = parseStonkfunBurns({
      data: {
        burns: [
          { signature: 'a', amountTokens: 10, burnedAt: '2026-09-14T10:00:00Z' },
          { signature: '', amountTokens: 99, burnedAt: '2026-09-14T09:00:00Z' },
          { signature: 'c', amountTokens: 5 },
          { signature: 'd', amountTokens: 2.5, burnedAt: '2026-09-14T08:00:00Z' },
        ],
      },
    });
    expect(burns.burns.map(b => b.signature)).toEqual(['a', 'd']);
    expect(burns.totals).toEqual({ symbol: null, amountTokens: 12.5, valueUsdAtBurn: null, burnCount: 2, lastBurnAt: '2026-09-14T10:00:00Z' });
  });

  it('is an empty ledger for nothing at all', () => {
    expect(parseStonkfunBurns(undefined)).toEqual({
      mint: null,
      totals: { symbol: null, amountTokens: 0, valueUsdAtBurn: null, burnCount: 0, lastBurnAt: null },
      burns: [],
    });
  });
});

describe('fetchers', () => {
  const fetchMock = vi.fn();
  const reply = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the token from the public API with a JSON accept header', async () => {
    fetchMock.mockResolvedValue(reply(200, tokenBody));
    const token = await fetchStonkfunToken(KNOTS);
    expect(token.symbol).toBe('KNOTS');
    expect(fetchMock).toHaveBeenCalledWith(`${STONKFUN_API_BASE}/tokens/${KNOTS}`, expect.objectContaining({ headers: { Accept: 'application/json' } }));
  });

  it('throws for a token stonkfun does not know, and for an outage', async () => {
    fetchMock.mockResolvedValue(reply(404, { error: 'not found' }));
    await expect(fetchStonkfunToken(KNOTS)).rejects.toMatchObject({ name: 'StonkfunApiError', status: 404 });
    fetchMock.mockResolvedValue(reply(503));
    await expect(fetchStonkfunToken(KNOTS)).rejects.toBeInstanceOf(StonkfunApiError);
    fetchMock.mockResolvedValue(reply(200, { data: {} }));
    await expect(fetchStonkfunToken(KNOTS)).rejects.toThrow(/named no token/);
  });

  it('asks for 25 burns and reads a 404 as an empty ledger', async () => {
    fetchMock.mockResolvedValue(reply(200, burnsBody));
    const burns = await fetchStonkfunBurns(KNOTS);
    expect(burns.totals.burnCount).toBe(1966);
    expect(fetchMock).toHaveBeenCalledWith(`${STONKFUN_API_BASE}/tokens/${KNOTS}/burns?limit=25`, expect.anything());
    fetchMock.mockResolvedValue(reply(404));
    expect(await fetchStonkfunBurns(KNOTS)).toMatchObject({ mint: KNOTS, totals: { amountTokens: 0, burnCount: 0 }, burns: [] });
    fetchMock.mockResolvedValue(reply(429));
    await expect(fetchStonkfunBurns(KNOTS)).rejects.toMatchObject({ status: 429 });
  });
});
