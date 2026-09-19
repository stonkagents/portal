/**
 * Purpose: Tests for useEvents, useAlerts, and helper functions that
 *          filter and sort ClawEvents for the UI.
 */
import { describe, it, expect } from 'vitest';
import {
  filterEvents,
  sortEventsByTime,
  getUnreadAlertCount,
} from '../use-events';
import type { ClawEvent } from '@/lib/types/claw-event';

const events: ClawEvent[] = [
  {
    id: 'e1', timestamp: '2026-02-08T14:00:00.000Z', source: 'daemon',
    category: 'security', triage: 'alert', title: 'Security alert',
    description: 'desc', read: false, dismissed: false,
  },
  {
    id: 'e2', timestamp: '2026-02-08T13:00:00.000Z', source: 'daemon',
    category: 'sync', triage: 'nudge', title: 'Sync complete',
    description: 'desc', read: false, dismissed: false,
  },
  {
    id: 'e3', timestamp: '2026-02-08T12:00:00.000Z', source: 'daemon',
    category: 'peer', triage: 'silent', title: 'Peer connected',
    description: 'desc', read: true, dismissed: false,
  },
  {
    id: 'e4', timestamp: '2026-02-08T11:00:00.000Z', source: 'agent',
    category: 'agent', triage: 'digest', title: 'Batch digest',
    description: 'desc', read: true, dismissed: false,
  },
  {
    id: 'e5', timestamp: '2026-02-08T10:00:00.000Z', source: 'daemon',
    category: 'security', triage: 'alert', title: 'Another alert',
    description: 'desc', read: true, dismissed: false,
  },
];

describe('filterEvents', () => {
  it('returns all events with no filters', () => {
    const result = filterEvents(events, { category: 'all', triage: 'all', showSilent: true, search: '' });
    expect(result.length).toBe(5);
  });

  it('filters by category', () => {
    const result = filterEvents(events, { category: 'security', triage: 'all', showSilent: true, search: '' });
    expect(result.length).toBe(2);
    expect(result.every(e => e.category === 'security')).toBe(true);
  });

  it('filters by triage level', () => {
    const result = filterEvents(events, { category: 'all', triage: 'alert', showSilent: true, search: '' });
    expect(result.length).toBe(2);
    expect(result.every(e => e.triage === 'alert')).toBe(true);
  });

  it('hides silent events when showSilent is false', () => {
    const result = filterEvents(events, { category: 'all', triage: 'all', showSilent: false, search: '' });
    expect(result.every(e => e.triage !== 'silent')).toBe(true);
    expect(result.length).toBe(4);
  });

  it('filters by search text in title', () => {
    const result = filterEvents(events, { category: 'all', triage: 'all', showSilent: true, search: 'sync' });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('e2');
  });

  it('search is case-insensitive', () => {
    const result = filterEvents(events, { category: 'all', triage: 'all', showSilent: true, search: 'ALERT' });
    // "Security alert" (e1) and "Another alert" (e5) both contain "alert"
    expect(result.length).toBe(2);
  });

  it('combines category and search filters', () => {
    const result = filterEvents(events, { category: 'security', triage: 'all', showSilent: true, search: 'another' });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('e5');
  });
});

describe('sortEventsByTime', () => {
  it('sorts events newest first', () => {
    const shuffled = [events[2], events[0], events[4], events[1], events[3]];
    const sorted = sortEventsByTime(shuffled);
    expect(sorted[0].id).toBe('e1');
    expect(sorted[1].id).toBe('e2');
    expect(sorted[4].id).toBe('e5');
  });

  it('returns empty array for empty input', () => {
    expect(sortEventsByTime([])).toEqual([]);
  });
});

describe('getUnreadAlertCount', () => {
  it('counts only unread alert and nudge events', () => {
    const count = getUnreadAlertCount(events);
    // e1 = unread alert, e2 = unread nudge → 2
    expect(count).toBe(2);
  });

  it('returns 0 when all are read', () => {
    const allRead = events.map(e => ({ ...e, read: true }));
    expect(getUnreadAlertCount(allRead)).toBe(0);
  });

  it('excludes silent and digest events even if unread', () => {
    const withUnreadSilent = events.map(e =>
      e.id === 'e3' ? { ...e, read: false } : e
    );
    // e3 is silent and unread — should NOT count
    expect(getUnreadAlertCount(withUnreadSilent)).toBe(2);
  });
});
