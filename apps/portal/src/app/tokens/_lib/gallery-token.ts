/**
 * One shape for every card and stat on the Agent Tokens pages.
 *
 * Two sources feed it: launches the tracker recorded on LaunchLab
 * (`GET /api/launches`, `GET /api/launch/{mint}`), and the older peer-bound
 * token list (`GET /api/tokens`), which still carries holders and market cap
 * for tokens whose agent is running. A mint that appears in both is one card,
 * with the launch as the identity and the listing filling any gap. A third
 * shape, `external`, is a LaunchLab pool the tracker never recorded ($AGENT on
 * stonk.fun), built from the pool account alone (`external-token.ts`).
 */

import { toLaunch, type Launch, type LaunchRecord } from '@/lib/api/launches';
import { readMetrics24h, type LaunchMetrics24h } from '@/lib/api/launch-trades';
import { QUOTE_CATEGORY_LABELS, STONK_MINT, normalizeQuoteCategory } from '@/lib/launchlab/quote-catalog';
import type { QuoteCategory } from '@/lib/types/agent-token';
import type { PeerTokenListing } from '@/lib/types/backend';

export type GalleryTokenSource = 'launch' | 'legacy' | 'external';

export interface GalleryToken {
  mint: string;
  poolId: string | null;
  name: string;
  symbol: string;
  imageUrl: string | null;
  /** The pinned 128 px copy of imageUrl, for every place a logo is shown at 128 CSS px or less. */
  imageThumbUrl: string | null;
  /** Creator wallet for a launch; peer id for a legacy listing. */
  creator: string;
  /** The agent bound to this token, when one is. */
  peerId: string | null;
  /** The bound agent's display name, when its owner set one. Absent on an external pool. */
  peerDisplayName?: string | null;
  quoteMint: string | null;
  quoteSymbol: string | null;
  quoteCategory: QuoteCategory | null;
  quoteCategoryLabel: string | null;
  quoteDecimals: number | null;
  launchedAt: string;
  marketCapUsd: number | null;
  priceUsd: number | null;
  holders: number | null;
  /** 0-100 along the bonding curve, or null when unknown. */
  curveProgressPct: number | null;
  quoteRaised: number | null;
  quoteTarget: number | null;
  graduated: boolean;
  /**
   * The tracker's trade-derived figures (its indexer over the pool's trades):
   * live price in quote, 24h change, 24h volume, 24h trade count. Every field
   * null until the indexer has seen a trade; all null for a legacy or external token.
   */
  metrics24h: LaunchMetrics24h;
  /** The holders' share of the trade fee, carried by the mint as a Token-2022 transfer fee, in basis points. Null for legacy tokens. */
  transferFeeBps: number | null;
  /** Off-chain metadata document (description, socials). Only a launch carries one. */
  metadataUri?: string | null;
  /** What the creator paid the treasury at launch, in lamports. */
  launchFeeLamports?: number | null;
  /** The launch transaction. */
  launchSignature?: string | null;
  source: GalleryTokenSource;
  /** The legacy row, kept for features that still speak it (holder chat). */
  listing: PeerTokenListing | null;
}

function categoryOf(mint: string | null, raw: string | null | undefined): QuoteCategory | null {
  if (mint === STONK_MINT) return 'stonk';
  if (!raw) return null;
  return normalizeQuoteCategory(mint, raw);
}

/** A recorded launch as a gallery token. */
export function fromLaunch(record: LaunchRecord): GalleryToken {
  const launch: Launch = toLaunch(record);
  const category = categoryOf(launch.quoteMint || null, launch.quote?.category);
  const { metrics } = launch;
  return {
    mint: launch.mint,
    poolId: launch.poolId || null,
    name: launch.name,
    symbol: launch.symbol,
    imageUrl: launch.imageUrl || null,
    imageThumbUrl: launch.imageThumbUrl,
    creator: launch.creatorWallet,
    peerId: launch.peerId || null,
    peerDisplayName: launch.peerDisplayName || null,
    quoteMint: launch.quoteMint || null,
    quoteSymbol: launch.quote?.symbol ?? (launch.quoteMint === STONK_MINT ? 'STONK' : null),
    quoteCategory: category,
    quoteCategoryLabel: category ? QUOTE_CATEGORY_LABELS[category] : null,
    quoteDecimals: launch.quote?.decimals ?? null,
    launchedAt: launch.createdAt,
    marketCapUsd: metrics?.marketCapUsd ?? null,
    priceUsd: metrics?.priceUsd ?? null,
    holders: metrics?.holders ?? null,
    curveProgressPct: metrics?.curveProgressPct ?? null,
    quoteRaised: metrics?.quoteRaised ?? null,
    quoteTarget: metrics?.quoteTarget ?? null,
    graduated: metrics?.graduated === true,
    metrics24h: readMetrics24h(metrics),
    transferFeeBps: launch.transferFeeBps,
    metadataUri: launch.metadataUri || null,
    launchFeeLamports: launch.feeLamports || null,
    launchSignature: launch.launchSignature || null,
    source: 'launch',
    listing: null,
  };
}

/** A legacy peer-token listing as a gallery token. */
export function fromListing(listing: PeerTokenListing): GalleryToken {
  const m = listing.metrics;
  return {
    mint: listing.token_contract_address,
    poolId: null,
    name: listing.token_name,
    symbol: listing.token_ticker,
    imageUrl: listing.token_image_url || null,
    imageThumbUrl: null,
    creator: listing.peer_id,
    peerId: listing.peer_id || null,
    peerDisplayName: listing.display_name?.trim() || null,
    quoteMint: null,
    quoteSymbol: null,
    quoteCategory: null,
    quoteCategoryLabel: null,
    quoteDecimals: null,
    launchedAt: listing.launched_at,
    marketCapUsd: m?.marketCapUsd ?? null,
    priceUsd: m?.priceUsd ?? null,
    holders: m?.holders ?? null,
    curveProgressPct: m?.bondingCurvePercent ?? null,
    quoteRaised: m?.solRaised ?? null,
    quoteTarget: null,
    graduated: m?.complete === true,
    metrics24h: readMetrics24h(null),
    transferFeeBps: null,
    metadataUri: null,
    launchFeeLamports: null,
    launchSignature: null,
    source: 'legacy',
    listing,
  };
}

/** Fill a launch's blanks from the listing of the same mint. */
function fill(launch: GalleryToken, listing: GalleryToken): GalleryToken {
  return {
    ...launch,
    imageUrl: launch.imageUrl ?? listing.imageUrl,
    imageThumbUrl: launch.imageThumbUrl ?? listing.imageThumbUrl,
    peerId: launch.peerId ?? listing.peerId,
    peerDisplayName: launch.peerDisplayName ?? listing.peerDisplayName ?? null,
    marketCapUsd: launch.marketCapUsd ?? listing.marketCapUsd,
    priceUsd: launch.priceUsd ?? listing.priceUsd,
    holders: launch.holders ?? listing.holders,
    curveProgressPct: launch.curveProgressPct ?? listing.curveProgressPct,
    graduated: launch.graduated || listing.graduated,
    listing: listing.listing,
  };
}

/**
 * Launches first, then listings not already covered by a launch. A mint in
 * both is one token: the launch's identity, the listing's spare metrics.
 */
export function mergeGallery(launches: readonly LaunchRecord[], listings: readonly PeerTokenListing[]): GalleryToken[] {
  const byMint = new Map<string, GalleryToken>();
  for (const listing of listings) {
    const token = fromListing(listing);
    byMint.set(token.mint, token);
  }

  const out: GalleryToken[] = [];
  const seen = new Set<string>();
  for (const record of launches) {
    const launch = fromLaunch(record);
    const legacy = byMint.get(launch.mint);
    out.push(legacy ? fill(launch, legacy) : launch);
    seen.add(launch.mint);
  }
  for (const [mint, token] of byMint) {
    if (!seen.has(mint)) out.push(token);
  }
  return out;
}

/** The legacy row shape, for components that still take one. */
export function toListing(token: GalleryToken): PeerTokenListing {
  if (token.listing) return token.listing;
  return {
    peer_id: token.peerId ?? '',
    ...(token.peerDisplayName ? { display_name: token.peerDisplayName } : {}),
    token_contract_address: token.mint,
    token_ticker: token.symbol,
    token_name: token.name,
    token_image_url: token.imageUrl ?? '',
    launched_at: token.launchedAt,
    metrics: null,
  };
}

export function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(3)}`;
}

export function formatQuoteAmount(value: number | null, symbol: string | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  const unit = symbol ? ` ${symbol}` : '';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M${unit}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K${unit}`;
  if (value >= 1) return `${value.toFixed(2)}${unit}`;
  return `${value.toPrecision(3)}${unit}`;
}

export function truncateAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
}
