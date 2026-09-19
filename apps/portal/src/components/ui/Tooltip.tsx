import { cn } from '@/lib/utils/cn';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({ content, children, position = 'top', className }: TooltipProps) {
  return (
    <span className={cn('group relative inline-flex', className)} data-testid="tooltip">
      {children}
      <span
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 z-50',
          'whitespace-nowrap rounded-md bg-bg-tertiary px-2.5 py-1.5 text-xs text-text-primary shadow-md border border-border-default',
          'opacity-0 transition-opacity duration-[var(--transition-fast)] group-hover:opacity-100 group-focus-within:opacity-100',
          position === 'top' && 'bottom-full mb-2',
          position === 'bottom' && 'top-full mt-2',
        )}
        role="tooltip"
      >
        {content}
      </span>
    </span>
  );
}
