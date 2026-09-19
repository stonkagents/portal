/**
 * Purpose: Tests for useBackendActivityEvents — polls /api/activity/recent,
 *          transforms entries to ClawEvents, deduplicates, tracks last poll.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ClawEvent } from '@/lib/types/claw-event';

let mockApiClient: ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>;

vi.mock('@/lib/api/client', () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

import { useBackendActivityEvents } from '../use-backend-activity-events';

const ENTRY_SHARE = {
  type: 'share',
  title: 'model.bin shared',
  time_ago: '2 hours ago',
  occurred_at: '2026-02-16T10:00:00Z',
  color: 'green',
};

const ENTRY_INSTALL = {
  type: 'install',
  title: 'llama-7b installed',
  time_ago: '1 hour ago',
  occurred_at: '2026-02-16T11:00:00Z',
  color: 'blue',
};

const ENTRY_JOIN = {
  type: 'join',
  title: 'new-agent joined',
  time_ago: '30 mins ago',
  occurred_at: '2026-02-16T11:30:00Z',
  color: 'purple',
};

/** Flush all pending microtasks (promise resolutions) under fake timers */
async function flushPromises() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useBackendActivityEvents', () => {
  let addEvent: ReturnType<typeof vi.fn<(event: ClawEvent) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    addEvent = vi.fn();
    mockApiClient = vi.fn().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls /api/activity/recent on mount', async () => {
    mockApiClient.mockResolvedValue([ENTRY_SHARE]);

    renderHook(() => useBackendActivityEvents(addEvent));
    await flushPromises();

    expect(mockApiClient).toHaveBeenCalledWith('/api/activity/recent?limit=10');
  });

  it('transforms share entry to sync/digest ClawEvent', async () => {
    mockApiClient.mockResolvedValue([ENTRY_SHARE]);

    renderHook(() => useBackendActivityEvents(addEvent));
    await flushPromises();

    expect(addEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'backend-share-2026-02-16T10:00:00Z',
        category: 'sync',
        triage: 'digest',
        title: 'model.bin shared',
        source: 'portal',
      }),
    );
  });

  it('transforms install entry to sync/digest ClawEvent', async () => {
    mockApiClient.mockResolvedValue([ENTRY_INSTALL]);

    renderHook(() => useBackendActivityEvents(addEvent));
    await flushPromises();

    expect(addEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'backend-install-2026-02-16T11:00:00Z',
        category: 'sync',
        triage: 'digest',
        title: 'llama-7b installed',
      }),
    );
  });

  it('transforms join entry to peer/digest ClawEvent', async () => {
    mockApiClient.mockResolvedValue([ENTRY_JOIN]);

    renderHook(() => useBackendActivityEvents(addEvent));
    await flushPromises();

    expect(addEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'backend-join-2026-02-16T11:30:00Z',
        category: 'peer',
        triage: 'digest',
        title: 'new-agent joined',
      }),
    );
  });

  it('does not re-add same events on re-poll', async () => {
    mockApiClient.mockResolvedValue([ENTRY_SHARE]);

    renderHook(() => useBackendActivityEvents(addEvent));
    await flushPromises();
    expect(addEvent).toHaveBeenCalledTimes(1);

    // Advance timer to trigger next poll (30s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(mockApiClient).toHaveBeenCalledTimes(2);
    // addEvent should still be 1 — same entry, already processed
    expect(addEvent).toHaveBeenCalledTimes(1);
  });

  it('processes only new entries on re-poll', async () => {
    mockApiClient.mockResolvedValueOnce([ENTRY_SHARE]);

    renderHook(() => useBackendActivityEvents(addEvent));
    await flushPromises();
    expect(addEvent).toHaveBeenCalledTimes(1);

    // Second poll returns share (old) + install (new)
    mockApiClient.mockResolvedValueOnce([ENTRY_SHARE, ENTRY_INSTALL]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(addEvent).toHaveBeenCalledTimes(2);
    expect(addEvent).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'backend-install-2026-02-16T11:00:00Z' }));
  });

  it('silently handles API errors without calling addEvent', async () => {
    mockApiClient.mockRejectedValue(new Error('Network error'));

    renderHook(() => useBackendActivityEvents(addEvent));
    await flushPromises();

    expect(addEvent).not.toHaveBeenCalled();
  });
});
