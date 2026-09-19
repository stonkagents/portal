/**
 * Token detail page: curve progress, or the graduated state.
 *
 * The pool on chain is the source of truth; the tracker's metrics fill in
 * while it loads or when the RPC is unreachable. The graduation target comes
 * from the pool, then the tracker, then the launch config's raise.
 */

import type { LaunchPoolState } from '@/lib/launchlab/pool-state';
import { formatQuoteAmount, formatUsd, type GalleryToken } from '../_lib/gallery-token';
import { formatPercent, timeAgo, usdHint } from '../_lib/detail-format';
import { SectionCard } from './DetailPrimitives';
import { marketCapUsd } from './TokenDetailStats';

interface BondingCurveBlockProps {
  token: GalleryToken;
  pool?: LaunchPoolState;
  quoteSymbol: string | null;
  quoteUsd?: number | null;
  /** Raise the curve graduates at, from the launch config, when the pool has not answered. */
  configTarget?: number | null;
}

export function BondingCurveBlock({ token, pool, quoteSymbol, quoteUsd, configTarget }: BondingCurveBlockProps) {
  const graduated = pool?.graduated ?? token.graduated;
  const raised = pool?.raisedQuote ?? token.quoteRaised;
  const target = pool?.targetQuote ?? token.quoteTarget ?? configTarget ?? null;
  const rawPercent = pool?.progressPct ?? token.curveProgressPct ?? (raised != null && target ? (raised / target) * 100 : 0);
  const percent = Math.min(100, Math.max(0, Number(rawPercent)));
  const barWidth = graduated ? 100 : percent > 0 ? Math.max(percent, 1) : 0;
  const unit = quoteSymbol ?? (token.source === 'legacy' ? 'SOL' : null);
  const mcap = marketCapUsd(token, pool, quoteUsd);
  // No USD price for the quote: the pool still prices the cap in the quote itself.
  const mcapQuote = pool && pool.priceQuote > 0 && pool.supplyBase > 0 ? pool.priceQuote * pool.supplyBase : null;

  return (
    <SectionCard
      title={graduated ? 'Graduated' : 'Bonding curve'}
      aside={
        <span
          className={`font-mono text-sm font-semibold ${graduated ? 'text-accent-blue' : 'text-accent-green'}`}
          data-testid="curve-percent"
        >
          {graduated ? '100%' : formatPercent(percent)}
        </span>
      }
      data-testid="bonding-curve-block"
    >
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className={`h-full rounded-full transition-all duration-[var(--transition-base)] ${graduated ? 'bg-accent-blue' : 'bg-accent-green'}`}
          style={{ width: `${barWidth}%` }}
          role="progressbar"
          aria-valuenow={graduated ? 100 : percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Bonding curve progress"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-text-tertiary">Raised</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-text-primary">{formatQuoteAmount(raised, unit)}</p>
          {usdHint(raised, quoteUsd, formatUsd) && (
            <p className="text-[11px] text-text-tertiary">{usdHint(raised, quoteUsd, formatUsd)}</p>
          )}
        </div>
        <div>
          <p className="text-text-tertiary">Graduation target</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-text-primary">{formatQuoteAmount(target, unit)}</p>
          {usdHint(target, quoteUsd, formatUsd) && (
            <p className="text-[11px] text-text-tertiary">{usdHint(target, quoteUsd, formatUsd)}</p>
          )}
        </div>
        <div>
          <p className="text-text-tertiary">Market cap</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-text-primary" data-testid="curve-mcap">
            {mcap != null ? formatUsd(mcap) : mcapQuote != null ? formatQuoteAmount(mcapQuote, unit) : '-'}
          </p>
        </div>
        <div>
          <p className="text-text-tertiary">Launched</p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-text-primary" title={token.launchedAt}>
            {timeAgo(token.launchedAt)}
          </p>
        </div>
      </div>

      <p className="mt-3 border-t border-border-default pt-3 text-xs leading-5 text-text-tertiary">
        {graduated
          ? 'The curve is complete. Liquidity moved to a Raydium CPMM pool, where the token trades now.'
          : target != null
            ? `Graduates to Raydium CPMM at ${formatQuoteAmount(target, unit)}. The raise becomes locked liquidity.`
            : 'Graduates to Raydium CPMM once the raise is complete. The raise becomes locked liquidity.'}
      </p>
    </SectionCard>
  );
}
