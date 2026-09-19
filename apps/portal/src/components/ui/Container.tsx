import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

export function Container({ children, className }: ContainerProps) {
  return <div className={cn('w-full px-4 md:px-6 md:mx-auto md:max-w-[1400px]', className)}>{children}</div>;
}
