'use client';

/**
 * The creator's first buy, bundled into the launch transaction.
 *
 * Two ways to say the same thing: a share of supply, or an amount of the quote
 * asset. Both readouts stay on screen, with what the buy does to the price.
 * The block reads as one instrument: a track with its filled portion, a typed
 * figure with thumb-sized steppers, and three readouts in a row.
 */

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import type { DevBuyEstimate } from '@/lib/launchlab/pricing';
import { MAX_DEV_BUY_PERCENT } from './form-schema';
import { SectionLabel, mono } from './FieldChrome';

interface DevBuySliderProps {
  mode: 'percent' | 'amount';
  percent: number;
  quoteAmount: number;
  /** Symbol of the quote asset, for labels. */
  quoteSymbol: string;
  estimate: DevBuyEstimate;
  onModeChange: (mode: 'percent' | 'amount') => void;
  onPercentChange: (percent: number) => void;
  onQuoteAmountChange: (amount: number) => void;
}

interface NumberStepperProps {
  value: number;
  min: number;
  max?: number;
  step: number;
  suffix: string;
  ariaLabel: string;
  testId: string;
  onChange: (value: number) => void;
  wide?: boolean;
}

const focusRing = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-green';

/**
 * A number field with its own minus and plus, sized for thumbs. The browser's
 * spinner arrows are hidden: they are tiny, look different in every browser and
 * do not exist on phones.
 */
/** Digits with at most one decimal point, possibly still being typed ("", "0.", "12.5"). */
const PARTIAL_DECIMAL = /^\d*\.?\d*$/;

function NumberStepper({ value, min, max, step, suffix, ariaLabel, testId, onChange, wide }: NumberStepperProps) {
  const clamp = (next: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, next));
  const decimals = step < 1 ? (String(step).split('.')[1]?.length ?? 0) : 0;
  const nudge = (dir: -1 | 1) => onChange(Number(clamp(value + dir * step).toFixed(decimals)));
  // What is in the field while typing: "0." must survive until the next digit lands,
  // so the text is local and the number only follows it once it parses.
  const [text, setText] = useState(value === 0 ? '' : String(value));
  const lastValue = useRef(value);
  if (lastValue.current !== value) {
    lastValue.current = value;
    if (Number(text || '0') !== value) setText(value === 0 ? '' : String(value));
  }
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  const btn = cn(
    'flex h-full w-11 shrink-0 items-center justify-center text-text-secondary',
    'transition-colors duration-150 hover:bg-bg-tertiary hover:text-text-primary active:scale-95 motion-safe:transition-transform',
    'disabled:pointer-events-none disabled:opacity-30',
    focusRing,
  );
  const glyph = 'h-3.5 w-3.5';
  return (
    <div
      className={cn(
        'flex h-11 items-stretch overflow-hidden rounded-md border border-border-default bg-bg-input',
        'transition-colors duration-150 hover:border-border-hover focus-within:border-accent-green focus-within:ring-2 focus-within:ring-accent-green/50',
        wide ? 'w-full' : 'w-[10.5rem] shrink-0',
      )}
    >
      <button
        type="button"
        className={cn(btn, 'border-r border-border-default')}
        onClick={() => nudge(-1)}
        disabled={atMin}
        aria-label={`${ariaLabel}, less`}
        data-testid={`${testId}-minus`}
      >
        <svg viewBox="0 0 16 16" className={glyph} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 8h10" strokeLinecap="round" />
        </svg>
      </button>
      <div className="flex min-w-0 flex-1 items-center">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder="0"
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          data-testid={testId}
          onChange={e => {
            const raw = e.target.value.replace(',', '.');
            if (!PARTIAL_DECIMAL.test(raw)) return;
            setText(raw);
            if (raw === '' || raw === '.') {
              onChange(min);
              return;
            }
            if (raw.endsWith('.')) return;
            onChange(clamp(Number(raw)));
          }}
          onBlur={() => setText(value === 0 ? '' : String(value))}
          className={cn(
            mono,
            'no-spinner h-full min-w-0 flex-1 bg-transparent px-2 text-right text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none',
          )}
        />
        <span className={cn(mono, 'shrink-0 pr-3 text-xs text-text-tertiary')}>{suffix}</span>
      </div>
      <button
        type="button"
        className={cn(btn, 'border-l border-border-default')}
        onClick={() => nudge(1)}
        disabled={atMax}
        aria-label={`${ariaLabel}, more`}
        data-testid={`${testId}-plus`}
      >
        <svg viewBox="0 0 16 16" className={glyph} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 8h10M8 3v10" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

const compact = (value: number): string =>
  Number.isFinite(value) && value > 0 ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';

const thumb =
  '[&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg-primary [&::-webkit-slider-thumb]:bg-accent-green [&::-webkit-slider-thumb]:shadow-[var(--shadow-glow)] ' +
  '[&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-bg-primary [&::-moz-range-thumb]:bg-accent-green ' +
  '[&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-accent-green/50 [&:focus-visible::-webkit-slider-thumb]:ring-offset-2 [&:focus-visible::-webkit-slider-thumb]:ring-offset-bg-tertiary ' +
  '[&:focus-visible::-moz-range-thumb]:ring-2 [&:focus-visible::-moz-range-thumb]:ring-accent-green/50';

function Readout({
  label,
  value,
  tone = 'default',
  testId,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'warn';
  testId?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-3 py-2.5 first:pl-0 last:pr-0">
      <p className={cn(mono, 'text-[10px] uppercase tracking-[0.12em] text-text-tertiary')}>{label}</p>
      <p className={cn(mono, 'truncate text-sm', tone === 'warn' ? 'text-accent-yellow' : 'text-text-primary')} data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

export function DevBuySlider({
  mode,
  percent,
  quoteAmount,
  quoteSymbol,
  estimate,
  onModeChange,
  onPercentChange,
  onQuoteAmountChange,
}: DevBuySliderProps) {
  const active = estimate.quoteAmount > 0;
  const fill = Math.min(100, Math.max(0, (percent / MAX_DEV_BUY_PERCENT) * 100));

  return (
    <section className="flex flex-col gap-4" data-testid="dev-buy" aria-label="Dev buy">
      <SectionLabel
        index="02"
        trailing={
          <div
            role="group"
            aria-label="Dev buy unit"
            className="flex h-8 overflow-hidden rounded-md border border-border-default bg-bg-input p-0.5"
          >
            {(['percent', 'amount'] as const).map(option => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => onModeChange(option)}
                className={cn(
                  mono,
                  'rounded-sm px-2.5 text-[11px] transition-colors duration-150',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-green',
                  mode === option ? 'bg-accent-green font-semibold text-black' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                {option === 'percent' ? '% supply' : quoteSymbol}
              </button>
            ))}
          </div>
        }
      >
        Dev buy
      </SectionLabel>

      <div className="rounded-lg border border-border-default bg-bg-secondary p-4">
        {mode === 'percent' ? (
          <div className="flex items-center gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="relative flex h-5 items-center">
                <div className="absolute inset-x-0 h-1 rounded-full bg-bg-tertiary" aria-hidden="true" />
                <div
                  className="absolute left-0 h-1 origin-left rounded-full bg-accent-green transition-transform duration-150 ease-out"
                  style={{ width: '100%', transform: `scaleX(${fill / 100})` }}
                  aria-hidden="true"
                />
                <input
                  type="range"
                  min={0}
                  max={MAX_DEV_BUY_PERCENT}
                  step={0.5}
                  value={percent}
                  aria-label="Dev buy, percent of supply"
                  data-testid="dev-buy-slider"
                  onChange={e => onPercentChange(Number(e.target.value))}
                  className={cn('relative h-5 w-full cursor-pointer appearance-none bg-transparent focus:outline-none', thumb)}
                />
              </div>
              <div className={cn(mono, 'flex justify-between text-[10px] text-text-tertiary')} aria-hidden="true">
                <span>0%</span>
                <span>{MAX_DEV_BUY_PERCENT / 2}%</span>
                <span>{MAX_DEV_BUY_PERCENT}%</span>
              </div>
            </div>
            <NumberStepper
              value={percent}
              min={0}
              max={MAX_DEV_BUY_PERCENT}
              step={0.5}
              suffix="%"
              ariaLabel="Dev buy, percent of supply, typed"
              testId="dev-buy-percent"
              onChange={onPercentChange}
            />
          </div>
        ) : (
          <NumberStepper
            value={quoteAmount}
            min={0}
            step={0.05}
            suffix={quoteSymbol}
            ariaLabel={`Dev buy, amount in ${quoteSymbol}`}
            testId="dev-buy-amount"
            onChange={onQuoteAmountChange}
            wide
          />
        )}

        <div className="mt-4 grid grid-cols-3 divide-x divide-border-default border-t border-border-default pt-1">
          <Readout label="Costs" value={`${compact(estimate.quoteAmount)} ${quoteSymbol}`} testId="dev-buy-cost" />
          <Readout label="You get" value={compact(estimate.tokensReceived)} testId="dev-buy-tokens" />
          <Readout
            label="Price impact"
            value={estimate.priceImpactPct > 0 ? `+${estimate.priceImpactPct.toFixed(1)}%` : '0%'}
            tone={active ? 'warn' : 'default'}
          />
        </div>
      </div>
    </section>
  );
}
