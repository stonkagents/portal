'use client';

/**
 * Token detail page: the stats grid under the header.
 *
 * Price, market cap, 24h volume, trades today, liquidity in the curve,
 * holders, circulating vs total supply, raised vs target, the launch fee paid,
 * holder rewards paid so far, the creator's allocation and the creator fee.
 * Chain first (pool, tape, mint), tracker where the chain has no figure.
 */

import type { LaunchPoolState } from '@/lib/launchlab/pool-state';
import { toDisplayHolders } from '@/lib/token-launch/holder-display';
import { formatQuoteAmount, formatUsd, type GalleryToken } from '../_lib/gallery-token';
import { formatDenominated, formatPercent, formatTokenAmount, usdHint, type Denomination } from '../_lib/detail-format';
import type { TapeStats } from '../_lib/tape-stats';
import type { TokenRevenue } from '../_lib/use-token-chain-data';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';

interface TokenDetailStatsProps {
  token: GalleryToken;
  pool?: LaunchPoolState;
  quoteSymbol: string | null;
  /** USD price of one quote token, when known. */
  quoteUsd?: number | null;
  /** SOL price used to show the launch fee in USD. */
  solUsd?: number | null;
  denomination?: Denomination;
  lastPrice?: number | null;
  tape?: TapeStats;
  /** Holder count from the full list when available. */
  holderCount?: number | null;
  /** Share of supply the creator wallet holds now, 0-100. */
  creatorPct?: number | null;
  revenue?: TokenRevenue | null;
  /** USD in the pool as an external source states it (stonkfun), for a token whose pool is not read here. */
  liquidityUsd?: number | null;
}

/** Market cap: the tracker's figure, else price × supply × quote price off the pool. */
export function marketCapUsd(
  token: GalleryToken,
  pool: LaunchPoolState | undefined,
  quoteUsd: number | null | undefined,
): number | null {
  if (token.marketCapUsd != null) return token.marketCapUsd;
  if (pool && quoteUsd != null && pool.supplyBase > 0 && pool.priceQuote > 0) return pool.priceQuote * pool.supplyBase * quoteUsd;
  return null;
}

/** Quote value sitting in the curve: the quote vault plus the base vault at the current price. */
export function curveLiquidityQuote(pool: LaunchPoolState | undefined): number | null {
  if (!pool) return null;
  return pool.vaultQuoteBalance + pool.vaultBaseBalance * pool.priceQuote;
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  live?: boolean;
  testId?: string;
  title?: string;
}

function Stat({ label, value, hint, live, testId, title }: StatProps) {
  return (
    <div className="border-t border-border-default px-4 py-3" title={title}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
        {live && (
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-green" title="Updating live from the chain" />
        )}
      </p>
      <p className="mt-0.5 truncate font-mono text-base font-semibold text-text-primary" data-testid={testId} title={title ?? value}>
        {value}
      </p>
      {hint && (
        <p className="truncate text-[11px] text-text-tertiary" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function TokenDetailStats({
  token,
  pool,
  quoteSymbol,
  quoteUsd,
  denomination = 'quote',
  tape,
  holderCount,
  creatorPct,
  revenue,
  liquidityUsd = null,
}: TokenDetailStatsProps) {
  const unit = quoteSymbol ?? (token.source === 'legacy' ? 'SOL' : null);
  const raised = pool?.raisedQuote ?? token.quoteRaised;
  const target = pool?.targetQuote ?? token.quoteTarget;
  const holders = holderCount ?? toDisplayHolders(token.holders);
  const liquidity = curveLiquidityQuote(pool);
  const rewardsUsd = revenue?.totalsUsd.holder_distribution ?? null;
  const live = Boolean(pool);
  // The tracker's indexer covers the whole day; the tape only what the RPC listed. Same figure as the home card.
  const indexed = token.metrics24h.volume24hQuote != null ? token.metrics24h : null;
  // A source that prices in USD only (stonkfun) still fills the figure.
  const vol24hUsdOnly = !indexed && !tape && token.metrics24h.volume24hUsd != null ? token.metrics24h.volume24hUsd : null;
  const vol24h = indexed
    ? formatDenominated(indexed.volume24hQuote, denomination, quoteSymbol, quoteUsd)
    : tape
      ? `${tape.truncated ? '≥ ' : ''}${formatDenominated(tape.volume24hQuote, denomination, quoteSymbol, quoteUsd)}`
      : vol24hUsdOnly != null
        ? formatUsd(vol24hUsdOnly)
        : '-';
  const vol24hHint = indexed
    ? indexed.trades24h != null
      ? `${indexed.trades24h} trades${tape && !tape.truncated ? ` · ${tape.buys24h} buys / ${tape.sells24h} sells` : ''}`
      : undefined
    : tape
      ? `${tape.trades24h} trades · ${tape.buys24h} buys / ${tape.sells24h} sells`
      : undefined;
  // A stonk.fun launch carries no transfer tax: nothing flows to holders, so the stat has nothing to say.
  const holderRewards = token.source !== 'external';

  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div
        className={cn(
          /* Four across from 900px: eight cells make two full rows instead of six plus a ragged pair. */
          'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
          !expanded && '[&>*:nth-child(n+5)]:hidden md:[&>*:nth-child(n+5)]:block',
        )}
        data-testid="token-detail-stats"
        data-expanded={expanded}
      >
        <Stat
          label="Vol 24h"
          value={vol24h}
          hint={vol24hHint}
          title={!indexed && tape?.truncated ? 'The tape only reaches part of the last 24 hours; this is a floor.' : undefined}
          testId="token-vol24h"
        />
        <Stat label="Holders" value={holders != null ? holders.toLocaleString() : '-'} testId="token-holders-count" />
        <Stat
          label="Trades today"
          value={tape ? `${tape.truncated ? '≥ ' : ''}${tape.tradesToday}` : '-'}
          hint="since 00:00 UTC"
          testId="token-trades-today"
        />
        <Stat
          label="Liquidity"
          value={
            liquidity != null ? formatDenominated(liquidity, denomination, quoteSymbol, quoteUsd) : liquidityUsd != null ? formatUsd(liquidityUsd) : '-'
          }
          hint={
            pool
              ? `${formatQuoteAmount(pool.vaultQuoteBalance, unit)} + ${formatTokenAmount(pool.vaultBaseBalance)} ${token.symbol} in the curve`
              : undefined
          }
          live={live}
          testId="token-liquidity"
        />
        <Stat
          label="Circulating"
          value={pool ? formatTokenAmount(pool.soldBase) : '-'}
          hint={
            pool && pool.supplyBase > 0
              ? `${formatPercent((pool.soldBase / pool.supplyBase) * 100)} of ${formatTokenAmount(pool.supplyBase)} supply`
              : undefined
          }
          live={live}
          testId="token-circulating"
        />
        <Stat
          label="Raised"
          value={formatQuoteAmount(raised, unit)}
          hint={
            target != null ? `of ${formatQuoteAmount(target, unit)}${usdHint(raised, quoteUsd, u => ` · ${formatUsd(u)}`)}` : undefined
          }
          live={live}
          testId="token-raised"
        />
        {holderRewards && (
          <Stat
            label="Holder rewards"
            value={rewardsUsd != null ? formatUsd(rewardsUsd) : revenue ? 'none yet' : '-'}
            hint={
              revenue?.partial
                ? 'from the latest ledger rows'
                : revenue && rewardsUsd != null
                  ? `${revenue.counts.holder_distribution ?? 0} payouts`
                  : undefined
            }
            testId="token-holder-rewards"
          />
        )}
        <Stat
          label="Creator holds"
          value={creatorPct != null ? formatPercent(creatorPct, 2) : '-'}
          hint="of supply, right now"
          testId="token-creator-allocation"
        />
      </div>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        data-testid="stats-see-more"
        className="flex min-h-[40px] w-full items-center justify-center gap-1 border-t border-border-default text-xs font-semibold text-accent-green md:hidden"
      >
        {expanded ? 'See less' : 'See more'}
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size="sm" />
      </button>
    </>
  );
}
