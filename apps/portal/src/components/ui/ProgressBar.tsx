import { cn } from '@/lib/utils/cn';

const colorMap = {
  green: 'bg-accent-green',
  blue: 'bg-accent-blue',
  red: 'bg-accent-red',
  yellow: 'bg-accent-yellow',
} as const;

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: keyof typeof colorMap;
  label?: string;
  showValue?: boolean;
  className?: string;
}

export function ProgressBar({ value, max = 100, color = 'green', label, showValue, className }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn('flex flex-col gap-1', className)} data-testid="progress-bar">
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs text-text-secondary">
          {label && <span>{label}</span>}
          {showValue && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className={cn('h-full rounded-full transition-all duration-[var(--transition-base)]', colorMap[color])}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
}
