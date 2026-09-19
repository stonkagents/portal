import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from './Icon';

interface PageHeaderProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ icon, title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between', className)} data-testid="page-header">
      <div className="flex items-center gap-3">
        {icon && <Icon name={icon} size="lg" className="text-accent-green" />}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-text-secondary">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="mt-3 sm:mt-0">{action}</div>}
    </div>
  );
}
