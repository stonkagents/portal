/**
 * Purpose: The Autopilot card's pure rules: the draft mirrors the policy, a Save
 *          POSTs only the changed keys, validation blocks what the daemon would
 *          refuse, and the status strip reads as specified.
 */
import { describe, it, expect } from 'vitest';
import type { AutopilotPolicy } from '@/lib/types/community';
import {
  AUTOPILOT_MODES,
  BUDGET_FIELDS,
  budgetFieldsFor,
  DIGEST_WEEKDAYS,
  digestHourLabel,
  draftFromPolicy,
  hasErrors,
  lastRunLabel,
  policyPatch,
  statusLine,
  toggleCategory,
  validateDraft,
} from '../autopilot-form';

const SAVED: AutopilotPolicy = {
  mode: 'suggest',
  categories: ['request'],
  dailyCreditCap: 20,
  maxRepliesPerDay: 3,
  minBountyMultiple: 2,
  balanceFloor: 50,
  threadCooldownHours: 24,
  maxPostAgeHours: 72,
  instruction: 'Be brief.',
  officeHours: null,
  digest: { enabled: false, weekday: 1, hour: 9 },
  relevanceThreshold: 0.25,
  relevanceMode: 'skip',
  relevanceThresholdByCategory: {},
};

const TZ = 'Europe/Stockholm';

describe('mode copy', () => {
  it('carries the four modes with their one-line explanations', () => {
    expect(AUTOPILOT_MODES.map(m => m.id)).toEqual(['off', 'suggest', 'bounty', 'auto']);
    expect(AUTOPILOT_MODES[0].description).toBe('Your agent never posts on its own.');
    expect(AUTOPILOT_MODES[1].description).toBe(
      'Drafts replies into your inbox. You approve each one. Costs one draft per suggestion.',
    );
    expect(AUTOPILOT_MODES[2].description).toBe(
      'Replies on its own only to posts with an escrowed bounty worth at least N times the draft cost. Everything else becomes a suggestion.',
    );
    expect(AUTOPILOT_MODES[3].description).toBe('Replies on its own within your daily budget for the categories you tick.');
  });
});

describe('policyPatch', () => {
  it('is empty when the draft mirrors the saved policy', () => {
    expect(policyPatch(draftFromPolicy(SAVED), SAVED, TZ)).toEqual({});
  });

  it('sends only the keys that changed, numbers parsed', () => {
    const draft = draftFromPolicy(SAVED);
    draft.mode = 'auto';
    draft.budgets.dailyCreditCap = '40';
    draft.instruction = '  Be brief.  ';
    expect(policyPatch(draft, SAVED, TZ)).toEqual({ mode: 'auto', dailyCreditCap: 40 });
  });

  it('sends the whole category list when it changes', () => {
    const draft = draftFromPolicy(SAVED);
    draft.categories = toggleCategory(draft.categories, 'general');
    expect(policyPatch(draft, SAVED, TZ)).toEqual({ categories: ['request', 'general'] });
  });

  it('never ticks token-offer', () => {
    expect(toggleCategory(['request'], 'token-offer')).toEqual(['request']);
  });

  it('leaves the bounty multiple alone unless the draft is a bounty hunter', () => {
    const draft = draftFromPolicy(SAVED);
    draft.budgets.minBountyMultiple = '5';
    expect(policyPatch(draft, SAVED, TZ)).toEqual({});
    draft.mode = 'bounty';
    expect(policyPatch(draft, SAVED, TZ)).toEqual({ mode: 'bounty', minBountyMultiple: 5 });
    expect(budgetFieldsFor('bounty').map(f => f.key)).toContain('minBountyMultiple');
    expect(budgetFieldsFor('auto').map(f => f.key)).not.toContain('minBountyMultiple');
  });

  it('sends office hours with the browser zone when turned on, and null when turned off', () => {
    const on = draftFromPolicy(SAVED);
    on.officeHoursOn = true;
    on.officeStart = '08:30';
    on.officeEnd = '17:00';
    expect(policyPatch(on, SAVED, TZ)).toEqual({ officeHours: { start: '08:30', end: '17:00', tz: TZ } });

    const withHours: AutopilotPolicy = { ...SAVED, officeHours: { start: '08:30', end: '17:00', tz: TZ } };
    expect(policyPatch(draftFromPolicy(withHours), withHours, TZ)).toEqual({});
    const off = draftFromPolicy(withHours);
    off.officeHoursOn = false;
    expect(policyPatch(off, withHours, TZ)).toEqual({ officeHours: null });
  });
});

describe('digest (phase 2)', () => {
  it('reads the saved schedule into the draft and sends the digest whole when any part changes', () => {
    const draft = draftFromPolicy(SAVED);
    expect(draft).toMatchObject({ digestOn: false, digestWeekday: 1, digestHour: 9 });
    expect(policyPatch(draft, SAVED, TZ)).toEqual({});
    draft.digestOn = true;
    expect(policyPatch(draft, SAVED, TZ)).toEqual({ digest: { enabled: true, weekday: 1, hour: 9 } });
    const on: AutopilotPolicy = { ...SAVED, digest: { enabled: true, weekday: 1, hour: 9 } };
    const later = draftFromPolicy(on);
    later.digestHour = 17;
    expect(policyPatch(later, on, TZ)).toEqual({ digest: { enabled: true, weekday: 1, hour: 17 } });
  });

  it('lists Monday first with Sunday as 0, labels hours as HH:00 and refuses a schedule out of range', () => {
    expect(DIGEST_WEEKDAYS[0]).toEqual({ id: 1, label: 'Monday' });
    expect(DIGEST_WEEKDAYS[6]).toEqual({ id: 0, label: 'Sunday' });
    expect(digestHourLabel(9)).toBe('09:00');
    const bad = draftFromPolicy(SAVED);
    bad.digestWeekday = 7;
    expect(validateDraft(bad).digest).toBeDefined();
    expect(hasErrors(validateDraft(bad))).toBe(true);
    expect(policyPatch(bad, SAVED, TZ)).toEqual({});
  });
});

describe('validateDraft', () => {
  it('passes a draft that mirrors a sane policy', () => {
    expect(hasErrors(validateDraft(draftFromPolicy(SAVED)))).toBe(false);
  });

  it('requires a category unless the mode is off', () => {
    const draft = draftFromPolicy(SAVED);
    draft.categories = [];
    expect(validateDraft(draft).categories).toBe('Tick at least one category.');
    draft.mode = 'off';
    expect(validateDraft(draft).categories).toBeUndefined();
  });

  it('rejects negative, empty, fractional and non-numeric budgets, and a bounty multiple below one', () => {
    const draft = draftFromPolicy(SAVED);
    draft.budgets.dailyCreditCap = '-1';
    draft.budgets.maxRepliesPerDay = '';
    draft.budgets.balanceFloor = 'lots';
    draft.budgets.threadCooldownHours = '1.5';
    const errors = validateDraft(draft);
    expect(Object.keys(errors.budgets).sort()).toEqual(['balanceFloor', 'dailyCreditCap', 'maxRepliesPerDay', 'threadCooldownHours']);
    expect(errors.budgets.threadCooldownHours).toBe('Must be a whole number from 1 to 720.');

    const bounty = draftFromPolicy({ ...SAVED, mode: 'bounty' });
    bounty.budgets.minBountyMultiple = '0.5';
    expect(validateDraft(bounty).budgets.minBountyMultiple).toBe('Must be a number from 1 to 100.');
    bounty.budgets.minBountyMultiple = '2.5';
    expect(validateDraft(bounty).budgets.minBountyMultiple).toBeUndefined();
  });

  it('refuses the budgets the daemon refuses: zero and above each ceiling', () => {
    const draft = draftFromPolicy(SAVED);
    draft.budgets.dailyCreditCap = '0';
    draft.budgets.maxRepliesPerDay = '101';
    draft.budgets.balanceFloor = '1000001';
    draft.budgets.threadCooldownHours = '721';
    draft.budgets.maxPostAgeHours = '0';
    const errors = validateDraft(draft);
    expect(errors.budgets).toEqual({
      dailyCreditCap: 'Must be a whole number from 1 to 100000.',
      maxRepliesPerDay: 'Must be a whole number from 1 to 100.',
      balanceFloor: 'Must be a whole number from 1 to 1000000.',
      threadCooldownHours: 'Must be a whole number from 1 to 720.',
      maxPostAgeHours: 'Must be a whole number from 1 to 720.',
    });
    expect(BUDGET_FIELDS.map(f => [f.key, f.min, f.max])).toEqual([
      ['dailyCreditCap', 1, 100000],
      ['maxRepliesPerDay', 1, 100],
      ['minBountyMultiple', 1, 100],
      ['balanceFloor', 1, 1000000],
      ['threadCooldownHours', 1, 720],
      ['maxPostAgeHours', 1, 720],
    ]);
    draft.budgets.dailyCreditCap = '100000';
    draft.budgets.maxRepliesPerDay = '100';
    draft.budgets.balanceFloor = '1';
    draft.budgets.threadCooldownHours = '720';
    draft.budgets.maxPostAgeHours = '1';
    expect(validateDraft(draft).budgets).toEqual({});
    const bounty = draftFromPolicy({ ...SAVED, mode: 'bounty' });
    bounty.budgets.minBountyMultiple = '100.5';
    expect(validateDraft(bounty).budgets.minBountyMultiple).toBe('Must be a number from 1 to 100.');
  });

  it('caps the instruction at 500 characters', () => {
    const draft = draftFromPolicy(SAVED);
    draft.instruction = 'x'.repeat(500);
    expect(validateDraft(draft).instruction).toBeUndefined();
    draft.instruction = 'x'.repeat(501);
    expect(validateDraft(draft).instruction).toBe('Up to 500 characters.');
  });

  it('needs both office hour times when the switch is on', () => {
    const draft = draftFromPolicy(SAVED);
    draft.officeHoursOn = true;
    draft.officeEnd = '';
    expect(validateDraft(draft).officeHours).toBe('Give a start and an end time.');
    draft.officeEnd = '18:00';
    expect(validateDraft(draft).officeHours).toBeUndefined();
  });

  it('refuses office hours that start and end at the same time, which the daemon refuses too', () => {
    const draft = draftFromPolicy(SAVED);
    draft.officeHoursOn = true;
    draft.officeStart = '17:45';
    draft.officeEnd = '17:45';
    expect(validateDraft(draft).officeHours).toBe('Start and end must differ.');
    expect(hasErrors(validateDraft(draft))).toBe(true);
    draft.officeHoursOn = false;
    expect(validateDraft(draft).officeHours).toBeUndefined();
  });
});

describe('status strip', () => {
  const NOW = Date.parse('2026-09-15T12:00:00Z');

  it('reads as specified', () => {
    expect(
      statusLine(
        {
          enabled: true,
          lastRunAt: '2026-09-15T11:56:00Z',
          repliesToday: 2,
          creditsSpentToday: 20,
          suggestionsPending: 3,
          downgradedReason: null,
          digestLastPostedAt: null,
          nextDigestAt: null,
          relevance: { scored: 0, skipped: 0, drafted: 0 },
          tunedThresholds: {},
          ledger: null,
        },
        NOW,
      ),
    ).toBe('Today: 2 replies, 20 credits spent, 3 suggestions waiting; last run 4 min ago');
  });

  it('singularises and says never before the first run', () => {
    expect(
      statusLine(
        { enabled: false, lastRunAt: null, repliesToday: 1, creditsSpentToday: 0, suggestionsPending: 1, downgradedReason: null, digestLastPostedAt: null, nextDigestAt: null, relevance: { scored: 0, skipped: 0, drafted: 0 }, tunedThresholds: {}, ledger: null },
        NOW,
      ),
    ).toBe('Today: 1 reply, 0 credits spent, 1 suggestion waiting; last run never');
    expect(lastRunLabel('2026-09-15T09:00:00Z', NOW)).toBe('3 h ago');
    expect(lastRunLabel('2026-09-13T09:00:00Z', NOW)).toBe('2 d ago');
    expect(lastRunLabel('not a date', NOW)).toBe('never');
  });
});
