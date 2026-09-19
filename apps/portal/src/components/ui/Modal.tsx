/**
 * Purpose: Reusable modal shell — dark backdrop, focus trap, Escape close, fadeInUp animation
 */
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Max-width override (default: max-w-lg) */
  maxWidth?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, className, maxWidth }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  /* ── open / close ──────────────────────────────────── */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Use non-modal dialog mode so global overlays (e.g. toast container)
    // can layer above with z-index. Native showModal() uses top-layer.
    if (open && !dialog.open) dialog.show();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  /* ── sync native close event → onClose prop ────────── */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handle = () => onClose();
    dialog.addEventListener('close', handle);
    return () => dialog.removeEventListener('close', handle);
  }, [onClose]);

  /* ── focus trap ────────────────────────────────────── */
  const trapFocus = useCallback(
    (e: KeyboardEvent) => {
      if (!open || e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [open],
  );

  useEffect(() => {
    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [trapFocus]);

  return (
    <>
      {open && <div className="fixed inset-0 z-900 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />}
      <dialog
        ref={dialogRef}
        className={cn(
          /* A 16px gutter on phones; content taller than the screen scrolls inside the dialog instead of running off it. */
          'fixed inset-0 z-950 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-border-default bg-bg-primary p-0 text-text-primary shadow-lg md:max-h-[85vh]',
          'open:animate-fade-in-up',
          maxWidth ?? 'max-w-lg',
          className,
        )}
        data-testid="modal"
        onClick={e => {
          if (e.target === dialogRef.current) onClose();
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <div className="flex flex-col">
          {title && (
            <div className="flex items-center justify-between border-b border-border-default px-5 py-4">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-[44px] h-[44px] text-text-tertiary hover:text-text-primary transition-colors rounded hover:bg-accent-green/8"
                aria-label="Close"
                data-testid="modal-close"
              >
                <Icon name="x" size="default" />
              </button>
            </div>
          )}
          <div className="px-5 py-4">{children}</div>
        </div>
      </dialog>
    </>
  );
}
