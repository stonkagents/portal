/**
 * Purpose: Renders active toasts from ToastProvider in a fixed-position
 *          container at bottom-right. Design-system.html Section 24.
 */
'use client';

import { useToast } from '@/providers/ToastProvider';
import { Toast } from './Toast';

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="toast-container"
      aria-live="polite"
      className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-[1000] flex w-[calc(100%-2rem)] max-w-[400px] flex-col gap-2 lg:bottom-4"
    >
      {toasts.map(t => (
        <Toast
          key={t.id}
          id={t.id}
          title={t.title}
          description={t.description}
          variant={t.variant}
          autoDismiss={t.autoDismiss}
          duration={t.duration}
          action={t.action}
          onDismiss={dismissToast}
        />
      ))}
    </div>
  );
}
