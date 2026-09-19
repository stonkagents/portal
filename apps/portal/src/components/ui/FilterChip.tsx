'use client';

import { cn } from '@/lib/utils/cn';

interface FilterChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  /** Shown after the label as a small badge; omitted when unknown. */
  count?: number;
  'data-testid'?: string;
}

export function FilterChip({ label, active, onClick, className, count, 'data-testid': testId }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 min-h-[44px] text-xs font-medium transition-all duration-[var(--transition-fast)]',
        'border select-none whitespace-nowrap',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
        active
          ? 'border-accent-green bg-accent-green/10 text-accent-green'
          : 'border-border-default bg-bg-secondary text-text-secondary hover:border-border-hover hover:text-text-primary',
        className,
      )}
      data-testid={testId ?? 'filter-chip'}
      aria-pressed={active}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'px-1.5 py-px rounded-full text-[11px] font-mono leading-tight',
            active ? 'bg-accent-green/15 text-accent-green' : 'bg-white/6 text-text-tertiary',
          )}
          data-testid="filter-chip-count"
        >
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}
