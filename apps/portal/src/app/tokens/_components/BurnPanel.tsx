'use client';
/**
 * The burn panel: the supply ring on one side, the burn chart on the other
 * with four facts above it — total burn off the chain, the burn per step,
 * the live countdown to the next one, and the plan in a sentence. The
 * cadence is the tracker's plan (`schedule`) when it states one, else the
 * environment's NEXT_PUBLIC_AGENT_BURN_* values; the tracker's next burn and
 * burn count win over what the environment derives. Without either there is
 * no cadence: a ledger that still lists burns (a flywheel) reads its burn
 * count, its latest burn and a sentence saying there is no schedule; an
 * empty one says "No schedule". Nothing is drawn from a guess.
 *
 * The chart is one bar per planned burn — done in solid green, the next one
 * marked, the rest ghosted — sized to the column with CSS, so it never
 * overflows. Entrance: the bars rise from the baseline once, the next-burn
 * marker drops in; reduced motion collapses both.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { burnedSoFar, formatDuration, type BurnScheduleConfig } from '@/lib/agent-token';
import type { BurnEntry, BurnPlan, LedgerState } from '@/lib/api/hooks/use-agent-ledgers';
import { formatPercent, formatTokenAmount } from '../_lib/detail-format';
import { BurnRing } from './BurnRing';
import { Countdown } from './Countdown';
import { Eyebrow, Unit, formatDate, formatWhen, formatWhole } from './NetworkTokenPrimitives';

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Bars drawn at most; a longer plan is bucketed so each bar is several burns. */
const MAX_BARS = 60;
/** Bars narrower than the chart get their own scroll: one bar per burn, this wide, this far apart. */
const SCROLL_BAR_PX = 6;
const SCROLL_GAP_PX = 2;

export interface BurnPanelInput {
  /** Whole tokens the mint was created with. Null until known. */
  totalSupply: number | null;
  /** Whole tokens the mint reports now. Null until read. */
  currentSupply: number | null;
  /** The keeper's plan. `idle` for a token with no plan endpoint. */
  plan: LedgerState<BurnPlan>;
  /** The configured buyback-and-burn schedule; null for a token without one. */
  schedule?: BurnScheduleConfig | null;
  /** ISO time the schedule starts from when neither the tracker nor the configuration names a start. */
  launchedAt?: string | null;
  now?: number;
}

export interface BurnCadence {
  /** Where the cadence is stated. */
  source: 'ledger' | 'config';
  intervalMs: number;
  /** Whole tokens per burn. */
  stepTokens: number;
  /** Share of supply per burn, 0–100; null before the supply is known. */
  stepPct: number | null;
  /** Whole tokens the plan burns in total. */
  planTokens: number;
  plannedBurns: number;
  /** Burns done, as the ledger counts them, else as the chain implies. */
  burnsDone: number;
  remainingBurns: number;
  /** Epoch ms of the first burn as stated; null when no start is known. */
  startAt: number | null;
  /** Epoch ms of the last planned burn, counted on from the next burn when one is known. */
  endAt: number | null;
  /** Epoch ms of the next burn; null when unknown or complete. */
  nextAt: number | null;
  complete: boolean;
}

export interface BurnBar {
  state: 'done' | 'next' | 'planned';
  /** Whole tokens: the ledger's amount for a listed burn, the step for the rest. */
  amount: number;
  /** Epoch ms, when known. */
  at: number | null;
}

export interface BurnPanelModel {
  createdSupply: number | null;
  /** Whole tokens burned so far: the chain's figure, the ledger's until the mint answers. */
  burned: number | null;
  /** Share of supply burned, 0–100. */
  burnedPct: number | null;
  /** The supply the ring reads out. */
  ringSupply: number | null;
  /** Burned over the plan, 0–100, for the progressbar; null without a plan. */
  progressPercent: number | null;
  plannedFraction: number;
  nextFraction: number | null;
  cadence: BurnCadence | null;
  /** The next burn even without a cadence: the tracker's when served. */
  nextAt: number | null;
  nextAmount: number | null;
  bars: BurnBar[];
}

/** The cadence from the tracker's plan and the environment. Exported for tests. */
export function burnCadence(
  input: {
    createdSupply: number | null;
    burned: number | null;
    plan: LedgerState<BurnPlan>;
    schedule?: BurnScheduleConfig | null;
    launchedAt?: string | null;
  },
  now: number = Date.now(),
): BurnCadence | null {
  const ready = input.plan.status === 'ready' ? input.plan.data : null;
  const supply = input.createdSupply;
  const env = input.schedule ?? null;

  const intervalMs = ready?.schedule ? ready.schedule.intervalSeconds * 1000 : (env?.intervalMs ?? 0);
  const stepTokens =
    ready?.schedule && ready.schedule.amount > 0
      ? ready.schedule.amount
      : ready?.next && ready.next.amount > 0
        ? ready.next.amount
        : env && supply != null
          ? (supply * env.stepPct) / 100
          : 0;
  const planTokens = ready?.planTotal ?? (env && supply != null ? (supply * env.totalPct) / 100 : null);
  if (intervalMs <= 0 || stepTokens <= 0 || planTokens == null || planTokens <= 0) return null;

  const plannedBurns = Math.max(1, Math.round(planTokens / stepTokens));
  const burnsDone = ready ? ready.burns : Math.min(plannedBurns, Math.floor((input.burned ?? 0) / stepTokens));
  const complete = burnsDone >= plannedBurns;

  // The first burn: the tracker's start, else the environment's, else the launch, else the
  // next burn walked back over the burns already done.
  const ledgerNext = ready?.next ? Date.parse(ready.next.at) : NaN;
  const startText = ready?.schedule?.startAt ?? env?.start ?? input.launchedAt ?? null;
  let startAt = startText ? Date.parse(startText) : NaN;
  if (!Number.isFinite(startAt) && Number.isFinite(ledgerNext)) startAt = ledgerNext - burnsDone * intervalMs;

  let nextAt: number | null = Number.isFinite(ledgerNext) ? ledgerNext : null;
  if (nextAt == null && !complete && Number.isFinite(startAt)) {
    const ticks = now <= startAt ? 0 : Math.ceil((now - startAt) / intervalMs);
    nextAt = ticks < plannedBurns ? startAt + ticks * intervalMs : null;
  }
  if (complete) nextAt = null;

  // The last burn follows the next one when it is known, else the nominal start.
  const anchor = nextAt != null ? nextAt - burnsDone * intervalMs : Number.isFinite(startAt) ? startAt : null;
  return {
    source: ready?.schedule ? 'ledger' : 'config',
    intervalMs,
    stepTokens,
    stepPct: supply != null && supply > 0 ? (stepTokens / supply) * 100 : (env?.stepPct ?? null),
    planTokens,
    plannedBurns,
    burnsDone,
    remainingBurns: Math.max(0, plannedBurns - burnsDone),
    startAt: Number.isFinite(startAt) ? startAt : null,
    endAt: anchor != null ? anchor + (plannedBurns - 1) * intervalMs : null,
    nextAt,
    complete,
  };
}

/** One bar per burn of the plan, or the ledger's listed burns without one. Exported for tests. */
export function burnBars(cadence: BurnCadence | null, plan: LedgerState<BurnPlan>, maxBars: number = MAX_BARS): BurnBar[] {
  const ready = plan.status === 'ready' ? plan.data : null;
  const listed = (ready?.recent ?? [])
    .map(entry => ({ amount: entry.amount, at: Date.parse(entry.at) }))
    .filter(entry => Number.isFinite(entry.at))
    .sort((a, b) => a.at - b.at);

  if (!cadence) {
    return listed.slice(-maxBars).map(entry => ({ state: 'done' as const, amount: entry.amount, at: entry.at }));
  }

  const { plannedBurns, burnsDone, stepTokens, intervalMs, nextAt, complete } = cadence;
  // The listed burns are the latest ones: they cover the tail of the burns done.
  const listedFrom = burnsDone - listed.length;
  // Burn times run from the next burn when one is known (the keeper may run late of the
  // nominal start), else from the start.
  const anchor = nextAt != null ? nextAt - burnsDone * intervalMs : cadence.startAt;
  const burn = (i: number): BurnBar => {
    const entry = i < burnsDone && i >= listedFrom ? listed[i - listedFrom] : null;
    return {
      state: i < burnsDone ? 'done' : i === burnsDone && !complete && nextAt != null ? 'next' : 'planned',
      amount: entry ? entry.amount : stepTokens,
      at: entry ? entry.at : anchor != null ? anchor + i * intervalMs : null,
    };
  };
  const total = Math.max(plannedBurns, burnsDone);
  // Hourly plans draw every burn and scroll; only daily or slower plans fold bars together.
  const per = intervalMs < DAY ? 1 : Math.ceil(total / maxBars);
  if (per <= 1) return Array.from({ length: total }, (_, i) => burn(i));

  const bars: BurnBar[] = [];
  for (let from = 0; from < total; from += per) {
    const group = Array.from({ length: Math.min(per, total - from) }, (_, k) => burn(from + k));
    bars.push({
      state: group.every(b => b.state === 'done') ? 'done' : group.some(b => b.state === 'next') ? 'next' : 'planned',
      amount: group.reduce((sum, b) => sum + b.amount, 0),
      at: group[0].at,
    });
  }
  return bars;
}

/** Everything the panel draws, from the chain, the ledger and the configuration. Exported for tests. */
export function burnPanelModel(input: BurnPanelInput): BurnPanelModel {
  const now = input.now ?? Date.now();
  const ready = input.plan.status === 'ready' ? input.plan.data : null;
  // The tracker's `total` is the whole supply; the created supply is whichever names it first.
  const createdSupply = input.totalSupply ?? (ready && ready.total > 0 ? ready.total : null);
  // The chain is the record: burned is created supply minus live supply. The ledger's own count stands in until the mint answers.
  const burned = burnedSoFar(input.currentSupply, createdSupply) ?? ready?.burned ?? null;
  const cadence = burnCadence(
    { createdSupply, burned, plan: input.plan, schedule: input.schedule, launchedAt: input.launchedAt },
    now,
  );

  const planTokens = cadence?.planTokens ?? ready?.planTotal ?? null;
  const nextAt = ready?.next ? Date.parse(ready.next.at) : (cadence?.nextAt ?? null);
  const nextAmount = ready?.next ? ready.next.amount : nextAt != null && cadence ? cadence.stepTokens : null;

  return {
    createdSupply,
    burned,
    burnedPct: burned != null && createdSupply != null && createdSupply > 0 ? (burned / createdSupply) * 100 : null,
    ringSupply: input.currentSupply ?? (createdSupply != null && ready ? Math.max(0, createdSupply - ready.burned) : null),
    progressPercent: burned != null && planTokens != null && planTokens > 0 ? Math.min(100, (burned / planTokens) * 100) : null,
    plannedFraction: planTokens != null && createdSupply ? Math.min(1, planTokens / createdSupply) : 0,
    nextFraction:
      nextAt != null && nextAmount != null && burned != null && createdSupply
        ? Math.min(1, (burned + nextAmount) / createdSupply)
        : null,
    cadence,
    nextAt: Number.isFinite(nextAt) ? nextAt : null,
    nextAmount,
    bars: burnBars(cadence, input.plan),
  };
}

/** "Daily burn" / "Weekly burn" / "Burn every 1h" for a cadence. Exported for tests. */
export function stepLabel(intervalMs: number): string {
  if (intervalMs === DAY) return 'Daily burn';
  if (intervalMs === 7 * DAY) return 'Weekly burn';
  return `Burn every ${formatDuration(intervalMs)}`;
}

/** "15 days" / "1 hour" / "90 minutes": a span of burns in the cadence's own unit. */
/** "15 days" / "12.5 days" / "6 hours" / "90 minutes": how long the whole plan runs. */
function spanLabel(burns: number, intervalMs: number): string {
  const total = burns * intervalMs;
  const [unit, ms] = total >= DAY ? ['day', DAY] : total >= HOUR ? ['hour', HOUR] : ['minute', 60_000];
  const n = Math.round((total / ms) * 2) / 2;
  const text = Number.isInteger(n) ? formatWhole(n) : n.toFixed(1);
  return `${text} ${unit}${n === 1 ? '' : 's'}`;
}

/** Burns from the platform's share of trading fees run on top of the schedule; the plan wording says so. */
export const FEE_BURN_CLAUSE = '50% of platform fees collected to burn';

/** "~1% of supply will be burnt daily for 15 days = 15% supply"; the fee clause is a second line. Exported for tests. */
export function planSentence(cadence: BurnCadence, symbol: string): string {
  const share =
    cadence.stepPct != null ? `~${formatPercent(cadence.stepPct, 2)} of supply` : `~${formatWhole(cadence.stepTokens)} ${symbol}`;
  const each =
    cadence.intervalMs === DAY ? 'daily' : cadence.intervalMs === 7 * DAY ? 'weekly' : `every ${formatDuration(cadence.intervalMs)}`;
  const span = spanLabel(cadence.plannedBurns, cadence.intervalMs);
  const total = cadence.stepPct != null ? ` = ${formatPercent(cadence.stepPct * cadence.plannedBurns, 2)} supply` : '';
  return `${share} will be burnt ${each} for ${span}${total}`;
}

/** A date on the chart's axis, with the time of day when the burns are closer than days apart. */
function axisDate(ms: number, withTime: boolean): string {
  return withTime ? formatWhen(new Date(ms).toISOString()).replace(' UTC', '') : formatDate(ms);
}

function Fact({
  label,
  value,
  hint,
  tone = 'neutral',
  wrap = false,
  testId,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'neutral' | 'live';
  /** A sentence instead of a figure: smaller, wrapping. */
  wrap?: boolean;
  testId: string;
}) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <Eyebrow>{label}</Eyebrow>
      <p
        className={cn(
          'mt-0.5 font-mono font-semibold tabular-nums',
          wrap ? 'text-[11px] leading-4' : 'truncate text-sm leading-5',
          tone === 'live' ? 'text-accent-green' : 'text-text-primary',
        )}
        data-testid={`${testId}-value`}
      >
        {value}
      </p>
      {hint && (
        <p className="text-[11px] leading-4 text-text-tertiary" data-testid={`${testId}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

function BurnChart({ bars, cadence, className }: { bars: BurnBar[]; cadence: BurnCadence | null; className?: string }) {
  const max = bars.reduce((m, b) => Math.max(m, b.amount), 0);
  const done = bars.filter(b => b.state === 'done').length;
  const next = bars.filter(b => b.state === 'next').length;
  // More bars than fit at a readable width scroll sideways, opened on the next burn.
  const scrolls = bars.length > MAX_BARS;
  const scroller = useRef<HTMLDivElement>(null);
  const nextIndex = bars.findIndex(b => b.state === 'next');
  useEffect(() => {
    const el = scroller.current;
    if (!scrolls || !el) return;
    const target = nextIndex >= 0 ? nextIndex : done;
    el.scrollLeft = Math.max(0, target * (SCROLL_BAR_PX + SCROLL_GAP_PX) - el.clientWidth / 2);
  }, [scrolls, nextIndex, done]);
  if (bars.length === 0 || max <= 0) return null;
  const first = bars[0].at;
  const last = bars[bars.length - 1].at;
  const dated = first != null && last != null;
  // Hourly plans and a flywheel's clustered burns need the time of day; daily plans read as dates.
  const withTime = cadence ? cadence.intervalMs < DAY : dated && last - first < 7 * DAY;

  return (
    <figure
      className={cn('flex min-w-0 flex-col', className)}
      data-testid="burn-chart"
      data-done={done}
      data-next={next}
      data-planned={bars.length - done - next}
    >
      <div className="grid flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* The axis: the step at the top line, half of it midway, nothing at the baseline. */}
        <div className="relative w-9 text-right font-mono text-[10px] leading-none tabular-nums text-text-tertiary" aria-hidden="true">
          <span className="absolute right-0 top-0 -translate-y-1/2">{formatTokenAmount(max)}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{formatTokenAmount(max / 2)}</span>
        </div>
        <div ref={scroller} className={cn('relative min-h-0', scrolls && 'overflow-x-auto overflow-y-hidden overscroll-x-contain')} data-testid="burn-chart-scroller" data-scrolls={scrolls || undefined}>
          {/* A soft grid. */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-border-default" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border-default" />
            <div className="absolute inset-x-0 bottom-0 border-t border-border-hover" />
          </div>
          <ol
            className={cn('m-0 flex list-none items-end p-0', scrolls ? 'absolute inset-y-0 left-0 gap-[2px]' : 'absolute inset-0 gap-px sm:gap-0.5')}
            style={scrolls ? { width: `${bars.length * (SCROLL_BAR_PX + SCROLL_GAP_PX)}px` } : undefined}
            role="list"
          >
            {bars.map((bar, i) => (
              <li
                key={i}
                className={cn('relative flex h-full min-w-0 flex-col justify-end', scrolls ? 'shrink-0' : 'flex-1')}
                style={scrolls ? { width: `${SCROLL_BAR_PX}px` } : undefined}
                data-testid="burn-bar"
                data-state={bar.state}
                title={`${formatWhole(bar.amount)}${bar.at != null ? ` · ${axisDate(bar.at, withTime)}` : ''}`}
              >
                {bar.state === 'next' && (
                  <span
                    className="agent-marker-drop absolute inset-x-0 top-0 mx-auto w-px bg-text-primary"
                    style={{ bottom: `${(bar.amount / max) * 100}%` }}
                    data-testid="burn-chart-next-marker"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={cn(
                    'agent-bar-in block w-full rounded-t-[2px]',
                    bar.state === 'done' && 'bg-accent-green',
                    bar.state === 'next' && 'bg-accent-green/45 shadow-[inset_0_0_0_1px_var(--color-accent-green)]',
                    bar.state === 'planned' && 'bg-accent-green/15',
                  )}
                  style={{ height: `${(bar.amount / max) * 100}%`, animationDelay: `${Math.min(i, 40) * 25}ms` }}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
      <figcaption className="mt-1.5 flex justify-between gap-2 pl-11 font-mono text-[10px] uppercase tracking-wide tabular-nums text-text-tertiary">
        <span className="truncate">{dated ? axisDate(first, withTime) : 'first'}</span>
        <span className="truncate">{dated ? axisDate(last, withTime) : 'last'}</span>
      </figcaption>
    </figure>
  );
}

export interface BurnPanelProps extends BurnPanelInput {
  symbol: string;
  className?: string;
}

/** The newest listed burn of a plan, or null when it lists none. Exported for tests. */
export function latestBurn(plan: LedgerState<BurnPlan>): BurnEntry | null {
  if (plan.status !== 'ready') return null;
  return plan.data.recent.reduce<BurnEntry | null>((latest, entry) => {
    const at = Date.parse(entry.at);
    return Number.isFinite(at) && (latest == null || at > Date.parse(latest.at)) ? entry : latest;
  }, null);
}

/** "Buybacks burn $KNOTS as trading fees come in; no fixed schedule": a flywheel's plan in a sentence. Exported for tests. */
export function flywheelSentence(symbol: string): string {
  return `Buybacks burn $${symbol} as trading fees come in; no fixed schedule`;
}

export function BurnPanel({ symbol, className, ...input }: BurnPanelProps) {
  // Bumped when the countdown lands so the next tick is derived.
  const [clock, setClock] = useState(() => Date.now());
  const model = burnPanelModel({ ...input, now: input.now ?? clock });
  const { cadence } = model;
  const { plan } = input;
  const ready = plan.status === 'ready' ? plan.data : null;
  const pending = plan.status === 'loading' ? '…' : '-';
  const hasChart = model.bars.length > 0;
  // A ledger of burns with no plan behind them (a flywheel): the facts read the burns themselves.
  const flywheel = !cadence && ready != null && ready.burns > 0 && model.nextAt == null;
  const latest = flywheel ? latestBurn(plan) : null;

  return (
    <div
      className={cn('@container min-w-0', className)}
      data-testid="burn-panel"
      data-plan={plan.status}
      data-schedule={cadence?.source ?? 'none'}
    >
      <div className="grid gap-4 @lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] @lg:gap-6">
        <div className="flex items-center justify-center">
          <BurnRing
            symbol={symbol}
            totalSupply={model.createdSupply}
            currentSupply={model.ringSupply}
            progressPercent={model.progressPercent}
            plannedFraction={model.plannedFraction}
            nextFraction={model.nextFraction}
            size={300}
          />
        </div>

        <div className={cn('flex min-w-0 flex-col gap-3', !hasChart && '@lg:justify-center')}>
          <div
            className={cn('grid gap-x-4 gap-y-3', hasChart ? 'grid-cols-2' : 'grid-cols-2 @lg:grid-cols-1')}
            data-testid="burn-facts"
          >
            <Fact
              label="Total burn"
              value={
                model.burned != null ? (
                  <>
                    {formatWhole(model.burned)} <Unit>${symbol}</Unit>
                  </>
                ) : (
                  pending
                )
              }
              hint={model.burnedPct != null ? `${formatPercent(model.burnedPct, 2)} of supply` : undefined}
              testId="burn-fact-total"
            />
            <Fact
              label={cadence ? stepLabel(cadence.intervalMs) : flywheel ? 'Burns so far' : 'Burn cadence'}
              value={
                cadence ? (
                  <>
                    {formatWhole(cadence.stepTokens)} <Unit>{symbol}</Unit>
                  </>
                ) : flywheel && ready ? (
                  formatWhole(ready.burns)
                ) : ready || plan.status === 'not-built' || plan.status === 'idle' ? (
                  'No schedule'
                ) : (
                  pending
                )
              }
              hint={
                cadence
                  ? `≈ ${cadence.stepPct != null ? formatPercent(cadence.stepPct, 2) : '-'} of supply + protocol buybacks`
                  : latest
                    ? `latest ${formatWhole(latest.amount)} ${symbol}`
                    : undefined
              }
              testId="burn-fact-step"
            />
            <Fact
              label={flywheel ? 'Last burn' : 'Next burn in'}
              tone={model.nextAt != null ? 'live' : 'neutral'}
              value={
                model.nextAt != null ? (
                  <Countdown target={model.nextAt} onDue={() => setClock(Date.now())} testId="burn-countdown" />
                ) : latest ? (
                  formatWhen(latest.at)
                ) : ready || cadence?.complete ? (
                  'Not scheduled'
                ) : (
                  pending
                )
              }
              testId="burn-fact-next"
            />
            <Fact
              label="Flywheel"
              wrap
              value={
                cadence
                  ? cadence.complete
                    ? 'Plan complete'
                    : (
                        <>
                          <span className="block">{planSentence(cadence, symbol)}</span>
                          <span className="block">+ {FEE_BURN_CLAUSE} ${symbol}</span>
                        </>
                      )
                  : flywheel
                    ? flywheelSentence(symbol)
                    : ready || plan.status === 'not-built' || plan.status === 'idle'
                      ? 'No schedule'
                      : pending
              }
              testId="burn-fact-plan"
            />
          </div>
          <BurnChart bars={model.bars} cadence={cadence} className="min-h-40 flex-1" />
        </div>
      </div>
    </div>
  );
}
