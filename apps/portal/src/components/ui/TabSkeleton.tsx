/**
 * Purpose: Loading skeleton for dynamically imported tab panels.
 *          Used as the `loading` fallback in next/dynamic imports.
 *          A chunk that has not arrived after STALL_MS stops pulsing and says so;
 *          a fallback has no error flag of its own, so time is the only signal it gets.
 */
'use client';

import { useEffect, useState } from 'react';

const STALL_MS = 8_000;

export function TabSkeleton() {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={stalled ? 'space-y-4 py-2' : 'animate-pulse space-y-4 py-2'}
      data-testid="tab-skeleton"
      data-stalled={stalled || undefined}
    >
      {stalled && (
        <p className="text-xs text-text-tertiary" data-testid="tab-skeleton-stalled">
          This is taking longer than usual. Reload the page if it does not appear.
        </p>
      )}
      {/* Title bar */}
      <div className="h-5 w-40 bg-bg-tertiary rounded" />
      {/* Description */}
      <div className="h-3 w-64 bg-bg-tertiary rounded" />
      {/* Content blocks */}
      <div className="space-y-3 pt-2">
        <div className="h-12 bg-bg-tertiary rounded-lg" />
        <div className="h-12 bg-bg-tertiary rounded-lg" />
        <div className="h-12 bg-bg-tertiary rounded-lg" />
      </div>
    </div>
  );
}
