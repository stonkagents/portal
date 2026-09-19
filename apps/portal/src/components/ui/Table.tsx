import { cn } from '@/lib/utils/cn';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <div className="w-full overflow-x-auto" data-testid="table">
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  );
}

function THead({ children, className }: { children: React.ReactNode; className?: string }) {
  return <thead className={cn('border-b border-border-default text-xs text-text-secondary', className)}>{children}</thead>;
}

function TBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tbody className={cn('', className)}>{children}</tbody>;
}

function TR({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr className={cn('border-b border-border-default transition-colors hover:bg-bg-secondary/50', className)} onClick={onClick}>
      {children}
    </tr>
  );
}

function TH({ children, className, align }: { children: React.ReactNode; className?: string; align?: 'left' | 'center' | 'right' }) {
  return (
    <th className={cn('px-3 py-2.5 font-medium', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>
      {children}
    </th>
  );
}

function TD({ children, className, align }: { children: React.ReactNode; className?: string; align?: 'left' | 'center' | 'right' }) {
  return (
    <td
      className={cn(
        'px-3 py-2.5 text-text-primary',
        // Number columns: right-aligned and tabular, so digits line up down the column.
        align === 'right' && 'text-right tabular-nums',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

Table.Head = THead;
Table.Body = TBody;
Table.Row = TR;
Table.TH = TH;
Table.TD = TD;
