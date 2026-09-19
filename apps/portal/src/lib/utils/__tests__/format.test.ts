/**
 * Purpose: Tests for the relative time label ("just now", "3m ago") the alerts show and
 *          the full date and time that sits behind it as the hover title.
 */
import { describe, test, expect } from 'vitest';
import { formatDateTime, timeAgo } from '../format';

const NOW = Date.parse('2026-09-17T12:00:00Z');

describe('timeAgo', () => {
  test('steps from "just now" through minutes, hours and days', () => {
    expect(timeAgo(NOW, NOW)).toBe('just now');
    expect(timeAgo(NOW - 59_000, NOW)).toBe('just now');
    expect(timeAgo(NOW - 60_000, NOW)).toBe('1m ago');
    expect(timeAgo(NOW - 2 * 60_000, NOW)).toBe('2m ago');
    expect(timeAgo(NOW - 59 * 60_000, NOW)).toBe('59m ago');
    expect(timeAgo(NOW - 3_600_000, NOW)).toBe('1h ago');
    expect(timeAgo(NOW - 23 * 3_600_000, NOW)).toBe('23h ago');
    expect(timeAgo(NOW - 86_400_000, NOW)).toBe('1d ago');
    expect(timeAgo(NOW - 5 * 86_400_000, NOW)).toBe('5d ago');
  });

  test('accepts ISO strings and Dates, and never counts a future stamp as negative', () => {
    expect(timeAgo('2026-09-17T11:55:00Z', NOW)).toBe('5m ago');
    expect(timeAgo(new Date(NOW - 3_600_000), NOW)).toBe('1h ago');
    expect(timeAgo(NOW + 30_000, NOW)).toBe('just now');
  });

  test('falls back to a short date after a month and to "-" for nothing', () => {
    expect(timeAgo(NOW - 40 * 86_400_000, NOW)).toMatch(/2026/);
    expect(timeAgo(null, NOW)).toBe('-');
    expect(timeAgo('nope', NOW)).toBe('-');
  });
});

describe('formatDateTime', () => {
  test('prints the full local date and time for a stamp', () => {
    const label = formatDateTime('2026-09-17T12:00:00Z');
    expect(label).toContain('2026');
    expect(label).toMatch(/\d{1,2}:\d{2}/);
    expect(formatDateTime(NOW)).toBe(label);
    expect(formatDateTime(new Date(NOW))).toBe(label);
  });

  test('is empty for nothing or an unparsable value', () => {
    expect(formatDateTime(null)).toBe('');
    expect(formatDateTime(undefined)).toBe('');
    expect(formatDateTime('not a date')).toBe('');
  });
});
