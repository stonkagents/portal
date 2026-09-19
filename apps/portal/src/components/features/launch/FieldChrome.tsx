'use client';

/**
 * The chrome every launch field shares: a mono section eyebrow, a field with
 * its label and right-aligned counter, and the one set of control classes so
 * the name input, the description, the link fields and the steppers all sit
 * on the same 44px baseline with the same rest / hover / focus / error states.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/** A number in Geist Mono with tabular figures. Every figure in the wizard uses it. */
export const mono = 'font-mono tabular-nums';

/** The rest / hover / focus / error states of a text control, on the input ground. */
export function controlClass(invalid?: boolean): string {
  return cn(
    'w-full rounded-md border bg-bg-input text-sm text-text-primary placeholder:text-text-tertiary',
    'transition-colors duration-150 focus:outline-none focus:ring-2',
    invalid
      ? 'border-accent-red focus:border-accent-red focus:ring-accent-red/50'
      : 'border-border-default hover:border-border-hover focus:border-accent-green focus:ring-accent-green/50',
  );
}

/** A small mono eyebrow with an index and a hairline that runs to the edge. */
export function SectionLabel({ index, children, trailing }: { index: string; children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn(mono, 'shrink-0 text-[11px] uppercase tracking-[0.14em] text-text-tertiary')}>
        <span className="text-accent-green">{index}</span>
        <span className="mx-2 text-border-hover">/</span>
        {children}
      </span>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border-default" />
      {trailing && <span className="shrink-0">{trailing}</span>}
    </div>
  );
}

/** The x/max readout beside a field label, in mono, red once over the line. */
export function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={cn(mono, 'text-[11px]', value.length > max ? 'text-accent-red' : 'text-text-tertiary')}>
      {value.length}
      <span className="text-border-hover">/</span>
      {max}
    </span>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-4 items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        {hint}
      </div>
      {children}
    </div>
  );
}

/** One line under a control: an error, a warning, or a quiet note. */
export function FieldNote({
  tone = 'muted',
  children,
  ...rest
}: {
  tone?: 'error' | 'warn' | 'muted';
  children: ReactNode;
  'data-testid'?: string;
  role?: string;
}) {
  return (
    <p
      {...rest}
      className={cn(
        'text-xs leading-4',
        tone === 'error' && 'text-accent-red',
        tone === 'warn' && 'text-accent-yellow',
        tone === 'muted' && 'text-text-tertiary',
      )}
    >
      {children}
    </p>
  );
}
