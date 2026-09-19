/**
 * The Network's token ($AGENT), live.
 *
 * $AGENT trades on a LaunchLab pool under stonk.fun's platform config, quoted
 * in SOL, which the tracker never recorded. So the pinned card and the detail
 * page read the pool itself: `useExternalPoolState` finds it from the mint and
 * the quote (or `NEXT_PUBLIC_AGENT_POOL`) on the cluster's LaunchLab program
 * and decodes the platform config the pool names. Price, market cap in the
 * quote, curve progress and graduation come from there; the USD figures need
 * a USD price for the quote (`useQuoteUsd`) and stay null without one.
 *
 * Should the tracker ever record the launch (`GET /api/launch/{mint}`), its
 * record supplies what only an indexer can — image, 24h change and volume,
 * USD market cap — and its quote and pool id route the same pool read. The
 * chain still wins for the live figures. Every stat is null until its source
 * has answered; the card renders "—" for a null. Nothing is sampled.
 *
 * With `NEXT_PUBLIC_AGENT_SOURCE=stonkfun` the pool is not read at all: the
 * stats are stonkfun's public API (`useStonkfunToken`), which prices the
 * token in USD itself and names its quote, identity and curve status.
 */
'use client';

import { useMemo } from 'react';
import { AGENT_POOL_ID, AGENT_QUOTE_MINT, AGENT_SOURCE, agentQuoteSymbol, isAgentMint, type AgentTokenSource } from '@/lib/agent-token';
import { useLaunchDetail } from '@/lib/api/hooks/use-launch-detail';
import { useStonkfunToken } from '@/lib/api/hooks/use-stonkfun-token';
import { readMetrics24h } from '@/lib/api/launch-trades';
import type { LaunchRecord } from '@/lib/api/launches';
import { STONKFUN_NAME, type StonkfunToken } from '@/lib/api/stonkfun';
import { useExternalPoolState } from '@/lib/launchlab/external-pool';
import type { LaunchPoolState } from '@/lib/launchlab/pool-state';
import { useQuoteUsd } from '@/app/tokens/_lib/use-token-detail-data';

export interface AgentTokenStats {
  /** Name and symbol as the source lists them. Null when the source does not name them: the configured identity stands. */
  name: string | null;
  symbol: string | null;
  /** Tracker image (IPFS gateway URL). Null without a record. */
  image: string | null;
  /** Symbol of the quote the pool raises in: SOL on stonk.fun. */
  quoteSymbol: string | null;
  mcapUsd: number | null;
  priceUsd: number | null;
  /** Price of one whole token in the quote, off the pool. */
  priceQuote: number | null;
  /** Market cap in the quote: pool price × the supply the pool was created with. */
  mcapQuote: number | null;
  /** Whole tokens the mint was created with, as the pool records it. */
  supply: number | null;
  holders: number | null;
  /** Percent over 24h, from the tracker's indexer. Null without a record. */
  change24h: number | null;
  /** USD over 24h, from the tracker's indexer. Null without a record. */
  volume24h: number | null;
  /** USD in the pool, when the source states it (stonkfun). Null otherwise. */
  liquidityUsd: number | null;
  curveProgressPct: number | null;
  graduated: boolean | null;
  /** Mint the pool raises in. */
  quoteMint: string | null;
  /** The LaunchLab pool. */
  poolId: string | null;
  /** Wallet that created the pool. */
  creatorWallet: string | null;
  /** The platform config the pool was created under, and its name when readable. */
  platformId: string | null;
  platformName: string | null;
  /** Token-2022 transfer fee on the mint, in basis points. Null without a record; a stonk.fun launch has none. */
  transferFeeBps: number | null;
  /** ISO time the launch was recorded. Null without a record. */
  launchedAt: string | null;
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Map a tracker launch record onto the card's stats. Exported for tests. */
export function agentStatsFromLaunch(record: LaunchRecord): AgentTokenStats {
  const metrics = record.metrics ?? null;
  const m24 = readMetrics24h(metrics);
  return {
    name: null,
    symbol: null,
    image: record.imageUrl || record.image_url || null,
    quoteSymbol: record.quote?.symbol ?? null,
    mcapUsd: num(metrics?.marketCapUsd),
    priceUsd: num(metrics?.priceUsd),
    priceQuote: m24.priceQuote,
    mcapQuote: null,
    supply: null,
    holders: num(metrics?.holders),
    change24h: m24.priceChange24hPct,
    volume24h: m24.volume24hUsd,
    liquidityUsd: null,
    curveProgressPct: num(metrics?.curveProgressPct),
    graduated: typeof metrics?.graduated === 'boolean' ? metrics.graduated : null,
    quoteMint: record.quoteMint || record.quote_mint || null,
    poolId: record.poolId || record.pool_id || null,
    creatorWallet: record.creatorWallet || record.creator_wallet || null,
    platformId: record.platformId || record.platform_id || null,
    platformName: null,
    transferFeeBps: num(record.transferFeeBps ?? record.transfer_fee_bps),
    launchedAt: record.createdAt || record.created_at || null,
  };
}

/** The stats the pool alone can give, without a tracker record. Exported for tests. */
export function agentStatsFromPool(pool: LaunchPoolState, quoteUsd: number | null): AgentTokenStats {
  const mcapQuote = pool.priceQuote > 0 && pool.supplyBase > 0 ? pool.priceQuote * pool.supplyBase : null;
  return {
    name: null,
    symbol: null,
    image: null,
    quoteSymbol: agentQuoteSymbol(pool.quoteMint),
    mcapUsd: mcapQuote != null && quoteUsd != null && quoteUsd > 0 ? mcapQuote * quoteUsd : null,
    priceUsd: pool.priceQuote > 0 && quoteUsd != null && quoteUsd > 0 ? pool.priceQuote * quoteUsd : null,
    priceQuote: pool.priceQuote > 0 ? pool.priceQuote : null,
    mcapQuote,
    supply: pool.supplyBase > 0 ? pool.supplyBase : null,
    holders: null,
    change24h: null,
    volume24h: null,
    liquidityUsd: null,
    curveProgressPct: pool.progressPct,
    graduated: pool.graduated,
    quoteMint: pool.quoteMint,
    poolId: pool.poolId,
    creatorWallet: pool.creator,
    platformId: pool.platformId,
    platformName: pool.platformName,
    transferFeeBps: null,
    launchedAt: null,
  };
}

/**
 * The stats stonkfun's API gives: USD figures, the quote it names, the curve
 * status and the identity. No pool is read, so nothing is priced in the
 * quote and the holders stay a chain read. Exported for tests.
 */
export function agentStatsFromStonkfun(token: StonkfunToken): AgentTokenStats {
  const progress = token.graduationProgress;
  return {
    name: token.name || null,
    symbol: token.symbol || null,
    image: token.imageUrl,
    quoteSymbol: token.quote.symbol ?? (token.quote.mint ? agentQuoteSymbol(token.quote.mint) : null),
    mcapUsd: token.market.marketCapUsd,
    priceUsd: token.market.priceUsd,
    priceQuote: null,
    mcapQuote: null,
    supply: null,
    holders: null,
    change24h: token.market.priceChange24h,
    volume24h: token.market.volume24hUsd,
    liquidityUsd: token.market.liquidityUsd,
    curveProgressPct: token.graduated ? 100 : progress != null ? Math.min(100, Math.max(0, progress * 100)) : null,
    graduated: token.graduated,
    quoteMint: token.quote.mint,
    poolId: token.pool,
    creatorWallet: token.creator,
    platformId: null,
    platformName: STONKFUN_NAME,
    transferFeeBps: token.transferFeeBps,
    launchedAt: token.createdAt,
  };
}

/** A tracker record with the live pool laid over it: the chain wins for every live figure. Exported for tests. */
export function mergeAgentStats(record: AgentTokenStats | null, pool: AgentTokenStats | null): AgentTokenStats | null {
  if (!record) return pool;
  if (!pool) return record;
  return {
    ...record,
    priceQuote: pool.priceQuote ?? record.priceQuote,
    mcapQuote: pool.mcapQuote,
    supply: pool.supply,
    mcapUsd: record.mcapUsd ?? pool.mcapUsd,
    priceUsd: record.priceUsd ?? pool.priceUsd,
    curveProgressPct: pool.curveProgressPct ?? record.curveProgressPct,
    graduated: pool.graduated ?? record.graduated,
    poolId: pool.poolId ?? record.poolId,
    creatorWallet: pool.creatorWallet ?? record.creatorWallet,
    platformId: pool.platformId ?? record.platformId,
    platformName: pool.platformName,
    quoteSymbol: record.quoteSymbol ?? pool.quoteSymbol,
  };
}

export interface UseAgentTokenResult {
  /** Where the stats are read from. */
  source: AgentTokenSource;
  /** Null until the pool (or the tracker) has answered. */
  stats: AgentTokenStats | null;
  /** The live pool, for the panel's curve and fee reads. Null until read or when it cannot be. */
  pool: LaunchPoolState | null;
  /** Why the pool could not be read, once the read has given up. */
  poolError: Error | null;
  /** True while neither source has answered yet. */
  isLoading: boolean;
  /** True once the pool read and the tracker have both settled (with or without an answer). */
  isFetched: boolean;
  /** True when the pool cannot be read and no tracker record stands in. */
  isError: boolean;
}

/**
 * Live stats for the $AGENT card: the pool on chain, plus the tracker's record
 * when it has one; or stonkfun's API alone when that is the configured source.
 */
export function useAgentToken(mint: string | null, source: AgentTokenSource = AGENT_SOURCE): UseAgentTokenResult {
  const viaStonkfun = source === 'stonkfun' && isAgentMint(mint);
  // The other source's reads stay off: a null mint disables every query.
  const detail = useLaunchDetail(viaStonkfun ? null : mint);
  const stonkfun = useStonkfunToken(viaStonkfun ? mint : null);
  const record = detail.data;
  // The pool is the record's when the tracker has one; the environment's for the Network token; nothing for any other mint.
  const poolAgent = !viaStonkfun && isAgentMint(mint);
  const quoteMint = record ? (record.quoteMint ?? record.quote_mint ?? null) : poolAgent ? AGENT_QUOTE_MINT : null;
  const poolId = record ? (record.poolId ?? record.pool_id ?? null) : poolAgent ? AGENT_POOL_ID : null;
  const pool = useExternalPoolState({ mint: mint ?? undefined, quoteMint: quoteMint ?? undefined, poolId, enabled: Boolean(mint && quoteMint) });
  const quoteUsd = useQuoteUsd(quoteMint);

  const stats = useMemo(() => {
    if (viaStonkfun) return stonkfun.data ? agentStatsFromStonkfun(stonkfun.data) : null;
    const fromRecord = record ? agentStatsFromLaunch(record) : null;
    const fromPool = pool.data ? agentStatsFromPool(pool.data, quoteUsd.data ?? null) : null;
    return mergeAgentStats(fromRecord, fromPool);
  }, [viaStonkfun, stonkfun.data, record, pool.data, quoteUsd.data]);

  if (viaStonkfun) {
    return {
      source: 'stonkfun',
      stats,
      pool: null,
      poolError: stonkfun.error instanceof Error ? stonkfun.error : null,
      isLoading: stonkfun.isLoading,
      isFetched: stonkfun.isFetched || stonkfun.isError,
      isError: stonkfun.isError && !stonkfun.data,
    };
  }

  const poolSettled = !quoteMint || pool.isFetched || pool.isError;
  return {
    source: 'pool',
    stats,
    pool: pool.data ?? null,
    poolError: pool.error instanceof Error ? pool.error : null,
    isLoading: detail.isLoading || (Boolean(quoteMint) && pool.isLoading),
    isFetched: detail.isFetched && poolSettled,
    isError: pool.isError && !record,
  };
}
