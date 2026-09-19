/**
 * Scroll to `#<id>` once the element exists. A link from another page can
 * land before the panel has rendered (the token page shows a skeleton first),
 * so the browser's own anchor jump misses; this one waits for `ready`.
 */

'use client';

import { useEffect, useRef } from 'react';

export function useScrollToHash(id: string, ready: boolean): void {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !ready || typeof window === 'undefined') return;
    if (window.location.hash !== `#${id}`) return;
    const element = document.getElementById(id);
    if (!element) return;
    done.current = true;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [id, ready]);
}
