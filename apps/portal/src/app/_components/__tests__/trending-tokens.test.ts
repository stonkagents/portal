/**
 * Purpose: Tests for rankTrendingTokens — top N by market cap with the curve
 *          progress fallback.
 */
import { describe, it, expect } from 'vitest';
import { rankTrendingTokens, TRENDING_LIMIT } from '../trending-tokens';
import type { GalleryToken } from '@/app/tokens/_lib/gallery-token';

function token(overrides: Partial<GalleryToken> & { mint: string }): GalleryToken {
  return {
    poolId: null,
    name: overrides.mint,
    symbol: overrides.mint.slice(0, 4).toUpperCase(),
    imageUrl: null,
    imageThumbUrl: null,
    creator: 'Wa11et',
    peerId: null,
    quoteMint: null,
    quoteSymbol: 'STONK',
    quoteCategory: null,
    quoteCategoryLabel: null,
    quoteDecimals: null,
    launchedAt: '2026-09-01T00:00:00Z',
    marketCapUsd: null,
    priceUsd: null,
    holders: null,
    curveProgressPct: null,
    quoteRaised: null,
    quoteTarget: null,
    graduated: false,
    metrics24h: { priceQuote: null, priceChange24hPct: null, volume24hQuote: null, volume24hUsd: null, trades24h: null },
    transferFeeBps: null,
    source: 'launch',
    listing: null,
    ...overrides,
  };
}

const mints = (list: GalleryToken[]) => list.map(t => t.mint);

describe('rankTrendingTokens', () => {
  it('returns an empty list for no tokens', () => {
    expect(rankTrendingTokens([])).toEqual([]);
  });

  it('orders by market cap descending and caps at the limit', () => {
    const tokens = Array.from({ length: 10 }, (_, i) => token({ mint: `m${i}`, marketCapUsd: i * 1000 }));
    const ranked = rankTrendingTokens(tokens);
    expect(ranked).toHaveLength(TRENDING_LIMIT);
    expect(mints(ranked)).toEqual(['m9', 'm8', 'm7', 'm6', 'm5', 'm4']);
  });

  it('breaks market cap ties by curve progress, then by newest launch', () => {
    const tokens = [
      token({ mint: 'old', marketCapUsd: 500, curveProgressPct: 40, launchedAt: '2026-09-01T00:00:00Z' }),
      token({ mint: 'hot', marketCapUsd: 500, curveProgressPct: 80 }),
      token({ mint: 'new', marketCapUsd: 500, curveProgressPct: 40, launchedAt: '2026-09-10T00:00:00Z' }),
    ];
    expect(mints(rankTrendingTokens(tokens))).toEqual(['hot', 'new', 'old']);
  });

  it('drops tokens without a market cap when enough tokens have one', () => {
    const tokens = [
      ...Array.from({ length: 6 }, (_, i) => token({ mint: `mc${i}`, marketCapUsd: 100 + i })),
      token({ mint: 'nomc', curveProgressPct: 99 }),
    ];
    const ranked = rankTrendingTokens(tokens);
    expect(ranked).toHaveLength(6);
    expect(mints(ranked)).not.toContain('nomc');
  });

  it('falls back to curve progress to fill the row when market caps are scarce', () => {
    const tokens = [
      token({ mint: 'curve-low', curveProgressPct: 10 }),
      token({ mint: 'mc', marketCapUsd: 42 }),
      token({ mint: 'curve-high', curveProgressPct: 90 }),
      token({ mint: 'unknown' }),
    ];
    expect(mints(rankTrendingTokens(tokens))).toEqual(['mc', 'curve-high', 'curve-low', 'unknown']);
  });

  it('honours a custom limit and does not mutate the input', () => {
    const tokens = [token({ mint: 'a', marketCapUsd: 1 }), token({ mint: 'b', marketCapUsd: 2 })];
    const snapshot = mints(tokens);
    expect(mints(rankTrendingTokens(tokens, 1))).toEqual(['b']);
    expect(mints(tokens)).toEqual(snapshot);
  });
});
