/**
 * One agent in the Agents grid.
 *
 * Renders from the merged gallery shape only: no per-card chain reads, so a
 * grid of a hundred cards costs the tracker two requests and the RPC none.
 */

import Link from 'next/link';
import { Badge, ProgressBar } from '@/components/ui';
import { toDisplayHolders } from '@/lib/token-launch/holder-display';
import { formatQuoteAmount, formatUsd, truncateAddress, type GalleryToken } from '../_lib/gallery-token';

function progressLabel(pct: number | null): string {
  if (pct == null) return '-';
  const clamped = Math.min(100, Math.max(0, pct));
  return `${clamped % 1 === 0 ? clamped : clamped.toFixed(1)}%`;
}

export function TokenCard({ token }: { token: GalleryToken }) {
  const displayHolders = toDisplayHolders(token.holders);
  const progress = token.graduated ? 100 : Math.min(100, Math.max(0, token.curveProgressPct ?? 0));

  return (
    <Link
      href={`/tokens/${token.mint}`}
      className="block cursor-pointer rounded-lg border border-border-default bg-bg-secondary p-4 transition-all hover:border-accent-green/30 hover:shadow-md"
      data-testid={`token-${token.mint}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {token.imageUrl ? (
            <img
              src={token.imageThumbUrl ?? token.imageUrl}
              alt={token.symbol}
              width={32}
              height={32}
              decoding="async"
              loading="lazy"
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-green/20 text-xs font-bold text-accent-green">
              {token.symbol.slice(0, 2)}
            </div>
          )}
          <div>
            <div className="font-mono text-sm font-bold text-accent-green">{token.symbol}</div>
            <div className="text-xs text-text-secondary">{token.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {token.quoteSymbol && (
            <span
              className="rounded-full border border-border-default px-2 py-0.5 font-mono text-[10px] text-text-tertiary"
              title={token.quoteCategoryLabel ?? undefined}
              data-testid="token-quote"
            >
              / {token.quoteSymbol}
            </span>
          )}
          <Badge variant={token.graduated ? 'seeding' : 'online'} dot>
            {token.graduated ? 'Graduated' : 'On the curve'}
          </Badge>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between font-mono text-[11px] text-text-tertiary">
        {/* A bound agent with a name is the public face of the token; the wallet stays in the tooltip. */}
        {token.peerDisplayName ? (
          <span className="truncate font-sans" title={`Agent ${token.peerDisplayName}, creator ${token.creator}`} data-testid="token-by-agent">
            by {token.peerDisplayName}
          </span>
        ) : (
          <span>by {truncateAddress(token.creator)}</span>
        )}
        <span data-testid={`token-${token.mint}-contract`}>{truncateAddress(token.mint)}</span>
      </div>

      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-text-tertiary">
          <span>Curve</span>
          <span>{progressLabel(token.graduated ? 100 : token.curveProgressPct)}</span>
        </div>
        <ProgressBar value={progress} color="green" />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-text-tertiary">Market cap</div>
          <div className="font-mono font-semibold text-text-primary">{formatUsd(token.marketCapUsd)}</div>
        </div>
        <div>
          <div className="text-text-tertiary">Holders</div>
          <div className="font-mono font-semibold text-text-primary">
            {displayHolders != null ? displayHolders.toLocaleString() : '-'}
          </div>
        </div>
        {token.quoteRaised != null && (
          <div className="col-span-2">
            <div className="text-text-tertiary">Raised</div>
            <div className="font-mono font-semibold text-text-primary">
              {formatQuoteAmount(token.quoteRaised, token.quoteSymbol ?? (token.source === 'legacy' ? 'SOL' : null))}
              {token.quoteTarget != null && (
                <span className="text-text-tertiary"> / {formatQuoteAmount(token.quoteTarget, token.quoteSymbol)}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
