import { cn } from '@/lib/utils/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className, hover }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border-default bg-bg-primary p-4',
        hover && 'transition-shadow duration-[var(--transition-base)] hover:shadow-md hover:border-border-hover',
        className,
      )}
      data-testid="card"
    >
      {children}
    </div>
  );
}

function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between border-b border-border-default pb-3 mb-3', className)}>{children}</div>;
}

function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('', className)}>{children}</div>;
}

Card.Header = CardHeader;
Card.Body = CardBody;
