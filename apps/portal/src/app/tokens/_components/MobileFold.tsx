/**
 * Folds its children behind a toggle on phones; from tablet up they are always shown.
 */
'use client';

import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

export function MobileFold({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('flex flex-col gap-6', className)} data-testid="mobile-fold" data-open={open}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between rounded-lg border border-border-default bg-bg-secondary px-4 text-sm font-semibold text-text-primary md:hidden"
        data-testid="mobile-fold-toggle"
      >
        {label}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size="sm" className="text-text-tertiary" />
      </button>
      <div className={cn('flex flex-col gap-6', !open && 'hidden md:flex')}>{children}</div>
    </div>
  );
}
