'use client';
/**
 * A live countdown to an epoch time: "04:12:33", "2d 04:12:33", or "due".
 * Renders a placeholder, then ticks once a second by writing the text node
 * through a ref, so nothing re-renders or reflows; `onDue` fires once when the target passes so the
 * owner can derive the next one.
 */

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils/cn';

const pad = (n: number) => String(n).padStart(2, '0');

/** "hh:mm:ss", days in front when there are any; "due" at or past zero. Exported for tests. */
export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'due';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

export interface CountdownProps {
  /** Epoch ms. Null reads "—". */
  target: number | null;
  onDue?: () => void;
  className?: string;
  testId?: string;
}

export function Countdown({ target, onDue, className, testId }: CountdownProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const dueRef = useRef(onDue);
  dueRef.current = onDue;

  useEffect(() => {
    const el = ref.current;
    if (!el || target == null) return;
    let fired = false;
    const paint = () => {
      const left = target - Date.now();
      el.textContent = formatCountdown(left);
      if (left <= 0 && !fired) {
        fired = true;
        dueRef.current?.();
      }
    };
    paint();
    const timer = setInterval(paint, 1_000);
    return () => clearInterval(timer);
  }, [target]);

  // The first paint is a placeholder on both server and client: the real time is
  // written by the effect once mounted, so the static HTML never disagrees with the browser.
  return (
    <span ref={ref} className={cn('font-mono tabular-nums', className)} data-testid={testId}>
      {target == null ? '-' : '--:--:--'}
    </span>
  );
}
