/**
 * Purpose: True network debounce hook — delays value updates by `delay` ms to reduce API calls
 */
'use client';

import { useState, useEffect } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of inactivity.
 * Unlike React's useDeferredValue (priority scheduling), this is a true time-based
 * debounce that prevents unnecessary network requests.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
