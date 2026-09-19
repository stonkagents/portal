/**
 * Purpose: Page readiness context — components report when they are ready,
 *          SplashScreen and PageLoader wait for all critical signals before dismissing.
 */
'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';

interface PageReadinessContextType {
  /** Whether all required components have reported ready */
  isPageReady: boolean;
  /** Report a component as ready. Call once per key. */
  reportReady: (key: string) => void;
  /** Register a key as required — only pages/components that mount register what they need. */
  requireKey: (key: string) => void;
}

const PageReadinessContext = createContext<PageReadinessContextType>({
  isPageReady: false,
  reportReady: () => {},
  requireKey: () => {},
});

/** Always-required baseline signal (LayoutShell useEffect, instant on client render). */
const BASELINE_KEYS = new Set(['layout-mounted']);

export function PageReadinessProvider({ children }: { children: ReactNode }) {
  const [readyKeys, setReadyKeys] = useState<Set<string>>(new Set());
  const [requiredKeys, setRequiredKeys] = useState<Set<string>>(BASELINE_KEYS);

  const reportReady = useCallback((key: string) => {
    setReadyKeys(prev => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const requireKey = useCallback((key: string) => {
    setRequiredKeys(prev => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const isPageReady = useMemo(() => {
    for (const key of requiredKeys) {
      if (!readyKeys.has(key)) return false;
    }
    return true;
  }, [requiredKeys, readyKeys]);

  const value = useMemo(() => ({ isPageReady, reportReady, requireKey }), [isPageReady, reportReady, requireKey]);

  return <PageReadinessContext.Provider value={value}>{children}</PageReadinessContext.Provider>;
}

export function usePageReadiness() {
  return useContext(PageReadinessContext);
}
