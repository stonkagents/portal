'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from './Icon';

const variants = {
  primary: 'bg-accent-green text-black hover:brightness-110 active:brightness-90 shadow-sm',
  secondary: 'border border-accent-green text-accent-green hover:bg-accent-green/10 active:bg-accent-green/20',
  ghost: 'text-text-primary border border-border-default hover:bg-bg-secondary hover:border-border-hover active:bg-bg-tertiary',
  danger: 'bg-accent-red text-white hover:brightness-110 active:brightness-90',
} as const;

const sizes = {
  sm: 'min-h-[44px] px-3 text-xs gap-1.5',
  default: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
} as const;

/** @convention Icon-only buttons (icon set, no children) MUST pass aria-label for accessibility */
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'default', icon, iconRight, loading, disabled, className, children, ...props }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-all duration-[var(--transition-fast)] select-none cursor-pointer',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
          'disabled:pointer-events-none disabled:opacity-40',
          variants[variant],
          sizes[size],
          className,
        )}
        data-testid="button"
        {...props}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : icon ? (
          <Icon name={icon} size={size === 'sm' ? 'sm' : 'default'} />
        ) : null}
        {children}
        {iconRight && !loading && <Icon name={iconRight} size={size === 'sm' ? 'sm' : 'default'} />}
      </button>
    );
  },
);

Button.displayName = 'Button';
