/**
 * Chart embed URLs with a timeframe.
 *
 * The venue helpers in `@/lib/launchlab/venues` build the base embed; this adds
 * the interval each widget understands. Dexscreener takes minutes, Birdeye takes
 * its own labels. The chart frame offers the same six timeframes either way.
 */

import { birdeyeWidgetUrl, dexscreenerEmbedUrl } from '@/lib/launchlab/venues';

export type ChartProvider = 'dexscreener' | 'birdeye';

export interface ChartTimeframe {
  id: string;
  label: string;
  /** Dexscreener `interval`, in minutes. */
  dexscreener: string;
  /** Birdeye `chartInterval`. */
  birdeye: string;
}

export const CHART_TIMEFRAMES: readonly ChartTimeframe[] = [
  { id: '1m', label: '1m', dexscreener: '1', birdeye: '1m' },
  { id: '5m', label: '5m', dexscreener: '5', birdeye: '5m' },
  { id: '15m', label: '15m', dexscreener: '15', birdeye: '15m' },
  { id: '1h', label: '1h', dexscreener: '60', birdeye: '1H' },
  { id: '4h', label: '4h', dexscreener: '240', birdeye: '4H' },
  { id: '1d', label: '1D', dexscreener: '1440', birdeye: '1D' },
];

export const DEFAULT_CHART_TIMEFRAME = '15m';

function withParams(url: string, params: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) parsed.searchParams.set(key, value);
  return parsed.toString();
}

/** The embed URL for a provider, pair and timeframe. Unknown timeframe ids fall back to the default. */
export function chartEmbedUrl(provider: ChartProvider, pairKey: string, mint: string, timeframeId: string): string {
  const timeframe = CHART_TIMEFRAMES.find(t => t.id === timeframeId) ?? CHART_TIMEFRAMES.find(t => t.id === DEFAULT_CHART_TIMEFRAME)!;
  if (provider === 'dexscreener') {
    return withParams(dexscreenerEmbedUrl(pairKey), {
      interval: timeframe.dexscreener,
      trades: '0',
      tabs: '0',
      chartLeftToolbar: '0',
      chartTheme: 'dark',
    });
  }
  return withParams(birdeyeWidgetUrl(mint), { chartInterval: timeframe.birdeye });
}
