/**
 * A number that flashes when it moves: green up, red down, for a beat.
 * The header price and market cap use it so a live tick is visible.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

const FLASH_MS = 700;

interface PriceTickerProps {
  /** The underlying number; direction is judged on this, not on the text. */
  value: number | null | undefined;
  /** What is rendered. */
  text: string;
  className?: string;
  'data-testid'?: string;
}

export function PriceTicker({ value, text, className, 'data-testid': testId }: PriceTickerProps) {
  const previous = useRef<number | null | undefined>(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (before == null || value == null || before === value) return;
    setFlash(value > before ? 'up' : 'down');
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <span
      className={cn(
        'rounded px-1 -mx-1 font-mono transition-colors duration-[var(--transition-base)]',
        flash === 'up' && 'bg-accent-green/20 text-accent-green',
        flash === 'down' && 'bg-accent-red/20 text-accent-red',
        className,
      )}
      data-flash={flash ?? undefined}
      data-testid={testId}
    >
      {text}
    </span>
  );
}
