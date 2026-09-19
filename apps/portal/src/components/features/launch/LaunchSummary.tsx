'use client';

/**
 * The live summary, and the button that signs.
 *
 * A receipt: label/value rows on hairlines, the fee split as three arrow rows,
 * the launch cost as the total, two footnotes, one button. Every number
 * re-renders as the form changes and flashes once so the change is noticed.
 * One panel serves both layouts: a sticky card beside the form on a wide
 * screen, and on a phone a bottom sheet showing the cost and the button, which
 * opens into the full breakdown. The figures are the tracker's: the raise it
 * sized, the fee it priced, the curve it will put on chain. The fee wording is
 * shared with the token page through `src/app/tokens/_lib/fees.ts`.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { config } from '@/config';
import type { LaunchQuote } from '@/lib/launchlab/launch-config';
import { bpsToPercent, type LaunchSummary as Summary } from '@/lib/launchlab/pricing';
import type { FeeSplit } from '@/app/tokens/_lib/fees';
import { mono } from './FieldChrome';

interface LaunchSummaryProps {
  summary: Summary;
  quote: LaunchQuote;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** True while the tracker is still pricing the launch. */
  pricing?: boolean;
  /** True when the SOL price behind the fee is older than the tracker allows. */
  feeStale?: boolean;
  note?: string | null;
  /** Rendered under the button, e.g. the wallet's own error with a link in it. */
  extra?: ReactNode;
}

const num = (value: number, digits = 2): string =>
  Number.isFinite(value) && value > 0 ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '-';

const slug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Whole tokens as a short figure: 1,000,000,000 -> "1 billion". */
function supplyLabel(supply: number): string {
  if (supply >= 1e9 && supply % 1e9 === 0) return `${supply / 1e9} billion`;
  if (supply >= 1e6 && supply % 1e6 === 0) return `${supply / 1e6} million`;
  return num(supply, 0);
}

/** The summary's fee figures in the shape the shared fee strings expect. */
function toFeeSplit(fees: Summary['fees']): FeeSplit {
  return {
    holderTaxBps: fees.holderBps,
    platformBps: fees.platformBps,
    protocolBps: fees.protocolBps,
    creatorBps: fees.creatorBps,
    totalBps: fees.totalTradeBps,
  };
}

interface RowProps {
  label: string;
  value: string;
  /** A line of the fee split: indented, with the arrow drawn in the margin. */
  sub?: boolean;
  /** The total line: heavier rule above, larger figure. */
  total?: boolean;
}

/** Flashes the value for a moment whenever it changes. */
function Row({ label, value, sub, total }: RowProps) {
  const previous = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(timer);
  }, [value]);

  const arrow = sub && label.startsWith('→');
  const text = arrow ? label.slice(1).trim() : label;

  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4',
        total ? 'mt-1 border-t border-border-hover pt-3 pb-1' : 'py-2',
        sub && 'pl-4',
      )}
    >
      <span
        className={cn('flex min-w-0 items-baseline gap-2 text-xs', total ? 'font-medium text-text-primary' : 'text-text-secondary')}
      >
        {arrow && (
          <span aria-hidden="true" className={cn(mono, 'text-text-tertiary')}>
            →
          </span>
        )}
        <span className="truncate">{text}</span>
      </span>
      <span
        data-testid={`summary-${slug(label)}`}
        data-flash={flash ? 'on' : 'off'}
        className={cn(
          mono,
          'shrink-0 text-right transition-colors duration-[250ms]',
          total ? 'text-base font-semibold' : 'text-xs',
          flash ? 'text-accent-green' : 'text-text-primary',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      className={cn('shrink-0 text-text-tertiary transition-transform duration-[250ms]', open ? 'rotate-0' : 'rotate-180')}
    >
      <path d="m5 12 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LaunchSummary({
  summary,
  quote,
  actionLabel,
  onAction,
  disabled,
  busy,
  pricing,
  feeStale,
  note,
  extra,
}: LaunchSummaryProps) {
  // Collapsed on a phone, where the panel is the bottom sheet; open beside the
  // form. The wizard only mounts on the client, so the first render can ask.
  const wide = () => (typeof window === 'undefined' ? true : (window.matchMedia?.('(min-width: 1024px)')?.matches ?? true));
  const [open, setOpen] = useState(wide);

  useEffect(() => {
    setOpen(wide());
  }, []);

  const cost = `${summary.launchCost.totalSol.toFixed(3)} SOL`;
  const split = toFeeSplit(summary.fees);

  return (
    <aside
      data-testid="launch-summary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-20 rounded-t-lg border-t border-border-hover bg-bg-nav px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 backdrop-blur-[10px]',
        'lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-0 lg:self-start lg:rounded-lg lg:border lg:border-border-default lg:bg-bg-primary lg:p-5 lg:shadow-[var(--shadow-sm)]',
      )}
    >
      <details open={open} onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="group">
        <summary
          className={cn(
            'flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md -mx-1 px-1 [&::-webkit-details-marker]:hidden',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
            'lg:min-h-0 lg:cursor-default lg:pb-3 lg:border-b lg:border-border-default',
          )}
        >
          <span className="flex flex-col gap-0.5">
            <span className={cn(mono, 'text-[11px] uppercase tracking-[0.14em] text-text-tertiary')}>Launch summary</span>
            <span className={cn('text-[11px] text-text-tertiary lg:hidden')}>
              {open ? 'Hide the breakdown' : 'Tap for the breakdown'}
            </span>
          </span>
          <span className="flex items-center gap-3">
            <span className={cn(mono, 'text-sm font-semibold text-text-primary lg:hidden')}>≈ {cost}</span>
            <span className="lg:hidden">
              <Chevron open={open} />
            </span>
          </span>
        </summary>

        <div aria-busy={pricing ? 'true' : undefined}>
          <div className="max-h-[38vh] divide-y divide-border-default overflow-y-auto overscroll-contain pt-1 lg:max-h-none lg:overflow-visible">
            <Row label="Launchpad" value="Raydium LaunchLab" />
            <Row label="Paired with" value={`$${quote.symbol}`} />
            <Row label="Graduates at" value={pricing ? 'Pricing…' : `${num(summary.graduationQuote)} $${quote.symbol}`} />
            <Row label="Supply" value={supplyLabel(summary.supply)} />
            {/* The trading fee is what the pool takes on a swap (platform + Raydium); the transfer tax
                is the mint's own fee on every transfer, paid to holders, so it is shown as its own row. */}
            <Row label="Trading fee" value={bpsToPercent(split.platformBps + split.protocolBps + split.creatorBps)} />
            <Row label="Transfer tax → holders" value={bpsToPercent(split.holderTaxBps)} />
            {summary.devBuy.quoteAmount > 0 && (
              <Row
                label="Dev buy"
                value={`${num(summary.devBuy.quoteAmount)} ${quote.symbol} · ${summary.devBuy.percentOfSupply.toFixed(1)}%`}
              />
            )}
          </div>
          <Row label="Launch cost" value={feeStale ? `≈ ${cost} (est.)` : `≈ ${cost}`} total />

          <ul className="mt-3 flex flex-col gap-1 border-t border-dashed border-border-default pt-3 text-[11px] leading-4 text-text-tertiary">
            <li className="flex gap-2">
              <span aria-hidden="true" className={cn(mono, 'shrink-0 text-border-hover')}>
                01
              </span>
              Liquidity is permanently locked at graduation.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className={cn(mono, 'shrink-0 text-border-hover')}>
                02
              </span>
              Image and metadata are stored permanently on IPFS.
            </li>
          </ul>
        </div>
      </details>

      {note && (
        <p
          className="mt-3 rounded-md border border-accent-red/40 px-3 py-2 text-xs text-accent-red"
          role="alert"
          data-testid="launch-error"
        >
          {note}
        </p>
      )}

      <Button
        className={cn(
          'mt-3 h-12 w-full text-sm font-semibold tracking-[0.01em] shadow-[var(--shadow-md)]',
          'active:translate-y-px motion-safe:transition-transform',
        )}
        onClick={onAction}
        disabled={disabled}
        loading={busy}
        data-testid="launch-action"
      >
        {actionLabel}
      </Button>
      {extra && (
        <p className="mt-2 text-center text-xs leading-4" role="status" data-testid="launch-action-note">
          {extra}
        </p>
      )}
      {config.cluster === 'devnet' && (
        <p className="mt-2 text-center text-xs leading-4 text-accent-yellow" data-testid="launch-devnet-note">
          Devnet test site: Phantom must have Testnet Mode on (Settings, Developer Settings) with Solana Devnet selected, or signing
          fails after you confirm.
        </p>
      )}
    </aside>
  );
}
