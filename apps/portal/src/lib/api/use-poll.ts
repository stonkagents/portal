/**
 * Purpose: Generic polling hook for the daemon API with exponential back-off
 *          after a failure and a pause while the tab is hidden (PERF-3).
 *
 * The loop is a setTimeout chain, not setInterval: each tick schedules the
 * next one from the outcome of the last, so a failing daemon costs one request
 * per `maxInterval` instead of one per `interval` forever.
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePollOptions<T> {
  /** Async function to fetch data; null means "offline" */
  fetcher: () => Promise<T | null>;
  /** Polling interval in ms while the fetcher succeeds (default: 5000) */
  interval?: number;
  /**
   * Upper bound for the back-off after a failure (default: the interval, i.e. no back-off).
   * Each consecutive failure doubles the delay: interval, 2x, 4x … up to maxInterval.
   */
  maxInterval?: number;
  /** Fallback data when API returns null */
  fallback: T;
  /** Whether polling is enabled (default: true). Disabled means no request is ever made. */
  enabled?: boolean;
  /** Delay in ms before the first fetch (default: 0). Keeps main thread free during initial paint. */
  defer?: number;
  /** Pause the loop while `document.hidden` and fetch on the next visibility (default: true) */
  pauseWhenHidden?: boolean;
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Generic polling hook — fetches data at intervals, falls back to mock on failure.
 * @returns { data, isOnline, refresh }
 */
export function usePoll<T>({
  fetcher,
  interval = 5000,
  maxInterval,
  fallback,
  enabled = true,
  defer = 0,
  pauseWhenHidden = true,
}: UsePollOptions<T>) {
  const [data, setData] = useState<T>(fallback);
  const [isOnline, setIsOnline] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  /** Consecutive failures since the last success; drives the back-off. */
  const failuresRef = useRef(0);
  const max = maxInterval ?? interval;

  const refresh = useCallback(async () => {
    const result = await fetcherRef.current();
    if (result !== null) {
      setData(result);
      setIsOnline(true);
      failuresRef.current = 0;
    } else {
      setIsOnline(false);
      failuresRef.current += 1;
    }
  }, []);

  /* The cadence in force when the chain last started; a new cadence starts with a fresh back-off. */
  const cadenceRef = useRef<string>('');

  useEffect(() => {
    if (!enabled) return;
    const cadence = interval + '/' + max;
    if (cadenceRef.current && cadenceRef.current !== cadence) failuresRef.current = 0;
    cadenceRef.current = cadence;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    const nextDelay = () => {
      if (failuresRef.current === 0) return interval;
      return Math.min(max, interval * 2 ** (failuresRef.current - 1));
    };

    const schedule = (delay: number) => {
      if (cancelled) return;
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(tick, delay);
    };

    async function tick() {
      timerId = null;
      if (cancelled) return;
      if (pauseWhenHidden && isHidden()) return; // resumed by visibilitychange
      if (inFlight) return;
      inFlight = true;
      try {
        await refresh();
      } finally {
        inFlight = false;
      }
      schedule(nextDelay());
    }

    const onVisibility = () => {
      if (!pauseWhenHidden) return;
      if (isHidden()) {
        if (timerId) clearTimeout(timerId);
        timerId = null;
      } else if (!timerId && !inFlight) {
        void tick();
      }
    };

    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
    schedule(defer);

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    };
    /* A change of cadence (install watch ↔ steady state) restarts the chain with one immediate fetch. */
  }, [refresh, enabled, defer, interval, max, pauseWhenHidden]);

  return { data, isOnline, refresh } as const;
}
