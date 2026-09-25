/**
 * $AGENT as a gallery token, without a tracker record.
 *
 * The Network's token is launched on stonk.fun: a LaunchLab pool under
 * stonk.fun's platform config, quoted in SOL, that the tracker never
 * recorded. The detail page and the pinned card still show it, so its
 * `GalleryToken` is built from what the environment names (mint, quote, pool)
 * and what the pool account says (creator, curve, price). Everything that
 * only a tracker record could supply (image, metadata, launch time, USD
 * figures) is null; the page reads "—" for those, never a sample.
 *
 * With the stonkfun source the token is what stonkfun's API lists instead
 * (`stonkfunAgentToken`): identity, image, quote, launch time, USD price and
 * cap, 24h change and volume, transfer tax and graduation all come from there.
 */

import { AGENT_MINT, AGENT_POOL_ID, AGENT_QUOTE_MINT, agentQuoteSymbol, featuredAgentToken } from '@/lib/agent-token';
import { readMetrics24h } from '@/lib/api/launch-trades';
import type { StonkfunToken } from '@/lib/api/stonkfun';
import type { LaunchPoolState } from '@/lib/launchlab/pool-state';
import { normalizeQuoteCategory, QUOTE_CATEGORY_LABELS } from '@/lib/launchlab/quote-catalog';
import type { GalleryToken } from './gallery-token';

/**
 * The $AGENT token from the environment and, once read, its pool. Pure. Only
 * built for the Network token's own page, which exists once the mint is
 * configured; the pool's mint stands in should the environment not name one.
 */
export function externalAgentToken(pool: LaunchPoolState | null | undefined): GalleryToken {
  const identity = featuredAgentToken(AGENT_MINT ?? pool?.mint ?? '');
  const quoteMint = pool?.quoteMint ?? AGENT_QUOTE_MINT;
  const quoteSymbol = agentQuoteSymbol(quoteMint);
  const category = normalizeQuoteCategory(quoteMint, quoteSymbol === 'SOL' ? 'solana' : null);
  return {
    mint: identity.mint,
    poolId: pool?.poolId ?? AGENT_POOL_ID,
    name: identity.name,
    symbol: identity.symbol,
    imageUrl: null,
    imageThumbUrl: null,
    creator: pool?.creator ?? '',
    peerId: null,
    quoteMint,
    quoteSymbol,
    quoteCategory: category,
    quoteCategoryLabel: category ? QUOTE_CATEGORY_LABELS[category] : null,
    quoteDecimals: pool?.quoteDecimals ?? null,
    // No record names the launch time; the page hides the age rather than guess.
    launchedAt: '',
    marketCapUsd: null,
    priceUsd: null,
    holders: null,
    curveProgressPct: pool?.progressPct ?? null,
    quoteRaised: pool?.raisedQuote ?? null,
    quoteTarget: pool?.targetQuote ?? null,
    graduated: pool?.graduated ?? false,
    metrics24h: readMetrics24h(null),
    // A stonk.fun launch carries no Token-2022 transfer tax: nothing flows to holders.
    transferFeeBps: null,
    metadataUri: null,
    launchFeeLamports: null,
    launchSignature: null,
    source: 'external',
    listing: null,
  };
}

/** The Network token as stonkfun lists it. Pure. */
export function stonkfunAgentToken(token: StonkfunToken): GalleryToken {
  const identity = featuredAgentToken(token.mint);
  const quoteMint = token.quote.mint ?? AGENT_QUOTE_MINT;
  const quoteSymbol = token.quote.symbol ?? agentQuoteSymbol(quoteMint);
  const category = normalizeQuoteCategory(quoteMint, quoteSymbol === 'SOL' ? 'solana' : null);
  return {
    mint: token.mint,
    poolId: token.pool,
    name: token.name || identity.name,
    symbol: token.symbol || identity.symbol,
    imageUrl: token.imageUrl,
    imageThumbUrl: null,
    creator: token.creator ?? '',
    peerId: null,
    quoteMint,
    quoteSymbol,
    quoteCategory: category,
    quoteCategoryLabel: category ? QUOTE_CATEGORY_LABELS[category] : null,
    quoteDecimals: null,
    launchedAt: token.createdAt ?? '',
    marketCapUsd: token.market.marketCapUsd,
    priceUsd: token.market.priceUsd,
    holders: null,
    curveProgressPct: token.graduated ? 100 : token.graduationProgress != null ? token.graduationProgress * 100 : null,
    quoteRaised: null,
    quoteTarget: null,
    graduated: token.graduated,
    // stonkfun prices in USD; the quote-denominated figures need a pool read the page does not make for this source.
    metrics24h: { ...readMetrics24h(null), priceChange24hPct: token.market.priceChange24h, volume24hUsd: token.market.volume24hUsd },
    transferFeeBps: token.transferFeeBps,
    metadataUri: null,
    launchFeeLamports: null,
    launchSignature: null,
    source: 'external',
    listing: null,
  };
}
