/**
 * Story: Home token card
 * Purpose: The launched token on the home page. Identity and quote come from the
 *          tracker's `GET /api/launch/{mint}`; the numbers come from the tracker's
 *          metrics for that recorded launch. Both links go to /tokens/<mint>.
 */
'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { ClawMascot } from '@/components/brand/ClawMascot';
import { toDisplayHolders } from '@/lib/token-launch/holder-display';
import type { LaunchRecord } from '@/lib/api/launches';
import type { TokenMetricsResponse } from '@/lib/types/backend';

/** Round to at most `maxDecimals` and trim trailing zeros so small prices do not overflow. */
function formatDecimal(value: number, maxDecimals = 5): string {
  return value.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

function formatMarketCap(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${formatDecimal(value)}`;
}

function formatPercent(value: number): string {
  return `${String(Math.round(value * 10) / 10)}%`;
}

/** Curve state pill. Nothing is shown while `complete` is unknown. */
function CurveStatusBadge({ complete }: { complete: boolean | null | undefined }) {
  if (complete === true) {
    return (
      <span
        className="text-[11px] text-accent-blue font-bold bg-accent-blue/10 border border-accent-blue/25 rounded-full px-2 py-0.5 inline-flex items-center gap-1 whitespace-nowrap"
        data-testid="badge-migrated"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
        Migrated
      </span>
    );
  }
  if (complete === false) {
    return (
      <span
        className="text-[11px] text-accent-green font-bold bg-accent-green/10 border border-accent-green/25 rounded-full px-2 py-0.5 inline-flex items-center gap-1 whitespace-nowrap"
        data-testid="badge-bonding"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
        Bonding
      </span>
    );
  }
  return null;
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-2" data-testid="token-performance-skeleton">
      <div className="h-4 w-24 bg-bg-tertiary rounded" />
      <div className="h-2 w-full bg-bg-tertiary rounded" />
      <div className="flex gap-4">
        <div className="h-3 w-16 bg-bg-tertiary rounded" />
        <div className="h-3 w-16 bg-bg-tertiary rounded" />
      </div>
    </div>
  );
}

interface TokenPerformanceCardProps {
  /** Mint of the launched token. The card renders nothing without one. */
  mint: string | null;
  /** Tracker record for the mint, from `useLaunchDetail`. */
  launch: LaunchRecord | null;
  /** Live numbers for the same mint. */
  metrics?: TokenMetricsResponse;
  isLoading: boolean;
  /** The tracker could not be reached: identity from what we remember, no numbers. */
  unreachable?: boolean;
  /** Symbol of the quote asset the token trades against, e.g. STONK. */
  quoteSymbol?: string | null;
  /** Shown until the tracker answers — what the launch flow already knows. */
  fallbackName?: string;
  fallbackSymbol?: string;
  fallbackImageUrl?: string;
}

export function TokenPerformanceCard({
  mint,
  launch,
  metrics,
  isLoading,
  unreachable = false,
  quoteSymbol,
  fallbackName,
  fallbackSymbol,
  fallbackImageUrl,
}: TokenPerformanceCardProps) {
  if (!mint) return null;

  const symbol = launch?.symbol || fallbackSymbol || '';
  const name = launch?.name || fallbackName || '';
  // The 36 px tile shows the pinned thumb when the launch has one; the master is the fallback.
  const imageUrl = launch?.imageThumbUrl || launch?.image_thumb_url || launch?.image_url || launch?.imageUrl || fallbackImageUrl || '';
  const detailHref = `/tokens/${mint}`;
  const showSkeleton = isLoading && !launch && !metrics;
  const displayHolders = toDisplayHolders(metrics?.holders);

  return (
    <div className="rounded-lg border border-border-default bg-bg-tertiary p-4" data-testid="token-performance-card">
      {/* Identity */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-md bg-bg-secondary border border-border-default flex items-center justify-center overflow-hidden shrink-0">
          {imageUrl ? (
            <img src={imageUrl} alt="" width={36} height={36} decoding="async" className="w-full h-full object-cover" />
          ) : (
            <ClawMascot variant="online" className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base font-bold text-accent-green truncate" data-testid="perf-symbol">
              {symbol ? `$${symbol}` : '-'}
            </span>
            {quoteSymbol && (
              <span
                className="text-[11px] font-semibold text-text-secondary border border-border-default rounded-full px-2 py-0.5 whitespace-nowrap"
                data-testid="perf-quote"
              >
                / {quoteSymbol}
              </span>
            )}
            <CurveStatusBadge complete={metrics?.complete} />
          </div>
          {name && <div className="text-xs text-text-secondary truncate">{name}</div>}
        </div>
      </div>

      {unreachable ? (
        <div
          className="mb-3 flex items-start gap-2 rounded-md border border-accent-yellow/20 bg-accent-yellow/8 px-3 py-2 text-xs text-text-secondary"
          data-testid="perf-unreachable"
        >
          <Icon name="alert-triangle" size="sm" className="text-accent-yellow shrink-0 mt-0.5" />
          <span>
            <span className="text-accent-yellow font-semibold">Could not reach the tracker.</span> Market cap, curve and holders will
            show once it answers.
          </span>
        </div>
      ) : showSkeleton ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* Market cap */}
          <div className="mb-3" data-testid="perf-market-cap">
            <span className="text-lg font-bold text-accent-green">
              {metrics?.marketCapUsd != null ? formatMarketCap(metrics.marketCapUsd) : '-'}
            </span>
            <span className="text-xs text-text-tertiary ml-1">market cap</span>
          </div>

          {/* Curve progress */}
          <div className="mb-3" data-testid="perf-bonding-bar">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-secondary">Curve progress</span>
              <span className="text-xs text-accent-green font-semibold">
                {metrics?.bondingCurvePercent != null ? formatPercent(metrics.bondingCurvePercent) : '-'}
              </span>
            </div>
            <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-green rounded-full transition-[width] duration-500"
                style={{ width: `${metrics?.bondingCurvePercent ?? 0}%` }}
              />
            </div>
          </div>

          {/* Price + holders */}
          <div className="flex gap-4 text-xs mb-3">
            <div data-testid="perf-price">
              <span className="text-text-tertiary">Price </span>
              <span className="text-text-primary font-semibold">
                {metrics?.priceUsd != null ? `$${formatDecimal(metrics.priceUsd)}` : '-'}
              </span>
            </div>
            <div data-testid="perf-holders">
              <span className="text-text-tertiary">Holders </span>
              <span className="text-text-primary font-semibold">{displayHolders != null ? String(displayHolders) : '-'}</span>
            </div>
          </div>
        </>
      )}

      {/* Both links land on the in-app detail page */}
      <div className="grid grid-cols-2 gap-1.5">
        <Link
          href={detailHref}
          data-testid="perf-details"
          className="flex items-center justify-center gap-1 py-1.5 rounded-[5px] border border-border-default text-text-secondary text-[11px] font-semibold hover:border-accent-green hover:text-accent-green transition-colors min-h-[44px] no-underline"
        >
          <Icon name="activity" size="sm" /> View details
        </Link>
        <Link
          href={detailHref}
          data-testid="perf-trade"
          className="flex items-center justify-center gap-1 py-1.5 rounded-[5px] border border-accent-green bg-accent-green/15 text-accent-green text-[11px] font-semibold hover:bg-accent-green/25 transition-colors min-h-[44px] no-underline"
        >
          <Icon name="trending-up" size="sm" /> Trade
        </Link>
      </div>
    </div>
  );
}
