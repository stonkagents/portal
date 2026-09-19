'use client';
/**
 * Team vesting, drawn only from a plan the environment states in full: the
 * share and the allocation, a track from today through the lock date and
 * the cliff to the full unlock with today's marker, the countdown to the
 * lock, the cadence after the cliff, and the Streamflow contract link once
 * one is configured. Nothing here is read from a wallet: the creator wallet
 * of the pool is the burn wallet, not the team's, so no balance is shown
 * against the allocation. Entrance: the track draws in and the lock marker
 * drops; both finite, transform and opacity.
 */

import { cn } from '@/lib/utils/cn';
import type { VestingConfig, VestingTimeline } from '@/lib/agent-token';
import { Eyebrow, MonoTag, Unit, formatDate, formatWhole } from './NetworkTokenPrimitives';

/** The status tag for a phase. Exported for tests. */
export function vestingStatus(timeline: VestingTimeline): { text: string; tone: 'live' | 'neutral' } {
  switch (timeline.phase) {
    case 'before-lock':
      return { text: `locks in ${timeline.daysToLock}d`, tone: 'live' };
    case 'locked':
      return { text: `cliff in ${timeline.daysToCliff}d`, tone: 'live' };
    case 'unlocking':
      return { text: `unlocking ${timeline.cadence}`, tone: 'live' };
    default:
      return { text: 'fully unlocked', tone: 'neutral' };
  }
}

export interface TeamVestingBlockProps {
  symbol: string;
  /** Whole tokens the team holds under the plan. Null until the supply is known. */
  allocationTokens: number | null;
  config: VestingConfig;
  timeline: VestingTimeline;
  /** `compact` is the home card; `full` adds the date labels under the track. */
  variant?: 'compact' | 'full';
  className?: string;
}

export function TeamVestingBlock({
  symbol,
  allocationTokens,
  config,
  timeline,
  variant = 'compact',
  className,
}: TeamVestingBlockProps) {
  const status = vestingStatus(timeline);
  const pct = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;
  const unlockSpan = 1 - timeline.cliffFrac;
  // Monthly ticks across the unlock span, so the cadence is seen, not read.
  const ticks = Math.max(1, Math.round(config.months));

  return (
    <div className={cn('min-w-0', className)} data-testid="fees-went-vesting" data-phase={timeline.phase}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Team vesting</h3>
        <Eyebrow>{config.teamPct}% of supply</Eyebrow>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-mono text-lg font-bold tabular-nums text-text-primary" data-testid="fees-went-vesting-amount">
          {allocationTokens != null ? (
            <>
              {formatWhole(allocationTokens)} <Unit>{symbol}</Unit>
            </>
          ) : (
            '-'
          )}
        </span>
        <Eyebrow>allocation</Eyebrow>
      </div>

      {/* The track: today → lock → cliff → full unlock. */}
      <div className="relative mt-4 h-9" data-testid="vesting-track">
        <div className="agent-track-in absolute inset-x-0 top-3 h-2">
          {/* Before the lock: an open stretch. */}
          <div
            className="absolute top-0 h-2 rounded-l-full border border-dashed border-border-hover"
            style={{ left: 0, width: pct(timeline.lockFrac) }}
            aria-hidden="true"
          />
          {/* Locked: solid ink. */}
          <div
            className="absolute top-0 h-2 bg-text-secondary"
            style={{ left: pct(timeline.lockFrac), width: pct(Math.max(0, timeline.cliffFrac - timeline.lockFrac)) }}
            aria-hidden="true"
          />
          {/* Unlocking: a muted stretch with monthly ticks, the unlocked share in green. */}
          <div
            className="absolute top-0 h-2 overflow-hidden rounded-r-full bg-bg-tertiary"
            style={{ left: pct(timeline.cliffFrac), width: pct(unlockSpan) }}
          >
            <div
              className="h-full w-full origin-left bg-accent-green"
              style={{ transform: `scaleX(${timeline.unlockedFrac})` }}
              aria-hidden="true"
            />
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${ticks} 1`} preserveAspectRatio="none" aria-hidden="true">
              {Array.from({ length: ticks - 1 }, (_, i) => (
                <line
                  key={i}
                  x1={i + 1}
                  x2={i + 1}
                  y1={0}
                  y2={1}
                  stroke="var(--color-bg-secondary)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          </div>
        </div>
        {/* Today. */}
        <div
          className="absolute top-[9px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-bg-secondary bg-accent-green"
          style={{ left: pct(timeline.todayFrac) }}
          title="Today"
          data-testid="vesting-today"
        />
        {/* The lock, dropping in. */}
        <div
          className="agent-marker-drop absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: pct(timeline.lockFrac) }}
          data-testid="vesting-lock-marker"
        >
          <div className="h-8 w-px bg-text-primary" />
        </div>
        {/* The cliff. */}
        <div
          className="absolute top-1 h-6 w-px -translate-x-1/2 bg-border-hover"
          style={{ left: pct(timeline.cliffFrac) }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-1 flex justify-between gap-2 font-mono text-[10px] uppercase tracking-wide text-text-tertiary tabular-nums">
        <span>{variant === 'full' ? `lock ${formatDate(timeline.lockAt)}` : 'lock'}</span>
        <span>{variant === 'full' ? `cliff ${timeline.lockedUntilLabel}` : 'cliff'}</span>
        <span>{variant === 'full' ? `full ${formatDate(timeline.endAt)}` : 'full'}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="fees-went-vesting-note">
        <MonoTag tone={status.tone} testId="vesting-phase-tag">
          {status.text}
        </MonoTag>
        <MonoTag testId="vesting-cadence-tag">
          {config.cadence} unlocks after {timeline.lockedUntilLabel}
        </MonoTag>
        {config.url && (
          <a
            href={config.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-5 items-center gap-1 rounded-[4px] border border-border-hover bg-bg-void px-1.5 font-mono text-[10px] uppercase tracking-wide text-text-primary no-underline transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green"
            data-testid="vesting-stream-link"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-accent-green" aria-hidden="true" />
            Vesting contract <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>

      <p className="mt-2 font-mono text-[11px] leading-5 text-text-tertiary" data-testid="vesting-copy">
        Team tokens locked until {timeline.lockedUntilLabel}, then {config.cadence} unlocks
        {variant === 'full' ? ` over ${config.months} months` : ''}.
      </p>
    </div>
  );
}
