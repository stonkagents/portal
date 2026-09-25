'use client';
/**
 * The supply ring: the whole created supply as a track, the planned burn as
 * a faint green arc, the burned share as the signal-green arc over it, a
 * tick where the next burn will bring the arc, and a mono centre readout of
 * what is left.
 *
 * Entrance, on the first read: the burned arc sweeps from nothing, the
 * planned arc draws after it, the next-burn tick pulses once. A later read
 * tweens the burned arc and counts the readout to the new figure. All of it
 * is requestAnimationFrame on SVG attributes and a text node (no layout) or
 * one finite CSS animation on transform/opacity; reduced motion snaps.
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { formatPercent } from '../_lib/detail-format';
import { formatWhole } from './NetworkTokenPrimitives';
import { prefersReducedMotion } from './use-in-view';

/** How long the burned arc and the readout take to reach a new figure. */
const RING_TWEEN_MS = 900;
/** How long the planned arc takes to draw after the burned arc has landed. */
const RING_PLAN_MS = 700;
/** The smallest slice drawn once anything is burned: a lit dot on the ring, never nothing. */
export const RING_MIN_FRACTION = 0.004;

/** The ring's viewBox and radius; the coming-soon preview draws its ghost ring on the same geometry. */
export const RING_VIEW = 120;
export const RING_RADIUS = 52;
const VIEW = RING_VIEW;
const R = RING_RADIUS;
const CIRCUMFERENCE = 2 * Math.PI * R;

/** Fraction of the ring the slice covers for `burned` of `total`. Exported for tests. */
export function ringFraction(burned: number | null, total: number | null): number {
  if (burned == null || total == null || total <= 0 || burned <= 0) return 0;
  return Math.min(1, Math.max(RING_MIN_FRACTION, burned / total));
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const dash = (fraction: number) => `${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`;

export interface BurnRingProps {
  symbol: string;
  /** Whole tokens the mint was created with. Null until known. */
  totalSupply: number | null;
  /** Whole tokens the mint reports now. Null until read. */
  currentSupply: number | null;
  /** Percent burned as the progressbar reports it (of the plan when one exists). */
  progressPercent: number | null;
  /** Share of the supply the plan burns in total, 0-1. Nothing planned: no arc. */
  plannedFraction?: number;
  /** Share of the supply the arc reaches after the next burn, 0-1. Null: no tick. */
  nextFraction?: number | null;
  /** The ring's largest size in pixels; it fills its column up to this. */
  size?: number;
  className?: string;
}

export function BurnRing({
  symbol,
  totalSupply,
  currentSupply,
  progressPercent,
  plannedFraction = 0,
  nextFraction = null,
  size = 132,
  className,
}: BurnRingProps) {
  const burned = totalSupply != null && currentSupply != null ? Math.max(0, totalSupply - currentSupply) : null;
  const fraction = ringFraction(burned, totalSupply);
  const burnedPct = totalSupply && burned != null ? (burned / totalSupply) * 100 : null;
  const planned = Math.min(1, Math.max(0, plannedFraction));
  const tickAngle = nextFraction != null && nextFraction > 0 ? Math.min(1, nextFraction) * 360 : null;

  const sliceRef = useRef<SVGCircleElement>(null);
  const planRef = useRef<SVGCircleElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const shown = useRef<{ supply: number | null; fraction: number; planned: number }>({ supply: null, fraction: 0, planned: 0 });
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const slice = sliceRef.current;
    const plan = planRef.current;
    const readout = readoutRef.current;
    const entrance = shown.current.supply == null && totalSupply != null && currentSupply != null;
    // The first read opens from the whole supply so the arcs are seen to draw.
    const from = entrance ? { supply: totalSupply as number, fraction: 0, planned: 0 } : shown.current;
    const to = { supply: currentSupply, fraction, planned };
    shown.current = to;
    if (!slice || !plan || !readout) return;

    const paint = (supply: number | null, frac: number, planFrac: number) => {
      slice.setAttribute('stroke-dasharray', dash(frac));
      plan.setAttribute('stroke-dasharray', dash(planFrac));
      readout.textContent = supply != null ? formatWhole(supply) : '-';
    };

    const canTween =
      from.supply != null &&
      to.supply != null &&
      from.supply !== to.supply &&
      !prefersReducedMotion() &&
      typeof requestAnimationFrame === 'function';
    if (!canTween) {
      paint(to.supply, to.fraction, to.planned);
      return;
    }

    // Phase one: the burned arc and the readout. Phase two (entrance only): the planned arc, then the tick pulses.
    const planStart = RING_TWEEN_MS;
    const total = entrance ? RING_TWEEN_MS + RING_PLAN_MS : RING_TWEEN_MS;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const k = easeOut(Math.min(1, elapsed / RING_TWEEN_MS));
      const p = entrance ? easeOut(Math.min(1, Math.max(0, elapsed - planStart) / RING_PLAN_MS)) : 1;
      paint(
        Math.round((from.supply as number) + ((to.supply as number) - (from.supply as number)) * k),
        from.fraction + (to.fraction - from.fraction) * k,
        from.planned + (to.planned - from.planned) * p,
      );
      if (elapsed < total) frame = requestAnimationFrame(step);
      else if (entrance) setPulse(true);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [currentSupply, fraction, planned, totalSupply]);

  return (
    <div
      className={cn('@container relative aspect-square w-full shrink-0', className)}
      style={{ maxWidth: size }}
      data-testid="burn-ring"
    >
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        width="100%"
        height="100%"
        role="progressbar"
        aria-valuenow={progressPercent ?? 0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${symbol} burned`}
        className="block overflow-visible"
      >
        {/* Track: the created supply. */}
        <circle cx={VIEW / 2} cy={VIEW / 2} r={R} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={8} />
        {/* Quarter ticks so the ring reads as a scale. */}
        {[0, 90, 180, 270].map(angle => (
          <line
            key={angle}
            x1={VIEW / 2}
            y1={VIEW / 2 - R - 7}
            x2={VIEW / 2}
            y2={VIEW / 2 - R - 4}
            stroke="var(--color-border-hover)"
            strokeWidth={1}
            transform={`rotate(${angle} ${VIEW / 2} ${VIEW / 2})`}
          />
        ))}
        {/* Planned arc: what the plan burns in total, faint. */}
        <circle
          ref={planRef}
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={R}
          fill="none"
          stroke="var(--color-accent-green)"
          strokeWidth={8}
          strokeLinecap="butt"
          opacity={0.22}
          strokeDasharray={dash(planned)}
          transform={`rotate(-90 ${VIEW / 2} ${VIEW / 2})`}
          data-testid="burn-ring-planned"
        />
        {/* Burned arc, from twelve o'clock. */}
        <circle
          ref={sliceRef}
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={R}
          fill="none"
          stroke="var(--color-accent-green)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={dash(fraction)}
          transform={`rotate(-90 ${VIEW / 2} ${VIEW / 2})`}
          data-testid="burn-ring-slice"
        />
        {/* Where the next burn brings the arc. */}
        {tickAngle != null && (
          <g transform={`rotate(${tickAngle} ${VIEW / 2} ${VIEW / 2})`} data-testid="burn-ring-tick">
            <circle
              cx={VIEW / 2}
              cy={VIEW / 2 - R}
              r={3.5}
              fill="var(--color-bg-secondary)"
              stroke="var(--color-accent-green)"
              strokeWidth={1.5}
              className={pulse ? 'agent-tick-pulse' : undefined}
            />
          </g>
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          ref={readoutRef}
          className="font-mono text-[10.5cqw] font-semibold leading-tight tabular-nums text-text-primary"
          data-testid="burn-remaining"
        >
          {currentSupply != null ? formatWhole(currentSupply) : '-'}
        </span>
        <span className="mt-1 font-mono text-[4cqw] tabular-nums text-accent-green" data-testid="burn-ring-percent">
          {burnedPct != null ? `${formatPercent(burnedPct, 2)} burned` : '-'}
        </span>
      </div>
    </div>
  );
}
