'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from './Icon';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: IconName;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, icon, className, id, ...props }, ref) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <Icon name={icon} size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-11 w-full rounded-md border bg-bg-input px-3 text-sm text-text-primary placeholder:text-text-tertiary',
            'transition-colors duration-[var(--transition-fast)]',
            'focus:outline-none focus:ring-2 focus:ring-accent-green/50 focus:border-accent-green',
            error ? 'border-accent-red focus:ring-accent-red/50 focus:border-accent-red' : 'border-border-default',
            icon && 'pl-9',
            className,
          )}
          data-testid="input"
          {...props}
        />
      </div>
      {error && <p className="text-xs text-accent-red">{error}</p>}
    </div>
  );
});

Input.displayName = 'Input';
