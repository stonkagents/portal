/**
 * Purpose: Curated Packs: scroll cards for the tracker's pack catalog (GET /api/packs).
 *          A card expands to list the pack's items; the catalog carries no install counts or
 *          sizes, so none are shown. Dimmed when a type filter is active.
 */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import type { TransformedPack } from '@/lib/api/transformers/gallery';
import { assetTypeLabel } from '@/lib/utils/asset-type-label';

interface CuratedPacksProps {
  packs: TransformedPack[];
  activeFilter?: string;
  /** The first catalog answer is still in flight. */
  loading?: boolean;
  /** The catalog could not be read. */
  error?: boolean;
  className?: string;
}

const colorMap: Record<TransformedPack['color'], { bg: string; text: string }> = {
  green: { bg: 'bg-accent-green/12', text: 'text-accent-green' },
  blue: { bg: 'bg-accent-blue/12', text: 'text-accent-blue' },
  purple: { bg: 'bg-accent-purple/12', text: 'text-accent-purple' },
  red: { bg: 'bg-accent-red/12', text: 'text-accent-red' },
};

const cardClass = 'rounded-lg border border-border-default bg-bg-primary p-3 flex-[0_0_260px] snap-start md:flex-[0_0_auto]';

export function CuratedPacks({ packs, activeFilter, loading = false, error = false, className }: CuratedPacksProps) {
  const isFiltered = !!activeFilter && activeFilter !== 'All';
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className={className} data-testid="curated-packs">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-accent-green flex items-center gap-2">
          <Icon name="package" size="sm" /> Curated Packs
        </span>
      </div>

      {/* Scroll container: horizontal on mobile, vertical on desktop */}
      <div
        className={cn(
          'flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2',
          'md:flex-col md:overflow-x-visible md:overflow-y-auto md:max-h-[360px] md:snap-y md:pb-0',
          'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border-default',
        )}
      >
        {loading &&
          [1, 2, 3].map(i => (
            <div key={i} className={cn(cardClass, 'h-[92px] animate-pulse')} data-testid="pack-skeleton">
              <span className="sr-only">Loading packs</span>
            </div>
          ))}

        {!loading && error && (
          <p className="text-xs text-text-tertiary py-4" data-testid="packs-error">
            The pack catalog could not be loaded.
          </p>
        )}

        {!loading && !error && packs.length === 0 && (
          <p className="text-xs text-text-tertiary py-4" data-testid="packs-empty">
            No curated packs yet.
          </p>
        )}

        {!loading &&
          !error &&
          packs.map(pack => {
            const colors = colorMap[pack.color];
            const open = openId === pack.id;
            return (
              <div
                key={pack.id}
                className={cn(cardClass, 'flex flex-col gap-2', 'transition-colors hover:border-accent-green/30', isFiltered && 'opacity-40')}
                data-testid={`pack-${pack.id}`}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : pack.id)}
                  aria-expanded={open}
                  aria-controls={`pack-items-${pack.id}`}
                  data-testid={`pack-toggle-${pack.id}`}
                  className="flex gap-3 items-start w-full text-left bg-transparent border-none p-0 cursor-pointer font-[inherit] text-[inherit]"
                >
                  {/* Icon */}
                  <div className={cn('w-9 h-9 rounded flex items-center justify-center shrink-0', colors.bg, colors.text)}>
                    <Icon name={pack.icon as IconName} size="sm" />
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-text-primary mb-0.5">{pack.title}</div>
                    <div className={cn('text-xs text-text-secondary mb-2', !open && 'line-clamp-2')}>{pack.description}</div>
                    <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
                      <span>{pack.assets} items</span>
                      <Icon name="chevron-down" size="sm" className={cn('w-3 h-3 transition-transform', open && 'rotate-180')} />
                    </div>
                  </div>
                </button>

                {open && (
                  <ul id={`pack-items-${pack.id}`} className="list-none m-0 p-0 flex flex-col gap-1.5 border-t border-border-default pt-2" data-testid={`pack-items-${pack.id}`}>
                    {pack.items.map(item => (
                      <li key={item.filename} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 px-1.5 py-0.5 rounded border border-border-default text-[10px] font-mono text-text-tertiary">
                          {assetTypeLabel(`.${item.type}`)}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-text-primary">{item.title}</span>
                          <span className="block text-text-secondary">{item.description}</span>
                        </span>
                      </li>
                    ))}
                    {pack.items.length === 0 && <li className="text-xs text-text-tertiary">No items listed.</li>}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
