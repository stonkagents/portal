/**
 * Pieces the network-token blocks share: an explorer link with a full tap
 * target, a labelled figure in tabular mono, the mono eyebrow and tag, and
 * the number and date formats.
 */

'use client';

import type { ReactNode } from 'react';
import { explorerUrl } from '@/config';
import { cn } from '@/lib/utils/cn';

/** "Solscan ↗" with a 44px target. */
export function SolscanLink({
  kind,
  id,
  label = 'Solscan',
  className,
}: {
  kind: 'tx' | 'address' | 'token';
  id: string;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={explorerUrl(kind, id)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        '-mx-2 inline-flex min-h-[44px] shrink-0 items-center gap-1 px-2 font-mono text-[11px] text-text-tertiary no-underline transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
        className,
      )}
      title={id}
    >
      {label} <span aria-hidden="true">↗</span>
    </a>
  );
}

/** A small labelled figure: label above, mono value below. */
export function Figure({
  label,
  value,
  hint,
  tone = 'neutral',
  testId,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'live';
  testId?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[11px] uppercase tracking-wide text-text-tertiary">{label}</p>
      <p
        className={cn(
          'mt-0.5 truncate font-mono text-sm font-semibold tabular-nums',
          tone === 'live' ? 'text-accent-green' : 'text-text-primary',
        )}
        data-testid={testId}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </p>
      {hint && (
        <p className="truncate text-[11px] text-text-tertiary" title={typeof hint === 'string' ? hint : undefined}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** A mono eyebrow label: the only kind of label the panel uses. */
export function Eyebrow({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <p className={cn('font-mono text-[10px] uppercase tracking-[0.12em] text-text-tertiary', className)} data-testid={testId}>
      {children}
    </p>
  );
}

const tagTones = {
  neutral: 'border-border-default bg-bg-tertiary text-text-secondary',
  live: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
  down: 'border-accent-red/30 bg-accent-red/10 text-accent-red',
} as const;

/** A mono tag for a state ("no burns yet", "schedule", "locks in 124d"), never a sentence. */
export function MonoTag({
  children,
  tone = 'neutral',
  wrap = false,
  className,
  testId,
  title,
}: {
  children: ReactNode;
  tone?: keyof typeof tagTones;
  /** Let a long tag wrap onto more lines instead of overflowing. */
  wrap?: boolean;
  className?: string;
  testId?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] border px-1.5 font-mono text-[10px] uppercase tracking-wide',
        wrap ? 'min-h-5 max-w-full py-0.5 leading-4' : 'h-5 shrink-0 whitespace-nowrap',
        tagTones[tone],
        className,
      )}
      data-testid={testId}
      title={title}
    >
      {children}
    </span>
  );
}

/** A unit chip after a number: "1,124 [AGENT]". */
export function Unit({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('rounded-[4px] bg-bg-tertiary px-1 py-px font-mono text-[10px] font-medium text-text-tertiary', className)}>
      {children}
    </span>
  );
}

/** Whole tokens with thousands separators; two decimals only under 1,000. */
export function formatWhole(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (Math.abs(value) >= 1_000) return Math.round(value).toLocaleString('en-US');
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 13, 21:05 UTC" for a ledger timestamp; the raw text when it does not parse. */
export function formatWhen(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso || '-';
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** "Jan 15, 2027" in UTC. */
export function formatDate(ms: number): string {
  if (!Number.isFinite(ms)) return '-';
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
