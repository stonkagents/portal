/**
 * Purpose: The one empty-state pattern. A noun in sentence case ending with a
 *          period, an optional line of detail, and at most one next action.
 *          Every "nothing here yet" surface renders this so the copy, the
 *          spacing and the tone stay identical across the app.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  /** What is missing, e.g. "No holders yet." Sentence case, ends with a period. */
  title: string;
  /** Optional second line: what will fill this space, or what to do about it. */
  description?: ReactNode;
  /** Optional icon above the title; omit on compact in-panel states. */
  icon?: IconName;
  /** At most one next action (a Button or Link). */
  action?: ReactNode;
  /** 'sm' is for lists inside cards and sidebars; 'md' for page-level regions. */
  size?: 'sm' | 'md';
  className?: string;
  'data-testid'?: string;
}

export function EmptyState({ title, description, icon, action, size = 'md', className, 'data-testid': testId }: EmptyStateProps) {
  const compact = size === 'sm';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-1 py-4 px-3' : 'gap-2 py-12 px-4',
        className,
      )}
      data-testid={testId ?? 'empty-state'}
      role="status"
    >
      {icon && (
        <div className={cn('text-text-tertiary', compact ? 'mb-1 opacity-60' : 'mb-2 opacity-40')}>
          <Icon name={icon} size={compact ? 'lg' : 'xl'} />
        </div>
      )}
      <p
        className={cn('m-0 font-semibold text-text-primary', compact ? 'text-xs' : 'text-base')}
        data-testid={testId ? `${testId}-title` : undefined}
      >
        {title}
      </p>
      {description && <p className={cn('m-0 text-text-tertiary', compact ? 'text-[11px]' : 'text-sm max-w-md')}>{description}</p>}
      {action && <div className={compact ? 'mt-2' : 'mt-3'}>{action}</div>}
    </div>
  );
}
