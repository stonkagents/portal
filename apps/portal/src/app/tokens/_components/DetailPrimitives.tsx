/**
 * Small pieces the token detail page repeats: the bordered section card with a
 * slim header row, an address that copies on click, and a chip.
 */

'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

interface SectionCardProps {
  title?: ReactNode;
  /** Right side of the header row. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Skip the inner padding, for tables and iframes that run edge to edge. */
  flush?: boolean;
  'data-testid'?: string;
}

export function SectionCard({ title, aside, children, className, flush, 'data-testid': testId }: SectionCardProps) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border-default bg-bg-secondary', className)} data-testid={testId}>
      {(title || aside) && (
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border-default px-4 py-2">
          {title && <h2 className="text-sm font-semibold text-text-primary">{title}</h2>}
          {aside && <div className="flex items-center gap-2">{aside}</div>}
        </div>
      )}
      <div className={flush ? undefined : 'p-4'}>{children}</div>
    </section>
  );
}

interface CopyAddressProps {
  value: string;
  /** What is shown; defaults to the value itself. */
  label?: string;
  /** Leading tag, e.g. "CA". */
  tag?: string;
  href?: string;
  className?: string;
  title?: string;
}

/** Click copies the full value; the check mark confirms for a moment. */
export function CopyAddress({ value, label, tag, href, className, title }: CopyAddressProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border border-border-default bg-bg-tertiary px-2 font-mono text-xs text-text-secondary',
        className,
      )}
    >
      {tag && <span className="font-sans font-semibold text-text-tertiary">{tag}</span>}
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-accent-green" title={title}>
          {label ?? value}
        </a>
      ) : (
        <span title={title}>{label ?? value}</span>
      )}
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : `Copy ${tag ?? 'address'}`}
        className="inline-flex text-text-tertiary transition-colors hover:text-text-primary"
      >
        <Icon name={copied ? 'check' : 'copy'} size="sm" className={cn('h-3.5 w-3.5', copied && 'text-accent-green')} />
      </button>
    </span>
  );
}

const chipTones = {
  neutral: 'bg-bg-tertiary text-text-secondary',
  green: 'bg-accent-green/15 text-accent-green',
  blue: 'bg-accent-blue/15 text-accent-blue',
  purple: 'bg-accent-purple/15 text-accent-purple',
  yellow: 'bg-accent-yellow/15 text-accent-yellow',
} as const;

interface ChipProps {
  tone?: keyof typeof chipTones;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Chip({ tone = 'neutral', children, className, title }: ChipProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold', chipTones[tone], className)}
      title={title}
    >
      {children}
    </span>
  );
}

/** A square link button for a social or venue. */
export function LinkButton({ href, children, label }: { href: string; children: ReactNode; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-border-default bg-bg-tertiary px-3 text-sm font-semibold text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
    >
      {children}
    </a>
  );
}
