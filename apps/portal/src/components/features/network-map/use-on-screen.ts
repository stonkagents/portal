'use client';
/**
 * Purpose: Whether the map container is near the viewport. Starts false so a map below
 *          the fold loads nothing until it is about to be seen; without an
 *          IntersectionObserver (tests, old engines) the element counts as visible.
 */

import { useEffect, useState, type RefObject } from 'react';

export function useOnScreen(ref: RefObject<Element | null>, rootMargin = '200px'): boolean {
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) setOnScreen(entry.isIntersecting);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return onScreen;
}
