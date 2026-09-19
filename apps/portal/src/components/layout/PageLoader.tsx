/**
 * Purpose: Lightweight page loader — thin green progress bar at top of screen.
 *          Shows only when loading takes > 300ms to avoid flicker on fast loads.
 *          Auto-dismisses when ready prop becomes true.
 */
'use client';

import { useState, useEffect, useRef } from 'react';

const SHOW_DELAY_MS = 300;

interface PageLoaderProps {
  /** Whether the page content is ready */
  ready: boolean;
}

export function PageLoader({ ready }: PageLoaderProps) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ready) {
      if (visible) {
        setDismissed(true);
        const t = setTimeout(() => setVisible(false), 400);
        return () => clearTimeout(t);
      }
      return;
    }
    timerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ready, visible]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9998] h-[3px] bg-accent-green/20 overflow-hidden transition-opacity duration-[400ms] ${dismissed ? 'opacity-0' : 'opacity-100'}`}
      data-testid="page-loader"
    >
      <div
        className="h-full bg-accent-green shadow-[0_0_10px_rgba(0,255,0,0.5)]"
        style={{
          width: '30%',
          animation: 'indeterminate 1.5s ease-in-out infinite',
        }}
      />
    </div>
  );
}
