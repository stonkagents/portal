/**
 * Purpose: IntersectionObserver-based count-up animation for stat numbers
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const DURATION_MS = 1200;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function formatNumber(n: number, decimals: number): string {
  if (decimals > 0) return n.toFixed(decimals);
  return Math.round(n).toLocaleString('en-US');
}

export function AnimatedCounter({ value, className }: { value: string; className?: string }) {
  const numericStr = value.replace(/,/g, '');
  const target = parseFloat(numericStr);
  const decimals = numericStr.includes('.') ? numericStr.split('.')[1].length : 0;
  const suffix = value.replace(/[\d,.\-+]+/, '').trim();

  const [display, setDisplay] = useState('0');
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  const animate = useCallback(() => {
    if (hasAnimated) return;
    setHasAnimated(true);
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / DURATION_MS, 1);
      const eased = easeOutCubic(progress);
      const current = eased * target;
      setDisplay(formatNumber(current, decimals));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [hasAnimated, target, decimals]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) animate();
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animate]);

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix && ` ${suffix}`}
    </span>
  );
}
