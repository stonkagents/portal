/**
 * Purpose: The relevance helpers word the tuned thresholds against the policy
 *          threshold, count the month, and lay the ledger out as 30 days ending
 *          today with zeros where nothing happened; the form sends pins as a
 *          whole map and the slider value rounded.
 */
import { describe, it, expect } from 'vitest';
import { ledgerDayTitle, ledgerDays, percentLabel, relevanceCountersLine, sliderValueLabel, thresholdLabel, tunedLine } from '../autopilot-relevance';
import { parsePin, pinsToPolicy, policyPatch, draftFromPolicy } from '../autopilot-form';
import { DEFAULT_AUTOPILOT_POLICY } from '@/lib/api/transformers/community';

describe('tuned wording', () => {
  it('uses the daemon direction, else compares with the policy threshold, with the hit rate when known', () => {
    expect(tunedLine('request', { threshold: 0.35, hitRate: 0.1, samples: 10, direction: 'up' }, 0.25, false)).toBe('Requests: 0.35 (tuned up, 10% hit rate)');
    expect(tunedLine('general', { threshold: 0.15, hitRate: 0.55, samples: 6, direction: '' }, 0.25, false)).toBe('General: 0.15 (tuned down, 55% hit rate)');
    /* The daemon word wins over the comparison */
    expect(tunedLine('general', { threshold: 0.15, hitRate: 0.55, samples: 6, direction: 'up' }, 0.25, false)).toBe('General: 0.15 (tuned up, 55% hit rate)');
    expect(tunedLine('bounty', { threshold: 0.25, hitRate: null, samples: 0, direction: '' }, 0.25, false)).toBe('Bounties: 0.25 (unchanged)');
    expect(tunedLine('request', { threshold: 0.35, hitRate: 0.1, samples: 10, direction: 'up' }, 0.25, true)).toBe('Requests: 0.35 (pinned)');
    expect(tunedLine('other', { threshold: 0.5, hitRate: null, samples: 0, direction: '' }, 0.25, false)).toBe('other: 0.5 (tuned up)');
  });

  it('formats thresholds and rates', () => {
    expect(thresholdLabel(0.25)).toBe('0.25');
    expect(thresholdLabel(0.30000000000000004)).toBe('0.3');
    expect(sliderValueLabel(0.30000000000000004)).toBe('0.30');
    expect(sliderValueLabel(1)).toBe('1.00');
    expect(sliderValueLabel(0.25)).toBe('0.25');
    expect(percentLabel(0.375)).toBe('38%');
    expect(relevanceCountersLine({ scored: 15, skipped: 12, drafted: 3 })).toBe('Skipped 12, drafted 3 this month');
  });
});

describe('ledgerDays', () => {
  const NOW = Date.parse('2026-09-16T10:00:00Z');

  it('gives 30 columns ending today, zeros where the ledger is silent, rows on one day summed', () => {
    const days = ledgerDays(
      [
        { date: '2026-09-16', drafts: 2, hits: 1 },
        { date: '2026-09-16', drafts: 1, hits: 0 },
        { date: '2026-08-18', drafts: 4, hits: 2 },
        { date: '2026-08-17', drafts: 9, hits: 9 },
      ],
      NOW,
    );
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({ date: '2026-08-18', drafts: 4, hits: 2 });
    expect(days[29]).toEqual({ date: '2026-09-16', drafts: 3, hits: 1 });
    expect(days[15]).toEqual({ date: '2026-09-02', drafts: 0, hits: 0 });
  });

  it('titles a column with the day and its counts', () => {
    expect(ledgerDayTitle({ date: '2026-09-16', drafts: 1, hits: 0 })).toBe('Sep 16: 1 draft, 0 hits');
    expect(ledgerDayTitle({ date: '2026-09-15', drafts: 2, hits: 1 })).toBe('Sep 15: 2 drafts, 1 hit');
  });
});

describe('pins', () => {
  it('parses a pin as empty, a number in 0.1..1, or refused', () => {
    expect(parsePin('')).toBeUndefined();
    expect(parsePin(' 0.4 ')).toBe(0.4);
    expect(parsePin('1.5')).toBeNull();
    expect(parsePin('0.05')).toBeNull();
    expect(parsePin('0.1')).toBe(0.1);
    expect(parsePin('abc')).toBeNull();
    expect(pinsToPolicy({ request: '0.4', general: '' })).toEqual({ request: 0.4 });
    expect(pinsToPolicy({ request: '2' })).toBeNull();
  });

  it('patches the whole map when a pin changes, and nothing when the draft matches the policy', () => {
    const saved = { ...DEFAULT_AUTOPILOT_POLICY, relevanceThresholdByCategory: { request: 0.4 } };
    const draft = draftFromPolicy(saved);
    expect(draft.relevancePins).toEqual({ request: '0.4' });
    expect(policyPatch(draft, saved, '')).toEqual({});
    expect(policyPatch({ ...draft, relevancePins: { request: '', general: '0.3' } }, saved, '')).toEqual({
      relevanceThresholdByCategory: { general: 0.3 },
    });
    /* Clearing the last pin sends null: absent would keep the stored map */
    expect(policyPatch({ ...draft, relevancePins: { request: '' } }, saved, '')).toEqual({ relevanceThresholdByCategory: null });
    expect(policyPatch({ ...draft, relevanceThreshold: 0.30000000000000004 }, saved, '')).toEqual({ relevanceThreshold: 0.3 });
    expect(policyPatch({ ...draft, relevanceMode: 'off' }, saved, '')).toEqual({ relevanceMode: 'off' });
  });
});
