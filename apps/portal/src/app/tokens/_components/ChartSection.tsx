/**
 * The chart card, laid out like the token terminal's chart card: a price
 * readout, the interval chips as a tablist, the 5m / 1h / 6h / 24h delta strip,
 * a price / market cap toggle, then the candles with the volume underneath and
 * a one-line foot. The page's quote / USD denomination and the venue embeds
 * (Dexscreener, Birdeye) stay behind pills on the right.
 *
 * Candles and deltas come from the tracker's indexer for a recorded launch
 * (`candleSource="tracker"`), so they agree with the card's 24h figures; for a
 * pool the tracker never recorded they are built from the RPC tape.
 */

'use client';

import { useState, type KeyboardEvent } from 'react';
import type { TokenTxItem } from '@/lib/api/hooks/use-token-transactions';
import { cn } from '@/lib/utils/cn';
import { DEFAULT_CANDLE_TIMEFRAME } from '../_lib/candles';
import type { Denomination } from '../_lib/detail-format';
import { useChartCandles, type CandleSource } from '../_lib/use-chart-candles';
import { CHART_INTERVALS, DELTA_WINDOWS, formatDelta, stepOption, subZero } from './chart-card';
import { TokenCandleChart } from './TokenCandleChart';
import { TokenChartIframe } from './TokenChartIframe';
import './chart-card.css';

type ChartMode = 'price' | 'mcap';
type ChartSource = 'live' | 'external';

interface ChartSectionProps {
  mint: string;
  poolId: string | null;
  quoteMint: string | null;
  quoteSymbol: string | null;
  quoteUsd: number | null | undefined;
  /** Total supply, so a market cap chart can be drawn. */
  supply: number | null;
  trades: TokenTxItem[];
  tapeLoading: boolean;
  /** The tape's last refresh failed; the candles are the last good ones. */
  tapeReconnecting?: boolean;
  /** Where the candles come from: the tracker's indexer for a recorded launch, else the tape. */
  candleSource?: CandleSource;
  /** The tracker's own 24h change, shown in the strip when it has one. */
  change24hPct?: number | null;
  denomination: Denomination;
  onDenominationChange: (next: Denomination) => void;
  /** True while the pool is open and no trade has printed. */
  poolOpen: boolean;
  /** The token's ticker, for the pair line. */
  tokenSymbol?: string | null;
  /** The holders' transfer fee, in basis points, for the pair line. Null for a token without one. */
  feeBps?: number | null;
  /** Explorer page for the mint. */
  explorerHref?: string | null;
}

interface ChipTabsProps<T extends string> {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
  'data-testid'?: string;
}

/** A row of pills as a tablist: click or arrow keys pick one, focus roves with the selection. */
function ChipTabs<T extends string>({ value, options, onChange, label, className, 'data-testid': testId }: ChipTabsProps<T>) {
  const ids = options.map(o => o.id);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = stepOption(ids, value, e.key === 'ArrowRight' ? 1 : -1);
    onChange(next);
    const tabs = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[ids.indexOf(next)]?.focus();
  };
  return (
    <span className={cn('cc-tfs', className)} role="tablist" aria-label={label} data-testid={testId}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          tabIndex={value === option.id ? 0 : -1}
          className={cn('cc-chip cc-data', value === option.id && 'on')}
          onClick={() => onChange(option.id)}
          onKeyDown={onKeyDown}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

export function ChartSection({
  mint,
  poolId,
  quoteMint,
  quoteSymbol,
  quoteUsd,
  supply,
  trades,
  tapeLoading,
  tapeReconnecting,
  candleSource = 'tape',
  change24hPct = null,
  denomination,
  onDenominationChange,
  poolOpen,
  tokenSymbol,
  feeBps,
  explorerHref,
}: ChartSectionProps) {
  const [timeframe, setTimeframe] = useState<string>(DEFAULT_CANDLE_TIMEFRAME);
  const [mode, setMode] = useState<ChartMode>('price');
  const [source, setSource] = useState<ChartSource>('live');

  const usdRate = denomination === 'usd' && quoteUsd != null && quoteUsd > 0 ? quoteUsd : null;
  const inUsd = usdRate != null;
  const hasSupply = supply != null && supply > 0;
  const scale = (mode === 'mcap' && hasSupply ? supply : 1) * (usdRate ?? 1);
  const mark = inUsd ? '$' : quoteSymbol ? `${quoteSymbol} ` : '';
  const intervalSeconds = CHART_INTERVALS.find(t => t.id === timeframe)?.seconds ?? 900;

  const { candles, isLoading, reconnecting, delta } = useChartCandles({
    mint,
    source: candleSource,
    intervalSeconds,
    scale,
    trades,
    tapeLoading,
    tapeReconnecting,
    change24hPct,
  });

  const last = candles[candles.length - 1];
  const shown = last ? `${mark}${subZero(last.close)}` : '-';
  const fromTracker = candleSource === 'tracker';

  return (
    <section className="cc-chartcard" data-testid="token-chart" data-candle-source={candleSource}>
      <div className="cc-row">
        <span className="cc-price cc-data" data-testid="chart-price">
          {mode === 'mcap' ? 'mcap ' : ''}
          {shown}
        </span>
        <span className="cc-sub" data-testid="chart-pair">
          {tokenSymbol ? `${tokenSymbol} / ${quoteSymbol ?? '-'} · launchlab curve` : ''}
          {feeBps != null ? ` · fee ${(feeBps / 100).toFixed(2)}%` : ''}
        </span>
        {explorerHref && (
          <a
            className="cc-chip cc-data cc-explorer"
            href={explorerHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="chart-explorer"
          >
            explorer ↗
          </a>
        )}
        <span className="cc-row cc-right">
          <ChipTabs
            value={denomination}
            onChange={onDenominationChange}
            label="Denomination"
            options={[
              { id: 'quote', label: quoteSymbol ?? 'quote' },
              { id: 'usd', label: 'USD' },
            ]}
          />
          <ChipTabs
            value={source}
            onChange={setSource}
            label="Chart source"
            className="cc-modes"
            options={[
              { id: 'live', label: 'live' },
              { id: 'external', label: 'external' },
            ]}
          />
        </span>
      </div>

      {source === 'external' ? (
        <div className="cc-embed">
          <TokenChartIframe mint={mint} poolId={poolId} quoteMint={quoteMint} embedded />
        </div>
      ) : (
        <>
          <div className="cc-tvhead">
            <ChipTabs
              value={timeframe}
              onChange={setTimeframe}
              label="candle interval"
              options={CHART_INTERVALS}
              data-testid="chart-intervals"
            />
            <span className="cc-deltas cc-data" aria-label="price change" data-testid="chart-deltas">
              {DELTA_WINDOWS.map(w => {
                const d = delta(w.secs);
                return (
                  <span key={w.label} className="cc-delta" data-testid={`chart-delta-${w.label}`}>
                    <i>{w.label}</i>
                    <b className={d === null ? 'cc-mute' : d >= 0 ? 'cc-up' : 'cc-dn'}>{formatDelta(d)}</b>
                  </span>
                );
              })}
            </span>
            {hasSupply && (
              <ChipTabs
                value={mode}
                onChange={setMode}
                label="price or market cap"
                className="cc-modes cc-right"
                options={[
                  { id: 'price', label: 'price' },
                  { id: 'mcap', label: 'mcap' },
                ]}
              />
            )}
          </div>

          <div className="cc-tvwrap">
            {candles.length > 0 ? (
              <TokenCandleChart candles={candles} interval={timeframe} mark={mark} volumeUnit={quoteSymbol} />
            ) : (
              <div className="cc-chartempty" data-testid="chart-empty">
                <div className="cc-empty">
                  {isLoading ? 'Loading candles…' : poolOpen ? 'No trades in this window yet.' : 'No trades on the tape.'}
                  {!isLoading && (
                    <div className="cc-foot" style={{ marginTop: 6 }}>
                      {poolOpen
                        ? 'The first swap draws the first candle.'
                        : 'Nothing priced in the recent transactions. Try the external chart.'}
                    </div>
                  )}
                  {denomination === 'usd' && !inUsd && !isLoading && (
                    <div className="cc-foot cc-warn" style={{ marginTop: 6 }}>
                      No USD price for {quoteSymbol ?? 'the quote'} yet.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="cc-tvfoot cc-foot cc-data" data-testid="chart-footer">
            <span>
              <span>
                {mode === 'mcap' ? 'mcap ' : ''}
                {shown} · {timeframe} candles · {fromTracker ? 'tracker candles, live tape on the open one' : 'live tape on the open candle'}
              </span>
              {reconnecting && (
                <span className="cc-warn" data-testid="chart-reconnecting">
                  · reconnecting…
                </span>
              )}
              {denomination === 'usd' && !inUsd && candles.length > 0 && (
                <span className="cc-warn">
                  · no USD price for {quoteSymbol ?? 'the quote'} yet · showing {quoteSymbol ?? 'quote'}
                </span>
              )}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
