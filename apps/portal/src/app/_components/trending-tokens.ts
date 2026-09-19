/**
 * Story: Home — trending Agents
 * Purpose: Pick the agents the home page shows before Step 2: top `limit` by
 *          market cap. Pure, so the ranking is testable without the gallery hook.
 */

import type { GalleryToken } from '@/app/tokens/_lib/gallery-token';

export const TRENDING_LIMIT = 6;

/** Descending, unknown values last. */
function compareDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function compareTrending(a: GalleryToken, b: GalleryToken): number {
  return (
    compareDesc(a.marketCapUsd, b.marketCapUsd) ||
    compareDesc(a.curveProgressPct, b.curveProgressPct) ||
    b.launchedAt.localeCompare(a.launchedAt)
  );
}

/**
 * Top `limit` tokens by market cap (ties by curve progress, then newest).
 * Tokens without a market cap are left out only when enough tokens have one;
 * otherwise they fill the remaining slots ranked by curve progress.
 */
export function rankTrendingTokens(tokens: readonly GalleryToken[], limit = TRENDING_LIMIT): GalleryToken[] {
  const withMarketCap = tokens.filter(t => t.marketCapUsd != null);
  const pool = withMarketCap.length >= limit ? withMarketCap : [...tokens];
  return pool.sort(compareTrending).slice(0, limit);
}
