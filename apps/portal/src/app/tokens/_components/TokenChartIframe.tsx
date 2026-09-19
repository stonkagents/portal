/**
 * Price chart, embedded from a venue that indexes LaunchLab pools.
 *
 * Dexscreener addresses a pair by its pool account, so the LaunchLab pool id is
 * the key while the token is on the curve; the mint is the fallback when the
 * pool is not known yet. Birdeye's widget takes the mint. Either embed can be
 * blank for a pool the venue has not indexed, so the outbound links stay.
 */

'use client';

import { useMemo, useState } from 'react';
import { birdeyeTokenUrl, dexscreenerUrl, raydiumTokenUrl } from '@/lib/launchlab/venues';
import { cn } from '@/lib/utils/cn';
import { CHART_TIMEFRAMES, DEFAULT_CHART_TIMEFRAME, chartEmbedUrl, type ChartProvider } from '../_lib/chart-embed';
import { SectionCard } from './DetailPrimitives';

const CHART_HEIGHT = 420;

const PROVIDERS: readonly { id: ChartProvider; label: string }[] = [
  { id: 'dexscreener', label: 'DexScreener' },
  { id: 'birdeye', label: 'Birdeye' },
];

interface TokenChartIframeProps {
  mint: string;
  poolId?: string | null;
  quoteMint?: string | null;
  /** Render inside another card: controls in a slim row, no card of its own. */
  embedded?: boolean;
}

export function TokenChartIframe({ mint, poolId, embedded }: TokenChartIframeProps) {
  const [provider, setProvider] = useState<ChartProvider>('dexscreener');
  const [timeframe, setTimeframe] = useState<string>(DEFAULT_CHART_TIMEFRAME);
  const pairKey = poolId || mint;

  const widgetUrl = useMemo(() => chartEmbedUrl(provider, pairKey, mint, timeframe), [provider, pairKey, mint, timeframe]);

  const controls = (
        <>
          <div className="flex gap-0.5 rounded-md bg-bg-tertiary p-0.5" role="radiogroup" aria-label="Timeframe">
            {CHART_TIMEFRAMES.map(option => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={timeframe === option.id}
                onClick={() => setTimeframe(option.id)}
                className={cn(
                  'rounded px-1.5 py-0.5 font-mono text-[11px] font-medium transition-colors',
                  timeframe === option.id ? 'bg-bg-secondary text-text-primary' : 'text-text-tertiary hover:text-text-primary',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="hidden gap-1 sm:flex">
            {PROVIDERS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setProvider(option.id)}
                aria-pressed={provider === option.id}
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium transition-colors',
                  provider === option.id ? 'bg-accent-green text-bg-primary' : 'bg-bg-tertiary text-text-tertiary hover:bg-bg-input',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
  );

  const body = (
    <>
      <div className="bg-bg-tertiary" style={{ minHeight: CHART_HEIGHT }}>
        <iframe
          key={widgetUrl}
          src={widgetUrl}
          title="Token chart"
          className="block w-full border-0"
          style={{ height: CHART_HEIGHT }}
          referrerPolicy="no-referrer"
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-1 border-t border-border-default px-4 py-2 text-[11px] text-text-tertiary">
        <span>A new pool can take a while to be indexed. Blank chart? Open it on</span>
        <a href={dexscreenerUrl(pairKey)} target="_blank" rel="noopener noreferrer" className="text-accent-green hover:underline">
          DexScreener
        </a>
        <span>·</span>
        <a href={birdeyeTokenUrl(mint)} target="_blank" rel="noopener noreferrer" className="text-accent-green hover:underline">
          Birdeye
        </a>
        <span>·</span>
        <a href={raydiumTokenUrl(mint)} target="_blank" rel="noopener noreferrer" className="text-accent-green hover:underline">
          Raydium
        </a>
        <span className="ml-auto sm:hidden">
          <button type="button" onClick={() => setProvider(provider === 'dexscreener' ? 'birdeye' : 'dexscreener')} className="underline">
            Switch to {provider === 'dexscreener' ? 'Birdeye' : 'DexScreener'}
          </button>
        </span>
      </p>
    </>
  );

  if (embedded) {
    return (
      <div data-testid="token-chart-external">
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border-default px-4 py-2">{controls}</div>
        {body}
      </div>
    );
  }

  return (
    <SectionCard title="External chart" flush aside={controls} data-testid="token-chart-external">
      {body}
    </SectionCard>
  );
}
