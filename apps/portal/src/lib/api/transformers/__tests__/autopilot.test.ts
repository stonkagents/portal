/**
 * Purpose: The autopilot parsers accept the daemon's answer in camelCase or
 *          snake_case, with or without the data envelope, default what is
 *          missing, and drop suggestion rows the inbox cannot act on. The reply
 *          transformer carries the `auto` flag through.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AUTOPILOT_POLICY,
  parseAutopilotEvent,
  parseAutopilotPolicy,
  parseAutopilotSettings,
  parseAutopilotStatus,
  parseAutopilotSuggestion,
  parseAutopilotSuggestions,
  transformReply,
} from '../community';

const CAMEL = {
  data: {
    policy: {
      mode: 'bounty',
      categories: ['request', 'general', 'token-offer', 'bogus'],
      dailyCreditCap: 50,
      maxRepliesPerDay: 5,
      minBountyMultiple: 3,
      balanceFloor: 100,
      threadCooldownHours: 12,
      maxPostAgeHours: 48,
      instruction: 'Be brief.',
      officeHours: { start: '09:00', end: '17:00', tz: 'Europe/Stockholm' },
    },
    status: {
      enabled: true,
      lastRunAt: '2026-09-15T10:00:00Z',
      repliesToday: 2,
      creditsSpentToday: 20,
      suggestionsPending: 3,
      downgradedReason: 'Balance floor reached',
    },
  },
};

const SNAKE = {
  data: {
    policy: {
      mode: 'auto',
      categories: ['general'],
      daily_credit_cap: 10,
      max_replies_per_day: 2,
      min_bounty_multiple: 1.5,
      balance_floor: 5,
      thread_cooldown_hours: 6,
      max_post_age_hours: 24,
      instruction: '',
      office_hours: null,
    },
    status: {
      enabled: false,
      last_run_at: null,
      replies_today: 0,
      credits_spent_today: 0,
      suggestions_pending: 1,
    },
  },
};

describe('parseAutopilotSettings', () => {
  it('reads camelCase inside the data envelope', () => {
    const parsed = parseAutopilotSettings(CAMEL)!;
    expect(parsed.policy).toEqual({
      mode: 'bounty',
      categories: ['request', 'general', 'token-offer'],
      dailyCreditCap: 50,
      maxRepliesPerDay: 5,
      minBountyMultiple: 3,
      balanceFloor: 100,
      threadCooldownHours: 12,
      maxPostAgeHours: 48,
      instruction: 'Be brief.',
      officeHours: { start: '09:00', end: '17:00', tz: 'Europe/Stockholm' },
      digest: { enabled: false, weekday: 1, hour: 9 },
      relevanceThreshold: 0.25,
      relevanceMode: 'skip',
      relevanceThresholdByCategory: {},
    });
    expect(parsed.status).toEqual({
      enabled: true,
      lastRunAt: '2026-09-15T10:00:00Z',
      repliesToday: 2,
      creditsSpentToday: 20,
      suggestionsPending: 3,
      downgradedReason: 'Balance floor reached',
      digestLastPostedAt: null,
      nextDigestAt: null,
      relevance: { scored: 0, skipped: 0, drafted: 0 },
      tunedThresholds: {},
      ledger: null,
    });
  });

  it('reads snake_case the same way, with null office hours and no downgrade', () => {
    const parsed = parseAutopilotSettings(SNAKE)!;
    expect(parsed.policy.mode).toBe('auto');
    expect(parsed.policy.dailyCreditCap).toBe(10);
    expect(parsed.policy.minBountyMultiple).toBe(1.5);
    expect(parsed.policy.threadCooldownHours).toBe(6);
    expect(parsed.policy.officeHours).toBeNull();
    expect(parsed.status.lastRunAt).toBeNull();
    expect(parsed.status.suggestionsPending).toBe(1);
    expect(parsed.status.downgradedReason).toBeNull();
  });

  it('accepts a bare body and defaults a missing half', () => {
    const parsed = parseAutopilotSettings({ policy: { mode: 'suggest' } })!;
    expect(parsed.policy.mode).toBe('suggest');
    expect(parsed.policy.categories).toEqual([]);
    expect(parsed.status.repliesToday).toBe(0);
    expect(parsed.status.enabled).toBe(false);
  });

  it('is null for an answer with neither policy nor status', () => {
    expect(parseAutopilotSettings({ data: {} })).toBeNull();
    expect(parseAutopilotSettings(null)).toBeNull();
    expect(parseAutopilotSettings('nope')).toBeNull();
  });
});

describe('parseAutopilotPolicy / parseAutopilotStatus tolerance', () => {
  it('falls back to defaults for unknown modes and malformed numbers', () => {
    const p = parseAutopilotPolicy({ mode: 'yolo', dailyCreditCap: 'many', categories: 'request', officeHours: { start: '09:00' } });
    expect(p.mode).toBe(DEFAULT_AUTOPILOT_POLICY.mode);
    expect(p.dailyCreditCap).toBe(0);
    expect(p.categories).toEqual([]);
    expect(p.officeHours).toBeNull();
  });

  it('defaults a non-object status', () => {
    expect(parseAutopilotStatus(undefined)).toEqual({
      enabled: false,
      lastRunAt: null,
      repliesToday: 0,
      creditsSpentToday: 0,
      suggestionsPending: 0,
      downgradedReason: null,
      digestLastPostedAt: null,
      nextDigestAt: null,
      relevance: { scored: 0, skipped: 0, drafted: 0 },
      tunedThresholds: {},
      ledger: null,
    });
  });
});

describe('parseAutopilotSuggestions', () => {
  it('reads both spellings and the bounty, and drops rows without an id or post id', () => {
    const list = parseAutopilotSuggestions({
      data: [
        {
          id: 's1',
          postId: 'p1',
          postTitle: 'Need Q3 data',
          postAuthorName: 'Alice',
          category: 'request',
          bounty: { amount: 40, currency: 'credits' },
          draft: 'We hold it.',
          estimatedCredits: 4,
          createdAt: '2026-09-15T09:00:00Z',
          expiresAt: '2026-09-16T09:00:00Z',
        },
        {
          id: 's2',
          post_id: 'p2',
          post_title: 'Hello',
          post_author_name: 'Bob',
          category: 'nonsense',
          draft: 'Hi',
          estimated_credits: 1,
          created_at: '2026-09-15T09:30:00Z',
          expires_at: '2026-09-16T09:30:00Z',
        },
        { id: 's3' },
        'garbage',
      ],
    });
    expect(list.map(s => s.id)).toEqual(['s1', 's2']);
    expect(list[0].bounty).toEqual({ amount: 40, currency: 'credits' });
    expect(list[1]).toMatchObject({
      postId: 'p2',
      postTitle: 'Hello',
      postAuthorName: 'Bob',
      category: 'general',
      estimatedCredits: 1,
    });
    expect(list[1].bounty).toBeUndefined();
  });

  it('accepts a bare array and an empty answer', () => {
    expect(parseAutopilotSuggestions([{ id: 'a', postId: 'p' }])).toHaveLength(1);
    expect(parseAutopilotSuggestions({ data: [] })).toEqual([]);
    expect(parseAutopilotSuggestions(null)).toEqual([]);
    expect(parseAutopilotSuggestion({ postId: 'p' })).toBeNull();
  });
});

describe('transformReply auto flag', () => {
  const base = { id: 'r1', postId: 'p1', author: 'peer-1', content: 'hi', time: 'now' };

  it('carries auto: true through and leaves it off otherwise', () => {
    expect(transformReply({ ...base, auto: true }).auto).toBe(true);
    expect(transformReply(base).auto).toBeUndefined();
    expect(transformReply({ ...base, auto: false }).auto).toBeUndefined();
  });
});

describe('phase 2 status and events', () => {
  it('reads digestLastPostedAt in either spelling, null when absent', () => {
    expect(parseAutopilotStatus({ digest_last_posted_at: '2026-09-15T09:00:00Z' }).digestLastPostedAt).toBe('2026-09-15T09:00:00Z');
    expect(parseAutopilotStatus({ digestLastPostedAt: '2026-09-15T09:00:00Z' }).digestLastPostedAt).toBe('2026-09-15T09:00:00Z');
    expect(parseAutopilotStatus({}).digestLastPostedAt).toBeNull();
  });

  it('reads an event with the contract keys, and at / roomMint beside them', () => {
    expect(parseAutopilotEvent({ id: 'd1', kind: 'digest_posted', createdAt: '2026-09-15T09:00:00Z', postId: 'p9', mint: 'Mint111', symbol: 'STONK', title: 'T' })).toEqual({
      id: 'd1',
      kind: 'digest_posted',
      postId: 'p9',
      mint: 'Mint111',
      symbol: 'STONK',
      title: 'T',
      createdAt: '2026-09-15T09:00:00Z',
    });
    expect(parseAutopilotEvent({ id: 'd2', kind: 'digest_posted', at: '2026-09-15T09:00:00Z', roomMint: 'Mint222' })).toMatchObject({
      mint: 'Mint222',
      createdAt: '2026-09-15T09:00:00Z',
    });
  });
});

describe('phase 3 relevance, tuned thresholds and the ledger', () => {
  it('reads the relevance policy in either spelling and defaults it', () => {
    const p = parseAutopilotPolicy({
      relevance_threshold: 0.4,
      relevance_mode: 'note',
      relevance_threshold_by_category: { request: 0.6, general: 'no', bogus: 1.4 },
    });
    expect(p.relevanceThreshold).toBe(0.4);
    expect(p.relevanceMode).toBe('note');
    expect(p.relevanceThresholdByCategory).toEqual({ request: 0.6, bogus: 1 });
    const d = parseAutopilotPolicy({ relevanceThreshold: 'high', relevanceMode: 'maybe' });
    expect(d.relevanceThreshold).toBe(0.25);
    expect(d.relevanceMode).toBe('skip');
    expect(d.relevanceThresholdByCategory).toEqual({});
  });

  it('reads the counters, tuned thresholds (object or bare number, percent rates) and the ledger', () => {
    const s = parseAutopilotStatus({
      relevance: { scored: 15, skipped: 12, drafted: 3 },
      tuned_thresholds: { request: { threshold: 0.35, hit_rate: 0.1, posted: 10, direction: 'up' }, general: 0.15, bad: { hitRate: 0.5 } },
      ledger: {
        last30: { drafted: 20, posted: 8, hits: 3, hit_rate: 37.5, credits_spent: 80, credits_won: 120 },
        days: [{ date: '2026-09-15', drafts: 2, hits: 1 }, { day: '2026-09-14T00:00:00Z', drafted: 1, hits: 0 }, { drafts: 5 }],
      },
    });
    expect(s.relevance).toEqual({ scored: 15, skipped: 12, drafted: 3 });
    expect(s.tunedThresholds).toEqual({
      request: { threshold: 0.35, hitRate: 0.1, samples: 10, direction: 'up' },
      general: { threshold: 0.15, hitRate: null, samples: 0, direction: '' },
    });
    expect(s.ledger).toEqual({
      last30: { drafted: 20, posted: 8, hits: 3, hitRate: 0.375, creditsSpent: 80, creditsWon: 120 },
      days: [
        { date: '2026-09-15', drafts: 2, hits: 1 },
        { date: '2026-09-14', drafts: 1, hits: 0 },
      ],
    });
    expect(parseAutopilotStatus({}).ledger).toBeNull();
    expect(parseAutopilotStatus({ ledger: { days: [] } }).ledger).toEqual({
      last30: { drafted: 0, posted: 0, hits: 0, hitRate: 0, creditsSpent: 0, creditsWon: 0 },
      days: [],
    });
  });

  it('carries relevance and its signals on suggestions and replies, clamped to 0..1', () => {
    const s = parseAutopilotSuggestion({
      id: 's1',
      postId: 'p1',
      relevance: 0.62,
      relevanceSignals: { library: 0.8, history: 0, instruction: 1, routed: 1.5 },
    })!;
    expect(s.relevance).toBe(0.62);
    expect(s.relevanceSignals).toEqual({ library: 0.8, history: 0, instruction: 1, routed: 1 });
    expect(parseAutopilotSuggestion({ id: 's2', postId: 'p1' })!.relevance).toBeUndefined();

    const base = { id: 'r1', postId: 'p1', author: 'peer-1', content: 'hi', time: 'now' };
    const reply = transformReply({ ...base, ask: 60, relevance: 0.4, relevance_signals: { library: 0.5 } });
    expect(reply.ask).toBe(60);
    expect(reply.relevance).toBe(0.4);
    expect(reply.relevanceSignals).toEqual({ library: 0.5, history: 0, instruction: 0, routed: 0 });
    expect(transformReply({ ...base, ask: 0 }).ask).toBeUndefined();
    expect(transformReply(base).relevance).toBeUndefined();
  });
});
