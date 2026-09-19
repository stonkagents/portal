/**
 * Purpose: Full-screen claw overlay during route transitions. Intercepts internal
 *          link clicks to show immediately, dismisses when usePathname() updates.
 *          A link to the current pathname (only the query changes, as a bell row
 *          opening a thread on the board does) never shows it, since no pathname
 *          change would ever take it down; and whatever happens it goes away by
 *          itself after SAFETY_MS.
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { pickRouteMessage } from '@/lib/route-messages';

/** Minimum time (ms) the overlay stays visible to avoid flicker */
const MIN_SHOW_MS = 400;
/** Delay (ms) before showing overlay — skip for fast navigations */
const SHOW_DELAY_MS = 150;
/** The overlay never outlives this, pathname change or not */
export const SAFETY_MS = 5_000;

/** Trailing-slash and query/hash insensitive: does this href stay on the current pathname? */
export function isSamePathname(href: string, pathname: string): boolean {
  const strip = (p: string) => p.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return strip(href) === strip(pathname);
}

export function NavigationLoader() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const prevPathname = useRef(pathname);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const minTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canDismissRef = useRef(true);

  const dismiss = useCallback(() => {
    setVisible(false);
    canDismissRef.current = true;
    clearTimeout(safetyTimerRef.current);
  }, []);

  // Detect navigation completion — pathname changed
  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      // Clear the show-delay timer if navigation completed before it fired
      clearTimeout(showTimerRef.current);

      if (visible) {
        // If min-show time hasn't elapsed, wait for it
        if (!canDismissRef.current) {
          // minTimer will dismiss when ready
        } else {
          dismiss();
        }
      }
    }
  }, [pathname, visible, dismiss]);

  // Intercept internal link clicks
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a[href]');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/')) return;

      // Skip a link to the current pathname (same page, or only the query changes): nothing would dismiss it
      if (isSamePathname(href, pathname)) return;

      // Skip if modifier keys (new tab, etc.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // Show overlay after a short delay (skip flicker for fast navigations)
      clearTimeout(showTimerRef.current);
      showTimerRef.current = setTimeout(() => {
        setMessage(pickRouteMessage(href));
        setVisible(true);
        canDismissRef.current = false;

        // Whatever the router does, the overlay never outlives SAFETY_MS
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = setTimeout(dismiss, SAFETY_MS);

        // Enforce minimum display time
        clearTimeout(minTimerRef.current);
        minTimerRef.current = setTimeout(() => {
          canDismissRef.current = true;
          // If pathname already changed while we were showing, dismiss now
          if (prevPathname.current !== pathname) {
            dismiss();
          }
        }, MIN_SHOW_MS);
      }, SHOW_DELAY_MS);
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      clearTimeout(showTimerRef.current);
      // NOTE: minTimerRef is NOT cleared here — it must survive effect re-runs
      // triggered by pathname changes. Clearing it here caused a permanent
      // deadlock when navigation completed before the min-show timer fired.
      // The show callback (line 73) clears stale min timers on new clicks.
    };
  }, [pathname, dismiss]);

  // Clean up min and safety timers only on unmount
  useEffect(() => {
    return () => {
      clearTimeout(minTimerRef.current);
      clearTimeout(safetyTimerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9997] flex items-center justify-center animate-[fade-in_0.2s_ease-out]"
      style={{
        background: 'var(--color-bg-primary)',
        opacity: 0.97,
      }}
      data-testid="navigation-loader"
    >
      <div className="flex flex-col items-center gap-3">
        {/* Claw mascot — breathes (transform) inside a wrapper that carries the static glow */}
        <div className="drop-shadow-[0_0_14px_rgba(255,77,77,0.55)]">
          <svg
            viewBox="0 0 120 120"
            className="w-20 h-20 animate-neon-breathe will-change-transform"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path fill="#FF4D4D" d="M24 50 C20 42,14 36,10 30 C8 26,10 20,16 20 C20 20,22 24,22 28 C22 32,26 36,30 42 Z" />
            <path fill="#FF4D4D" d="M96 50 C100 42,106 36,110 30 C112 26,110 20,104 20 C100 20,98 24,98 28 C98 32,94 36,90 42 Z" />
            <path fill="#FF4D4D" d="M20 58 C20 40,32 32,60 32 C88 32,100 40,100 58 C100 78,88 90,60 90 C32 90,20 78,20 58 Z" />
            <rect fill="#00FF00" x="24" y="48" width="72" height="6" />
            <rect fill="#00FF00" x="20" y="48" width="6" height="6" />
            <rect fill="#00FF00" x="94" y="48" width="6" height="6" />
            <rect fill="#00FF00" x="28" y="54" width="24" height="6" />
            <rect fill="#00FF00" x="28" y="54" width="6" height="18" />
            <rect fill="#00FF00" x="46" y="54" width="6" height="18" />
            <rect fill="#00FF00" x="28" y="66" width="24" height="6" />
            <rect fill="var(--color-bg-primary)" x="34" y="60" width="12" height="6" />
            <rect fill="#00FF00" x="52" y="54" width="16" height="6" />
            <rect fill="#00FF00" x="68" y="54" width="24" height="6" />
            <rect fill="#00FF00" x="68" y="54" width="6" height="18" />
            <rect fill="#00FF00" x="86" y="54" width="6" height="18" />
            <rect fill="#00FF00" x="68" y="66" width="24" height="6" />
            <rect fill="var(--color-bg-primary)" x="74" y="60" width="12" height="6" />
          </svg>
        </div>

        {/* Neon loading dots (static glow, opacity/scale animation) */}
        <div className="flex gap-[7px]">
          {[0, 0.2, 0.4].map((delay, i) => (
            <span
              key={i}
              className="w-[7px] h-[7px] rounded-full bg-accent-green"
              style={{
                boxShadow: '0 0 8px var(--color-accent-green), 0 0 20px rgba(0,255,0,0.4)',
                animation: `neon-dot 1.4s ease-in-out ${delay}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Contextual message */}
        <span className="text-xs text-text-tertiary font-mono uppercase tracking-[0.1em]">{message}</span>
      </div>
    </div>
  );
}
