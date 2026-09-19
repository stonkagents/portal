'use client';

/**
 * The artwork preview, rendered as the card the gallery will show.
 * What you upload is what the Network sees. It is the one raised object on
 * the form, so it carries the only elevation.
 */

import { cn } from '@/lib/utils/cn';
import { mono } from './FieldChrome';

interface TokenPreviewCardProps {
  name: string;
  symbol: string;
  imageDataUrl: string | null;
  quoteSymbol: string;
  className?: string;
}

export function TokenPreviewCard({ name, symbol, imageDataUrl, quoteSymbol, className }: TokenPreviewCardProps) {
  const displayName = name.trim() || 'Your token';
  const displaySymbol = symbol.trim().toUpperCase() || 'TICKER';
  const empty = !name.trim() && !symbol.trim() && !imageDataUrl;

  return (
    <div
      data-testid="token-preview-card"
      className={cn(
        'relative flex items-center gap-4 overflow-hidden rounded-lg border border-border-hover bg-bg-tertiary p-4 shadow-[var(--shadow-md)]',
        className,
      )}
    >
      <div
        className={cn(
          'h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-bg-secondary',
          imageDataUrl ? 'border-border-hover' : 'border-dashed border-border-hover',
        )}
      >
        {imageDataUrl ? (
          <img src={imageDataUrl} alt={`${displayName} artwork`} className="h-full w-full object-cover" />
        ) : (
          <div
            className={cn(
              mono,
              'flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.14em] text-text-tertiary',
            )}
          >
            img
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-base font-semibold leading-6', empty ? 'text-text-tertiary' : 'text-text-primary')}>
          {displayName}
        </p>
        <p className={cn(mono, 'mt-0.5 flex items-center gap-2 text-xs')}>
          <span className={empty ? 'text-text-tertiary' : 'text-text-secondary'}>${displaySymbol}</span>
          <span aria-hidden="true" className="h-3 w-px bg-border-hover" />
          <span className="text-text-tertiary">{quoteSymbol} pair</span>
        </p>
      </div>

      <span
        className={cn(
          mono,
          'flex shrink-0 items-center gap-1.5 rounded-full border border-border-accent px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-accent-green',
        )}
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-green" />
        New
      </span>
    </div>
  );
}
