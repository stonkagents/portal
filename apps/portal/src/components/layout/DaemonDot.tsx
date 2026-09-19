import { cn } from '@/lib/utils/cn';

type DaemonStatus = 'online' | 'degraded' | 'offline';

interface DaemonDotProps {
  status?: DaemonStatus;
  className?: string;
}

const dotStyles: Record<DaemonStatus, string> = {
  online: 'bg-accent-green shadow-[0_0_6px_var(--color-accent-green)] animate-daemon-pulse',
  degraded: 'bg-accent-yellow shadow-[0_0_6px_var(--color-accent-yellow)]',
  offline: 'bg-accent-red shadow-[0_0_6px_var(--color-accent-red)]',
};

/**
 * Daemon health indicator dot.
 * Online = green pulsing, Degraded = yellow steady, Offline = red steady.
 */
export function DaemonDot({ status = 'offline', className }: DaemonDotProps) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full transition-[background-color,box-shadow] duration-300',
        dotStyles[status],
        className,
      )}
      role="status"
      aria-label={`Daemon ${status}`}
      data-testid="daemon-dot"
    />
  );
}
