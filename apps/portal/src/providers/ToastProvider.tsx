/**
 * Purpose: Toast context provider — manages toast state, enforces max 3,
 *          and exposes addToast/dismissToast via useToast hook.
 */
'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ToastVariant, ToastAction } from '@/components/ui/Toast';

const MAX_TOASTS = 3;

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  autoDismiss?: boolean;
  duration?: number;
  action?: ToastAction;
}

interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>): string => {
    const id = `toast-${++counterRef.current}`;
    setToasts(prev => {
      const next = [...prev, { ...toast, id }];
      if (next.length > MAX_TOASTS) {
        return next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return <ToastContext.Provider value={{ toasts, addToast, dismissToast }}>{children}</ToastContext.Provider>;
}

/** SSR-safe noop — returned when ToastProvider is not mounted (e.g. static prerender) */
const NOOP_TOAST: ToastContextValue = {
  toasts: [],
  addToast: () => '',
  dismissToast: () => {},
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? NOOP_TOAST;
}
