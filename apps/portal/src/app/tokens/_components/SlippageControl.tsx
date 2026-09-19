/**
 * Slippage picker for the trade panel: a small button that opens a popover
 * with the preset percentages and a custom field. Values are basis points.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { bpsToPercent } from '@/lib/launchlab/pricing';
import { cn } from '@/lib/utils/cn';

const SLIPPAGE_PRESETS_BPS = [50, 100, 200, 500] as const;
const MIN_SLIPPAGE_BPS = 1;
const MAX_SLIPPAGE_BPS = 5_000;

/** A percent typed by the trader as basis points, or null when it is not usable. */
function parseSlippagePercent(text: string): number | null {
  const pct = Number.parseFloat(text);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  const bps = Math.round(pct * 100);
  return Math.min(MAX_SLIPPAGE_BPS, Math.max(MIN_SLIPPAGE_BPS, bps));
}

interface SlippageControlProps {
  valueBps: number;
  onChange: (bps: number) => void;
  /** Preset percentages, in basis points. Defaults to the curve panel's set. */
  presets?: readonly number[];
}

export function SlippageControl({ valueBps, onChange, presets = SLIPPAGE_PRESETS_BPS }: SlippageControlProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const isPreset = presets.includes(valueBps);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-border-default bg-bg-tertiary px-2 text-[11px] text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
        data-testid="slippage-toggle"
      >
        Slippage <span className="font-mono text-text-primary">{bpsToPercent(valueBps)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Set slippage"
          className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-border-default bg-bg-secondary p-3 shadow-lg"
          data-testid="slippage-popover"
        >
          <p className="mb-2 text-[11px] text-text-tertiary">Max price movement you accept.</p>
          <div className={cn('grid gap-1', presets.length === 3 ? 'grid-cols-3' : 'grid-cols-4')} role="radiogroup" aria-label="Slippage">
            {presets.map(option => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={valueBps === option}
                onClick={() => {
                  onChange(option);
                  setCustom('');
                  setOpen(false);
                }}
                className={cn(
                  'rounded-md border px-1 py-1 font-mono text-[11px] transition-colors',
                  valueBps === option
                    ? 'border-accent-green bg-accent-green/10 text-accent-green'
                    : 'border-border-default text-text-secondary hover:border-border-hover',
                )}
              >
                {bpsToPercent(option)}
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-[11px] text-text-tertiary">
            Custom
            <span className="relative flex-1">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={custom}
                placeholder={isPreset ? '' : (valueBps / 100).toString()}
                onChange={e => {
                  const raw = e.target.value.replace(',', '.');
                  if (!/^\d*\.?\d*$/.test(raw)) return;
                  setCustom(raw);
                  const bps = parseSlippagePercent(raw);
                  if (bps != null) onChange(bps);
                }}
                aria-label="Custom slippage percent"
                className="no-spinner h-7 w-full rounded-md border border-border-default bg-bg-input pl-2 pr-6 font-mono text-xs text-text-primary focus:border-accent-green focus:outline-none"
                data-testid="slippage-custom"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary">%</span>
            </span>
          </label>
          {valueBps >= 1_000 && <p className="mt-2 text-[11px] text-accent-yellow">High slippage. You may get a much worse price.</p>}
        </div>
      )}
    </div>
  );
}
