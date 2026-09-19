import { cn } from '@/lib/utils/cn';

const variants = {
  online: 'bg-accent-green/15 text-accent-green border-accent-green/30',
  offline: 'bg-text-tertiary/15 text-text-tertiary border-text-tertiary/30',
  seeding: 'bg-accent-blue/15 text-accent-blue border-accent-blue/30',
  leeching: 'bg-accent-yellow/15 text-accent-yellow border-accent-yellow/30',
  verified: 'bg-accent-purple/15 text-accent-purple border-accent-purple/30',
  danger: 'bg-accent-red/15 text-accent-red border-accent-red/30',
} as const;

interface BadgeProps {
  variant?: keyof typeof variants;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({ variant = 'online', children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
      data-testid="badge"
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
