/**
 * Purpose: TDD tests for daemon health event generator — generates
 *          ClawEvents when daemon status transitions (online/degraded/offline),
 *          pairs every "went offline" alert with one "back online" nudge that
 *          resolves it, and stays quiet on the first healthy probe after load.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useDaemonEvents } from '../use-daemon-events';

/* ── Mock useDaemon ────────────────────────────────────────────────── */

let mockDaemonStatus = 'online';

vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => ({
    connected: mockDaemonStatus !== 'offline',
    daemonStatus: mockDaemonStatus,
    health: { status: mockDaemonStatus === 'online' ? 'ok' : mockDaemonStatus, peerId: 'test', peers: 0 },
    refresh: vi.fn(),
    toggleDaemon: vi.fn(),
  }),
}));

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('useDaemonEvents', () => {
  const addEvent = vi.fn();
  const resolveEvent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDaemonStatus = 'online';
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <>{children}</>;
  }

  it('does not generate event on initial mount', () => {
    renderHook(() => useDaemonEvents(addEvent, resolveEvent), { wrapper });

    expect(addEvent).not.toHaveBeenCalled();
  });

  it('generates system/alert event with a timestamp on transition to offline', () => {
    mockDaemonStatus = 'online';
    const { rerender } = renderHook(() => useDaemonEvents(addEvent, resolveEvent), { wrapper });

    mockDaemonStatus = 'offline';
    rerender();

    expect(addEvent).toHaveBeenCalledTimes(1);
    const event = addEvent.mock.calls[0][0];
    expect(event.category).toBe('system');
    expect(event.triage).toBe('alert');
    expect(event.title).toBe('Your agent went offline');
    expect(Number.isFinite(Date.parse(event.timestamp))).toBe(true);
    expect(resolveEvent).not.toHaveBeenCalled();
  });

  it('generates system/nudge event on transition to degraded', () => {
    mockDaemonStatus = 'online';
    const { rerender } = renderHook(() => useDaemonEvents(addEvent, resolveEvent), { wrapper });

    mockDaemonStatus = 'degraded';
    rerender();

    expect(addEvent).toHaveBeenCalledTimes(1);
    const event = addEvent.mock.calls[0][0];
    expect(event.category).toBe('system');
    expect(event.triage).toBe('nudge');
    expect(event.title).toBe('Your agent is slow to respond');
  });

  it('answers an offline alert with a "back online" nudge that resolves it', () => {
    mockDaemonStatus = 'online';
    const { rerender } = renderHook(() => useDaemonEvents(addEvent, resolveEvent), { wrapper });

    mockDaemonStatus = 'offline';
    rerender();
    const offline = addEvent.mock.calls[0][0];

    mockDaemonStatus = 'online';
    rerender();

    expect(addEvent).toHaveBeenCalledTimes(2);
    const online = addEvent.mock.calls[1][0];
    expect(online.category).toBe('system');
    expect(online.triage).toBe('nudge');
    expect(online.title).toBe('Your agent is back online');
    expect(online.description).toBe('Your agent has reconnected.');
    expect(online.relatedEvents).toEqual([offline.id]);
    expect(online.id).not.toBe(offline.id);
    expect(resolveEvent).toHaveBeenCalledTimes(1);
    expect(resolveEvent).toHaveBeenCalledWith(offline.id);
  });

  it('stays quiet on the first healthy probe after page load when no offline alert preceded it', () => {
    mockDaemonStatus = 'offline';
    const { rerender } = renderHook(() => useDaemonEvents(addEvent, resolveEvent), { wrapper });

    mockDaemonStatus = 'online';
    rerender();

    expect(addEvent).not.toHaveBeenCalled();
    expect(resolveEvent).not.toHaveBeenCalled();
  });

  it('reports a slow reconnect as "back online" once, not as two nudges', () => {
    mockDaemonStatus = 'online';
    const { rerender } = renderHook(() => useDaemonEvents(addEvent, resolveEvent), { wrapper });

    mockDaemonStatus = 'offline';
    rerender();
    mockDaemonStatus = 'degraded';
    rerender();

    expect(addEvent).toHaveBeenCalledTimes(2);
    const online = addEvent.mock.calls[1][0];
    expect(online.title).toBe('Your agent is back online');
    expect(online.description).toBe('Your agent has reconnected but is slow to respond.');
    expect(resolveEvent).toHaveBeenCalledTimes(1);
  });

  it('raises one alert and one nudge per drop, never a second "back online" without a new drop', () => {
    mockDaemonStatus = 'online';
    const { rerender } = renderHook(() => useDaemonEvents(addEvent, resolveEvent), { wrapper });

    mockDaemonStatus = 'offline';
    rerender();
    mockDaemonStatus = 'online';
    rerender();
    mockDaemonStatus = 'degraded';
    rerender();
    mockDaemonStatus = 'online';
    rerender();

    const titles = addEvent.mock.calls.map(call => call[0].title);
    expect(titles).toEqual(['Your agent went offline', 'Your agent is back online', 'Your agent is slow to respond']);
    expect(resolveEvent).toHaveBeenCalledTimes(1);
  });

  it('works without a resolver', () => {
    mockDaemonStatus = 'online';
    const { rerender } = renderHook(() => useDaemonEvents(addEvent), { wrapper });

    mockDaemonStatus = 'offline';
    rerender();
    mockDaemonStatus = 'online';
    rerender();

    expect(addEvent).toHaveBeenCalledTimes(2);
  });

  it('does not generate event when status stays the same', () => {
    mockDaemonStatus = 'online';
    const { rerender } = renderHook(() => useDaemonEvents(addEvent, resolveEvent), { wrapper });

    // Re-render with same status
    rerender();
    rerender();

    expect(addEvent).not.toHaveBeenCalled();
  });
});
