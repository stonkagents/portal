/**
 * Purpose: Tests for ClawEvent type definitions and type guards
 */
import { describe, it, expect } from 'vitest';
import {
  isClawEvent,
  isAlertOrNudge,
  EVENT_CATEGORIES,
  EVENT_TRIAGE_LEVELS,
  CATEGORY_META,
} from '../claw-event';
import type {
  ClawEvent,
  EventCategory,

} from '../claw-event';

const validEvent: ClawEvent = {
  id: 'evt-001',
  timestamp: '2026-02-08T14:23:00.000Z',
  source: 'daemon',
  category: 'security',
  triage: 'alert',
  title: 'Blocked malicious peer',
  description: 'Agent auto-blocked peer X. Cosine similarity: 0.12',
  agentAction: 'auto-blocked, reported to tracker',
  agentReasoning: 'cosine similarity 0.12 below threshold 0.5',
  read: false,
  dismissed: false,
  actions: [
    { label: 'View peer', type: 'link', href: '/peers/x', variant: 'primary' },
  ],
  metadata: { peerId: 'peer-x', score: 0.12 },
};

describe('EVENT_CATEGORIES', () => {
  it('contains all 7 categories', () => {
    expect(EVENT_CATEGORIES).toEqual([
      'sync', 'peer', 'reputation', 'credit', 'security', 'system', 'agent',
    ]);
  });
});

describe('EVENT_TRIAGE_LEVELS', () => {
  it('contains all 4 triage levels in escalation order', () => {
    expect(EVENT_TRIAGE_LEVELS).toEqual([
      'silent', 'digest', 'nudge', 'alert',
    ]);
  });
});

describe('CATEGORY_META', () => {
  it('has metadata for every category', () => {
    for (const cat of EVENT_CATEGORIES) {
      const meta = CATEGORY_META[cat as EventCategory];
      expect(meta).toBeDefined();
      expect(meta.icon).toBeTruthy();
      expect(meta.colorClass).toBeTruthy();
      expect(meta.label).toBeTruthy();
    }
  });

  it('maps security to shield icon with red color', () => {
    expect(CATEGORY_META.security.icon).toBe('shield');
    expect(CATEGORY_META.security.colorClass).toContain('red');
  });

  it('maps sync to arrow-up-down icon', () => {
    expect(CATEGORY_META.sync.icon).toBe('arrow-up-down');
  });
});

describe('isClawEvent', () => {
  it('returns true for a valid ClawEvent', () => {
    expect(isClawEvent(validEvent)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isClawEvent(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isClawEvent(undefined)).toBe(false);
  });

  it('returns false for a plain string', () => {
    expect(isClawEvent('hello')).toBe(false);
  });

  it('returns false when id is missing', () => {
    const { id: _id, ...rest } = validEvent;
    expect(isClawEvent(rest)).toBe(false);
  });

  it('returns false when category is invalid', () => {
    expect(isClawEvent({ ...validEvent, category: 'bogus' })).toBe(false);
  });

  it('returns false when triage is invalid', () => {
    expect(isClawEvent({ ...validEvent, triage: 'bogus' })).toBe(false);
  });
});

describe('isAlertOrNudge', () => {
  it('returns true for alert events', () => {
    expect(isAlertOrNudge({ ...validEvent, triage: 'alert' })).toBe(true);
  });

  it('returns true for nudge events', () => {
    expect(isAlertOrNudge({ ...validEvent, triage: 'nudge' })).toBe(true);
  });

  it('returns false for silent events', () => {
    expect(isAlertOrNudge({ ...validEvent, triage: 'silent' })).toBe(false);
  });

  it('returns false for digest events', () => {
    expect(isAlertOrNudge({ ...validEvent, triage: 'digest' })).toBe(false);
  });
});
