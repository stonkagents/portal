/**
 * Purpose: Individual toast notification component with variant styling,
 *          auto-dismiss, close button, and optional action button.
 *          Styled per design-system.html Section 24.
 */
'use client';

import { useEffect } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export interface ToastAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  autoDismiss?: boolean;
  duration?: number;
  action?: ToastAction;
  onDismiss: (id: string) => void;
}

const VARIANT_ICONS: Record<ToastVariant, IconName> = {
  success: 'check-circle',
  error: 'alert-triangle',
  info: 'info',
  warning: 'alert-triangle',
};

const VARIANT_STYLES: Record<ToastVariant, { background: string; borderColor: string }> = {
  success: { background: '#0d1a0d', borderColor: 'rgba(0,255,0,0.4)' },
  error: { background: '#1a0d0d', borderColor: 'rgba(255,77,77,0.4)' },
  info: { background: '#0d121a', borderColor: 'rgba(74,158,255,0.4)' },
  warning: { background: '#1a170d', borderColor: 'rgba(255,204,0,0.4)' },
};

const VARIANT_TEXT: Record<ToastVariant, string> = {
  success: 'text-accent-green',
  error: 'text-accent-red',
  info: 'text-accent-blue',
  warning: 'text-accent-yellow',
};

export function Toast({ id, title, description, variant, autoDismiss = false, duration = 5000, action, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!autoDismiss) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [autoDismiss, duration, id, onDismiss]);

  return (
    <div
      data-testid={`toast-${id}`}
      className={`toast--${variant} flex items-center gap-3 px-4 py-3 rounded-md shadow-lg border animate-fade-in-up ${VARIANT_TEXT[variant]}`}
      style={VARIANT_STYLES[variant]}
      role="alert"
    >
      <span data-testid={`toast-icon-${id}`}>
        <Icon name={VARIANT_ICONS[variant]} size="sm" />
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{title}</p>
        {description && <p className="mt-0.5 break-words text-xs text-text-secondary [overflow-wrap:anywhere]">{description}</p>}
      </div>

      {action &&
        (action.href ? (
          <a
            data-testid={`toast-action-${id}`}
            href={action.href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 whitespace-nowrap text-xs font-medium text-accent-green hover:text-accent-green/80"
            onClick={e => {
              e.stopPropagation();
              action.onClick?.();
            }}
          >
            {action.label}
          </a>
        ) : (
          <button
            data-testid={`toast-action-${id}`}
            className="shrink-0 whitespace-nowrap text-xs font-medium text-accent-green hover:text-accent-green/80"
            onClick={e => {
              e.stopPropagation();
              action.onClick?.();
            }}
          >
            {action.label}
          </button>
        ))}

      <button
        data-testid={`toast-dismiss-${id}`}
        className="shrink-0 w-5 h-5 flex items-center justify-center text-text-tertiary hover:text-text-primary"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss"
      >
        &#10005;
      </button>
    </div>
  );
}
