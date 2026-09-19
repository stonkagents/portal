import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from './Icon';

interface StatProps {
  label: string;
  value: string | number;
  icon?: IconName;
  trend?: { value: number; label?: string };
  className?: string;
}

export function Stat({ label, value, icon, trend, className }: StatProps) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-lg border border-border-default bg-bg-primary p-4', className)} data-testid="stat">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">{label}</span>
        {icon && <Icon name={icon} size="sm" className="text-text-tertiary" />}
      </div>
      <span className="text-2xl font-bold text-text-primary">{value}</span>
      {trend && (
        <span className={cn('text-xs font-medium', trend.value >= 0 ? 'text-accent-green' : 'text-accent-red')}>
          {trend.value >= 0 ? '+' : ''}
          {trend.value}%{trend.label && ` ${trend.label}`}
        </span>
      )}
    </div>
  );
}
