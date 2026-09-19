/**
 * Purpose: whether a CSS media query matches, kept current as the viewport
 *          changes. False on the server and during hydration, so a component
 *          that renders one of two variants starts with the narrow one and
 *          the markup never differs between the server and the first client
 *          render. Use it where the same widget must exist in one place only
 *          (a test id, a live region), not for styling: that stays in CSS.
 */
'use client';

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}
