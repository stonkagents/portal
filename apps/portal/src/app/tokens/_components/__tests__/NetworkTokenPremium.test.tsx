/**
 * The premium network-token pieces: the burn schedule math and the supply
 * ring, the burn panel (its cadence, its bars, its four facts), the live
 * countdown and the team vesting track. Pure helpers are tested as functions;
 * the components for what they say, link to and mark.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  burnSchedule,
  formatDuration,
  parseDuration,
  quarterLabel,
  vestingTimeline,
  type BurnScheduleConfig,
  type VestingConfig,
} from '@/lib/agent-token';
import type { BurnPlan, LedgerState } from '@/lib/api/hooks/use-agent-ledgers';
import { BurnPanel, burnBars, burnCadence, flywheelSentence, latestBurn, planSentence, stepLabel } from '../BurnPanel';
import { BurnRing, RING_MIN_FRACTION, ringFraction } from '../BurnRing';
import { Countdown, formatCountdown } from '../Countdown';
import { formatDate } from '../NetworkTokenPrimitives';
import { TeamVestingBlock, vestingStatus } from '../TeamVestingBlock';

const DAY = 86_400_000;
const HOUR = 3_600_000;

describe('burn schedule', () => {
  const cfg: BurnScheduleConfig = { totalPct: 15, stepPct: 1, intervalMs: DAY, start: null };

  it('parses durations in short and ISO-8601 form', () => {
    expect(parseDuration('1d')).toBe(DAY);
    expect(parseDuration('12h')).toBe(12 * HOUR);
    expect(parseDuration('30m')).toBe(30 * 60_000);
    expect(parseDuration('P1D')).toBe(DAY);
    expect(parseDuration('PT1H')).toBe(HOUR);
    expect(parseDuration('P1DT12H')).toBe(DAY + 12 * HOUR);
    expect(parseDuration('PT30M')).toBe(30 * 60_000);
    expect(parseDuration('nope')).toBeNull();
    expect(parseDuration('0h')).toBeNull();
    expect(parseDuration('')).toBeNull();
    expect(formatDuration(DAY)).toBe('1d');
    expect(formatDuration(HOUR)).toBe('1h');
    expect(formatDuration(90_000)).toBe('90s');
  });

  it('derives the plan, the burns done from the chain, and the next tick after now', () => {
    const start = Date.parse('2026-09-13T20:00:00Z');
    const now = start + 2 * DAY + HOUR;
    const s = burnSchedule({ totalSupply: 1e9, burned: 25_000_000, start: '2026-09-13T20:00:00Z', now }, cfg);
    expect(s.plannedTokens).toBe(150_000_000);
    expect(s.stepTokens).toBe(10_000_000);
    expect(s.plannedBurns).toBe(15);
    expect(s.burnsDone).toBe(2);
    expect(s.plannedFraction).toBeCloseTo(0.15);
    expect(s.progress).toBeCloseTo(25_000_000 / 150_000_000);
    expect(s.startAt).toBe(start);
    expect(s.nextAt).toBe(start + 3 * DAY);
    expect(s.complete).toBe(false);
  });

  it('starts at the start when it is still ahead, and stops once the plan is complete or the ticks run out', () => {
    const start = Date.parse('2026-09-14T00:00:00Z');
    expect(burnSchedule({ totalSupply: 1e9, burned: 0, start: '2026-09-14T00:00:00Z', now: start - HOUR }, cfg).nextAt).toBe(start);
    const done = burnSchedule({ totalSupply: 1e9, burned: 150_000_000, start: '2026-09-14T00:00:00Z', now: start + HOUR }, cfg);
    expect(done.complete).toBe(true);
    expect(done.burnsDone).toBe(15);
    expect(done.nextAt).toBeNull();
    expect(burnSchedule({ totalSupply: 1e9, burned: 0, start: '2026-09-14T00:00:00Z', now: start + 20 * DAY }, cfg).nextAt).toBeNull();
    expect(burnSchedule({ totalSupply: 1e9, burned: 0, start: null, now: start }, cfg).nextAt).toBeNull();
    // A configured start wins over the launch time.
    const pinned = burnSchedule(
      { totalSupply: 1e9, burned: 0, start: '2026-09-14T00:00:00Z', now: start },
      { ...cfg, start: '2026-09-15T00:00:00Z' },
    );
    expect(pinned.nextAt).toBe(start + DAY);
  });

  it('demos on devnet at an hourly cadence: 0.75% in 15 steps of 0.05%', () => {
    const hourly: BurnScheduleConfig = { totalPct: 0.75, stepPct: 0.05, intervalMs: HOUR, start: '2026-09-13T22:00:00Z' };
    const start = Date.parse('2026-09-13T22:00:00Z');
    const s = burnSchedule({ totalSupply: 1e9, burned: 1_250_000, now: start + 90 * 60_000 }, hourly);
    expect(s.plannedTokens).toBe(7_500_000);
    expect(s.stepTokens).toBe(500_000);
    expect(s.plannedBurns).toBe(15);
    expect(s.burnsDone).toBe(2);
    expect(s.nextAt).toBe(start + 2 * HOUR);
  });
});

describe('BurnRing', () => {
  it('draws the burned share as a slice, never less than a lit dot once anything is burned', () => {
    expect(ringFraction(0, 1e9)).toBe(0);
    expect(ringFraction(null, 1e9)).toBe(0);
    expect(ringFraction(1_000_000, 1e9)).toBe(RING_MIN_FRACTION);
    expect(ringFraction(250_000_000, 1e9)).toBe(0.25);
    expect(ringFraction(2e9, 1e9)).toBe(1);
  });

  it('reads what is left in the centre, the burned percent, the planned arc and the next-burn tick', () => {
    render(
      <BurnRing
        symbol="AGENT"
        totalSupply={1e9}
        currentSupply={998_750_000}
        progressPercent={0.125}
        plannedFraction={0.15}
        nextFraction={0.01125}
      />,
    );
    expect(screen.getByTestId('burn-remaining')).toHaveTextContent('998,750,000');
    expect(screen.getByTestId('burn-ring-percent')).toHaveTextContent('0.13% burned');
    expect(screen.getByRole('progressbar', { name: 'AGENT burned' })).toHaveAttribute('aria-valuenow', '0.125');
    expect(screen.getByTestId('burn-ring-tick')).toHaveAttribute('transform', expect.stringContaining('rotate(4.05'));
  });

  it('reads "-" before the mint has answered, with no tick', () => {
    render(<BurnRing symbol="AGENT" totalSupply={1e9} currentSupply={null} progressPercent={null} />);
    expect(screen.getByTestId('burn-remaining')).toHaveTextContent('-');
    expect(screen.getByTestId('burn-ring-percent')).toHaveTextContent('-');
    expect(screen.queryByTestId('burn-ring-tick')).toBeNull();
  });
});

const NOW = Date.parse('2026-09-14T13:30:00Z');

function ready(overrides: Partial<BurnPlan> = {}): LedgerState<BurnPlan> {
  return {
    status: 'ready',
    data: {
      mint: null,
      total: 1_000_000_000,
      planTotal: 7_500_000,
      burned: 0,
      remaining: 1_000_000_000,
      burns: 0,
      next: { at: '2026-09-14T14:14:31Z', amount: 500_000 },
      schedule: { intervalSeconds: 3600, startAt: '2026-09-14T11:14:31Z', amount: 500_000 },
      recent: [],
      ...overrides,
    },
  };
}

describe('burnCadence', () => {
  it("takes the tracker's plan: 15 hourly burns, the next one as the tracker states it", () => {
    const c = burnCadence({ createdSupply: 1e9, burned: 0, plan: ready() }, NOW);
    expect(c).not.toBeNull();
    expect(c!.source).toBe('ledger');
    expect(c!.plannedBurns).toBe(15);
    expect(c!.stepTokens).toBe(500_000);
    expect(c!.stepPct).toBeCloseTo(0.05);
    expect(c!.remainingBurns).toBe(15);
    expect(c!.startAt).toBe(Date.parse('2026-09-14T11:14:31Z'));
    expect(c!.nextAt).toBe(Date.parse('2026-09-14T14:14:31Z'));
    // The last burn is counted on from the next one, not from a start the keeper has run past.
    expect(c!.endAt).toBe(Date.parse('2026-09-14T14:14:31Z') + 14 * HOUR);
    expect(c!.complete).toBe(false);
  });

  it('walks the start back from the next burn when neither the tracker nor the env states one', () => {
    const plan = ready({ burns: 3, burned: 1_500_000, schedule: { intervalSeconds: 3600, startAt: null, amount: 500_000 } });
    const c = burnCadence({ createdSupply: null, burned: 1_500_000, plan }, NOW);
    expect(c!.startAt).toBe(Date.parse('2026-09-14T14:14:31Z') - 3 * HOUR);
    expect(c!.burnsDone).toBe(3);
    expect(c!.remainingBurns).toBe(12);
    // No supply anywhere: the step is tokens only.
    expect(c!.stepPct).toBeNull();
  });

  it('falls back to the environment schedule when the tracker has no plan, counting burns off the chain', () => {
    const c = burnCadence(
      {
        createdSupply: 1e9,
        burned: 1_250_000,
        plan: { status: 'idle' },
        schedule: { totalPct: 0.75, stepPct: 0.05, intervalMs: HOUR, start: '2026-09-14T11:00:00Z' },
      },
      NOW,
    );
    expect(c!.source).toBe('config');
    expect(c!.planTokens).toBe(7_500_000);
    expect(c!.stepTokens).toBe(500_000);
    expect(c!.plannedBurns).toBe(15);
    expect(c!.burnsDone).toBe(2);
    expect(c!.remainingBurns).toBe(13);
    expect(c!.nextAt).toBe(Date.parse('2026-09-14T14:00:00Z'));
    // No start anywhere: the cadence stands, the next burn is unknown.
    const unstarted = burnCadence(
      {
        createdSupply: 1e9,
        burned: 0,
        plan: { status: 'not-built' },
        schedule: { totalPct: 15, stepPct: 1, intervalMs: DAY, start: null },
      },
      NOW,
    );
    expect(unstarted!.nextAt).toBeNull();
    expect(unstarted!.endAt).toBeNull();
  });

  it('is null without a cadence, and complete once every burn is done', () => {
    expect(burnCadence({ createdSupply: 1e9, burned: 0, plan: ready({ schedule: null }) }, NOW)).toBeNull();
    expect(burnCadence({ createdSupply: null, burned: null, plan: { status: 'idle' } }, NOW)).toBeNull();
    const done = burnCadence(
      { createdSupply: 1e9, burned: 7_500_000, plan: ready({ burns: 15, burned: 7_500_000, next: null }) },
      NOW,
    );
    expect(done!.complete).toBe(true);
    expect(done!.nextAt).toBeNull();
    expect(done!.remainingBurns).toBe(0);
  });

  it('finds the newest listed burn whatever order the ledger lists them in, and none for an empty or unserved ledger', () => {
    const listed = ready({
      recent: [
        { at: '2026-09-14T16:05:53Z', amount: 200, sig: 'Y' },
        { at: 'not a date', amount: 9, sig: 'Z' },
        { at: '2026-09-14T16:15:58Z', amount: 7_043, sig: 'X' },
      ],
    });
    expect(latestBurn(listed)?.sig).toBe('X');
    expect(latestBurn(ready({ recent: [] }))).toBeNull();
    expect(latestBurn({ status: 'not-built' })).toBeNull();
    expect(flywheelSentence('KNOTS')).toBe('Buybacks burn $KNOTS as trading fees come in; no fixed schedule');
  });
});

describe('burnBars and the plan words', () => {
  it('draws one bar per planned burn: the done ones, the next, the rest planned', () => {
    const plan = ready({
      burns: 2,
      burned: 1_000_000,
      recent: [
        { at: '2026-09-14T13:14:31Z', amount: 480_000, sig: 'B' },
        { at: '2026-09-14T12:14:31Z', amount: 520_000, sig: 'A' },
      ],
    });
    const bars = burnBars(burnCadence({ createdSupply: 1e9, burned: 1_000_000, plan }, NOW), plan);
    expect(bars).toHaveLength(15);
    expect(bars.map(b => b.state)).toEqual(['done', 'done', 'next', ...Array<'planned'>(12).fill('planned')]);
    // Listed burns carry their own amounts and times; the rest are the step, an hour apart from the next.
    expect(bars[0]).toEqual({ state: 'done', amount: 520_000, at: Date.parse('2026-09-14T12:14:31Z') });
    expect(bars[1].amount).toBe(480_000);
    expect(bars[2]).toEqual({ state: 'next', amount: 500_000, at: Date.parse('2026-09-14T14:14:31Z') });
    expect(bars[14].at).toBe(Date.parse('2026-09-14T14:14:31Z') + 12 * HOUR);
  });

  it('draws every hourly burn (the chart scrolls), buckets a long daily plan, and lists the ledger burns alone without a cadence', () => {
    const c = burnCadence(
      {
        createdSupply: 1e9,
        burned: 0,
        plan: { status: 'idle' },
        schedule: { totalPct: 75, stepPct: 0.05, intervalMs: HOUR, start: '2026-09-14T11:00:00Z' },
      },
      NOW,
    );
    const bars = burnBars(c, { status: 'idle' }, 60);
    expect(c!.plannedBurns).toBe(1500);
    expect(bars).toHaveLength(1500);
    expect(bars[0].amount).toBe(500_000);
    expect(bars[0].state).toBe('next');
    const daily = burnCadence(
      { createdSupply: 1e9, burned: 0, plan: { status: 'idle' }, schedule: { totalPct: 75, stepPct: 0.05, intervalMs: DAY, start: '2026-09-14T11:00:00Z' } },
      NOW,
    );
    const dailyBars = burnBars(daily, { status: 'idle' }, 60);
    expect(dailyBars).toHaveLength(60);
    expect(dailyBars[0].amount).toBe(25 * 500_000);
    const flywheel = ready({
      planTotal: null,
      schedule: null,
      next: null,
      burns: 2,
      recent: [
        { at: '2026-09-13T12:00:00Z', amount: 7_043, sig: 'X' },
        { at: '2026-09-12T12:00:00Z', amount: 200, sig: 'Y' },
        { at: 'nope', amount: 5, sig: 'Z' },
      ],
    });
    expect(burnBars(null, flywheel)).toEqual([
      { state: 'done', amount: 200, at: Date.parse('2026-09-12T12:00:00Z') },
      { state: 'done', amount: 7_043, at: Date.parse('2026-09-13T12:00:00Z') },
    ]);
    expect(burnBars(null, { status: 'not-built' })).toEqual([]);
  });

  it('names the cadence and writes the plan in a sentence from the schedule', () => {
    expect(stepLabel(DAY)).toBe('Daily burn');
    expect(stepLabel(7 * DAY)).toBe('Weekly burn');
    expect(stepLabel(HOUR)).toBe('Burn every 1h');
    const daily = burnCadence(
      {
        createdSupply: 1e9,
        burned: 20_000_000,
        plan: { status: 'not-built' },
        schedule: { totalPct: 15, stepPct: 1, intervalMs: DAY, start: '2026-09-14T00:00:00Z' },
      },
      NOW,
    )!;
    expect(planSentence(daily, 'AGENT')).toBe('~1% of supply will be burnt daily for 15 days = 15% supply');
    const hourly = burnCadence({ createdSupply: 1e9, burned: 0, plan: ready({ burns: 14 }) }, NOW)!;
    expect(planSentence(hourly, 'AGENT')).toBe('~0.05% of supply will be burnt every 1h for 15 hours = 0.75% supply');
    const twoDaily = burnCadence(
      {
        createdSupply: 1e9,
        burned: 0,
        plan: { status: 'not-built' },
        schedule: { totalPct: 10, stepPct: 1, intervalMs: 2 * DAY, start: null },
      },
      NOW,
    )!;
    expect(planSentence(twoDaily, 'AGENT')).toBe('~1% of supply will be burnt every 2d for 20 days = 10% supply');
    const noSupply = burnCadence({ createdSupply: null, burned: null, plan: ready({ total: 0 }) }, NOW)!;
    expect(planSentence(noSupply, 'AGENT')).toBe('~500,000 AGENT will be burnt every 1h for 15 hours');
  });
});

describe('BurnPanel', () => {
  const hourly: BurnScheduleConfig = { totalPct: 0.75, stepPct: 0.05, intervalMs: HOUR, start: null };
  const daily: BurnScheduleConfig = { totalPct: 15, stepPct: 1, intervalMs: DAY, start: null };

  it('draws the ring, the four facts and the chart from the environment schedule, at the real cadence', () => {
    const launchedAt = new Date(Date.now() - 2.5 * HOUR).toISOString();
    render(
      <BurnPanel
        symbol="AGENT"
        totalSupply={1e9}
        currentSupply={998_750_000}
        plan={{ status: 'not-built' }}
        schedule={hourly}
        launchedAt={launchedAt}
      />,
    );
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-schedule', 'config');
    expect(screen.getByTestId('burn-remaining')).toHaveTextContent('998,750,000');
    expect(screen.getByTestId('burn-fact-total')).toHaveTextContent('Total burn');
    expect(screen.getByTestId('burn-fact-total-value')).toHaveTextContent('1,250,000 $AGENT');
    expect(screen.getByTestId('burn-fact-total-hint')).toHaveTextContent('0.13% of supply');
    expect(screen.getByTestId('burn-fact-step')).toHaveTextContent('Burn every 1h');
    expect(screen.getByTestId('burn-fact-step-value')).toHaveTextContent('500,000 AGENT');
    expect(screen.getByTestId('burn-fact-step-hint')).toHaveTextContent('≈ 0.05% of supply + protocol buybacks');
    expect(screen.getByTestId('burn-fact-next')).toHaveTextContent('Next burn in');
    expect(screen.getByTestId('burn-countdown')).toHaveTextContent(/^00:[0-2]\d:\d{2}$/);
    expect(screen.getByTestId('burn-fact-plan')).toHaveTextContent('Flywheel');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent(
      '0.05% of supply will be burnt every 1h for 15 hours = 0.75% supply',
    );
    const chart = screen.getByTestId('burn-chart');
    expect(chart).toHaveAttribute('data-done', '2');
    expect(chart).toHaveAttribute('data-next', '1');
    expect(chart).toHaveAttribute('data-planned', '12');
    expect(within(chart).getAllByTestId('burn-bar')).toHaveLength(15);
    expect(within(chart).getByTestId('burn-chart-next-marker')).toBeInTheDocument();
    // The ring runs toward the plan: 1.25M of 7.5M.
    expect(screen.getByRole('progressbar', { name: 'AGENT burned' })).toHaveAttribute(
      'aria-valuenow',
      String((1_250_000 / 7_500_000) * 100),
    );
    expect(screen.getByTestId('burn-ring-tick')).toBeInTheDocument();
    // Nothing from the old blocks.
    expect(screen.queryByText(/Burning \$/)).toBeNull();
    expect(screen.queryByText(/^of 1,000,000,000/)).toBeNull();
    expect(screen.queryByText(/^(schedule|ledger)$/)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says "Daily burn" and counts the plan in days for a daily schedule', () => {
    render(
      <BurnPanel
        symbol="AGENT"
        totalSupply={1e9}
        currentSupply={980_000_000}
        plan={{ status: 'not-built' }}
        schedule={{ ...daily, start: new Date(Date.now() - 2.5 * DAY).toISOString() }}
      />,
    );
    expect(screen.getByTestId('burn-fact-step')).toHaveTextContent('Daily burn');
    expect(screen.getByTestId('burn-fact-step-value')).toHaveTextContent('10,000,000 AGENT');
    expect(screen.getByTestId('burn-fact-step-hint')).toHaveTextContent('≈ 1% of supply + protocol buybacks');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('1% of supply will be burnt daily for 15 days = 15% supply');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-done', '2');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-planned', '12');
  });

  it("lets the tracker's plan override the schedule once it is served", () => {
    const next = new Date(Date.now() + 5 * HOUR).toISOString();
    render(
      <BurnPanel
        symbol="AGENT"
        totalSupply={1e9}
        currentSupply={998_750_000}
        plan={ready({ burned: 1_250_000, burns: 3, next: { at: next, amount: 500_000 } })}
        schedule={hourly}
        launchedAt={new Date().toISOString()}
      />,
    );
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-schedule', 'ledger');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('for 15 hours');
    expect(screen.getByTestId('burn-countdown')).toHaveTextContent(/^0?4:59:5\d$|^05:00:00$/);
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-done', '3');
  });

  it('shows "No schedule" and no chart without a cadence, and the ledger burns alone when it lists them', () => {
    const { rerender } = render(<BurnPanel symbol="HOUND" totalSupply={1e9} currentSupply={1e9} plan={{ status: 'not-built' }} />);
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-schedule', 'none');
    expect(screen.getByTestId('burn-fact-total-value')).toHaveTextContent('0 $HOUND');
    expect(screen.getByTestId('burn-fact-step-value')).toHaveTextContent('No schedule');
    expect(screen.getByTestId('burn-fact-next-value')).toHaveTextContent('-');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('No schedule');
    expect(screen.queryByTestId('burn-chart')).toBeNull();
    expect(screen.queryByTestId('burn-fact-step-hint')).toBeNull();
    expect(screen.queryByTestId('burn-fact-plan-hint')).toBeNull();

    rerender(<BurnPanel symbol="HOUND" totalSupply={null} currentSupply={null} plan={{ status: 'loading' }} />);
    expect(screen.getByTestId('burn-remaining')).toHaveTextContent('-');
    expect(screen.getByTestId('burn-fact-total-value')).toHaveTextContent('…');
    expect(screen.getByTestId('burn-fact-next-value')).toHaveTextContent('…');

    // A flywheel: burns listed, no target, no cadence.
    const flywheel = ready({
      planTotal: null,
      schedule: null,
      next: null,
      burns: 1966,
      burned: 1_275_455,
      recent: [
        { at: '2026-09-14T16:15:58Z', amount: 7_043, sig: 'X' },
        { at: '2026-09-14T16:05:53Z', amount: 200, sig: 'Y' },
      ],
    });
    rerender(<BurnPanel symbol="KNOTS" totalSupply={null} currentSupply={998_724_545} plan={flywheel} />);
    expect(screen.getByTestId('burn-fact-total-value')).toHaveTextContent('1,275,455 $KNOTS');
    expect(screen.getByTestId('burn-fact-total-hint')).toHaveTextContent('0.13% of supply');
    // The burns themselves stand in for a schedule: how many, the latest one, and that there is no cadence.
    expect(screen.getByTestId('burn-fact-step')).toHaveTextContent('Burns so far');
    expect(screen.getByTestId('burn-fact-step-value')).toHaveTextContent('1,966');
    expect(screen.getByTestId('burn-fact-step-hint')).toHaveTextContent('latest 7,043 KNOTS');
    expect(screen.getByTestId('burn-fact-next')).toHaveTextContent('Last burn');
    expect(screen.getByTestId('burn-fact-next-value')).toHaveTextContent('Sep 14, 16:15 UTC');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent(flywheelSentence('KNOTS'));
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('no fixed schedule');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-done', '2');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-planned', '0');
    expect(screen.getByTestId('burn-chart')).toHaveTextContent('Sep 14, 16:05');
    // No plan target: nothing is dressed up as progress toward one.
    expect(screen.getByRole('progressbar', { name: 'KNOTS burned' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('says the plan is complete once every burn is done', () => {
    render(
      <BurnPanel
        symbol="AGENT"
        totalSupply={1e9}
        currentSupply={992_500_000}
        plan={ready({ burns: 15, burned: 7_500_000, next: null })}
      />,
    );
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('Plan complete');
    expect(screen.getByTestId('burn-fact-next-value')).toHaveTextContent('Not scheduled');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-done', '15');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-next', '0');
  });
});

describe('Countdown', () => {
  it('formats hh:mm:ss with days in front, and "due" at zero', () => {
    expect(formatCountdown(4 * HOUR + 12 * 60_000 + 33_000)).toBe('04:12:33');
    expect(formatCountdown(2 * DAY + 4 * HOUR + 12 * 60_000 + 33_000)).toBe('2d 04:12:33');
    expect(formatCountdown(0)).toBe('due');
    expect(formatCountdown(-5)).toBe('due');
    expect(formatCountdown(Number.NaN)).toBe('due');
  });

  it('ticks the text node and fires once when the target passes', () => {
    vi.useFakeTimers();
    try {
      const onDue = vi.fn();
      render(<Countdown target={Date.now() + 2_500} onDue={onDue} testId="cd" />);
      expect(screen.getByTestId('cd')).toHaveTextContent('00:00:02');
      vi.advanceTimersByTime(1_000);
      expect(screen.getByTestId('cd')).toHaveTextContent('00:00:01');
      vi.advanceTimersByTime(2_000);
      expect(screen.getByTestId('cd')).toHaveTextContent('due');
      vi.advanceTimersByTime(2_000);
      expect(onDue).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('team vesting', () => {
  const cfg: VestingConfig = { teamPct: 5, lockDate: '2027-01-15', cliffDate: '2027-04-01', cadence: 'weekly', months: 18, url: null };

  it('places lock, cliff and full unlock on a track that starts today', () => {
    const now = Date.parse('2026-09-13T22:00:00Z');
    const t = vestingTimeline(cfg, now);
    expect(t.phase).toBe('before-lock');
    expect(t.lockAt).toBe(Date.parse('2027-01-15'));
    expect(t.cliffAt).toBe(Date.parse('2027-04-01'));
    expect(t.endAt).toBe(Date.parse('2028-10-01'));
    expect(t.domainStart).toBe(now);
    expect(t.todayFrac).toBe(0);
    expect(t.lockFrac).toBeGreaterThan(0);
    expect(t.cliffFrac).toBeGreaterThan(t.lockFrac);
    expect(t.unlockedFrac).toBe(0);
    expect(t.daysToLock).toBe(124);
    expect(t.lockedUntilLabel).toBe('Q1 2027');
    expect(quarterLabel(Date.parse('2027-04-01'))).toBe('Q2 2027');
    expect(formatDate(t.lockAt)).toBe('Jan 15, 2027');
  });

  it('moves through locked, unlocking by the cadence, and unlocked', () => {
    const locked = vestingTimeline(cfg, Date.parse('2027-02-01'));
    expect(locked.phase).toBe('locked');
    expect(locked.domainStart).toBe(locked.lockAt);
    expect(locked.daysToLock).toBe(0);
    expect(vestingStatus(locked).text).toMatch(/^cliff in \d+d$/);
    const unlocking = vestingTimeline(cfg, Date.parse('2027-04-01') + 10 * DAY);
    expect(unlocking.phase).toBe('unlocking');
    // One whole week of eighteen months.
    expect(unlocking.unlockedFrac).toBeCloseTo((7 * DAY) / (unlocking.endAt - unlocking.cliffAt), 6);
    expect(vestingStatus(unlocking).text).toBe('unlocking weekly');
    const done = vestingTimeline(cfg, Date.parse('2029-01-01'));
    expect(done.phase).toBe('unlocked');
    expect(done.unlockedFrac).toBe(1);
    expect(vestingStatus(done)).toEqual({ text: 'fully unlocked', tone: 'neutral' });
  });

  it('renders the allocation, the track, the countdown tag and the cadence, and nothing about a wallet or a stream it cannot show', () => {
    const timeline = vestingTimeline(cfg, Date.parse('2026-09-13T22:00:00Z'));
    render(<TeamVestingBlock symbol="AGENT" allocationTokens={5e7} config={cfg} timeline={timeline} variant="full" />);
    expect(screen.getByTestId('fees-went-vesting')).toHaveAttribute('data-phase', 'before-lock');
    expect(screen.getByTestId('fees-went-vesting-amount')).toHaveTextContent('50,000,000 AGENT');
    expect(screen.getByTestId('vesting-phase-tag')).toHaveTextContent('locks in 124d');
    expect(screen.getByTestId('vesting-cadence-tag')).toHaveTextContent('weekly unlocks after Q1 2027');
    expect(screen.getByTestId('vesting-copy')).toHaveTextContent(
      'Team tokens locked until Q1 2027, then weekly unlocks over 18 months.',
    );
    expect(screen.getByTestId('vesting-track')).toHaveTextContent('');
    expect(screen.getByTestId('vesting-lock-marker')).toHaveClass('agent-marker-drop');
    expect(screen.getByTestId('vesting-today')).toHaveStyle({ left: '0.00%' });
    expect(screen.getByText('lock Jan 15, 2027')).toBeInTheDocument();
    expect(screen.getByText('full Oct 1, 2028')).toBeInTheDocument();
    // The creator wallet is the burn wallet, not the team's: no "held of the allocation", no placeholder stream tag.
    expect(screen.queryByTestId('vesting-held')).toBeNull();
    expect(screen.queryByTestId('vesting-creator')).toBeNull();
    expect(screen.queryByText(/held of the/)).toBeNull();
    expect(screen.queryByTestId('vesting-stream-placeholder')).toBeNull();
    expect(screen.queryByText(/Streamflow/)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('links the vesting contract once one is configured, and reads "-" for the allocation before the supply is known', () => {
    const timeline = vestingTimeline(cfg);
    render(
      <TeamVestingBlock
        symbol="AGENT"
        allocationTokens={null}
        config={{ ...cfg, url: 'https://app.streamflow.finance/contract/solana/mainnet/8WKb' }}
        timeline={timeline}
      />,
    );
    expect(screen.getByRole('link', { name: /Vesting contract/ })).toHaveAttribute(
      'href',
      'https://app.streamflow.finance/contract/solana/mainnet/8WKb',
    );
    expect(screen.getByTestId('fees-went-vesting-amount')).toHaveTextContent('-');
  });
});
