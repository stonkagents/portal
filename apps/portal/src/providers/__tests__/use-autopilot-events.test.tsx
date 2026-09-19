/**
 * Purpose: Tests for useAutopilotEvents: polls the agent's suggestion inbox while
 *          connected, raises one agent/nudge "Your agent has N suggested replies"
 *          per batch of new drafts, never repeats for drafts already seen, stays
 *          silent for an agent without autopilot, and asks nothing offline.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ClawEvent } from '@/lib/types/claw-event';

const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const getAutopilotSuggestions = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/daemon-autopilot', () => ({ getAutopilotSuggestions }));

import { useAutopilotEvents, SUGGESTIONS_HREF } from '../use-autopilot-events';

const S1 = {
  id: 's1',
  postId: 'p1',
  postTitle: 'A',
  postAuthorName: '',
  category: 'request',
  draft: 'x',
  estimatedCredits: 1,
  createdAt: '2026-09-15T09:00:00Z',
  expiresAt: '',
};
const S2 = { ...S1, id: 's2', createdAt: '2026-09-15T10:00:00Z' };

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useAutopilotEvents', () => {
  let addEvent: ReturnType<typeof vi.fn<(event: ClawEvent) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    addEvent = vi.fn();
    mockDaemon.connected = true;
    getAutopilotSuggestions.mockReset().mockResolvedValue({ kind: 'ok', value: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('raises one nudge naming the pending count, linking to the board', async () => {
    getAutopilotSuggestions.mockResolvedValue({ kind: 'ok', value: [S1, S2] });
    renderHook(() => useAutopilotEvents(addEvent));
    await flush();
    expect(addEvent).toHaveBeenCalledTimes(1);
    const event = addEvent.mock.calls[0][0];
    expect(event.title).toBe('Your agent has 2 suggested replies');
    expect(event.category).toBe('agent');
    expect(event.triage).toBe('nudge');
    expect(event.id).toBe('autopilot-suggestions-s2');
    expect(event.actions?.[0]).toMatchObject({ type: 'link', href: SUGGESTIONS_HREF });
  });

  it('does not repeat for drafts already seen, and nudges again for a new one', async () => {
    getAutopilotSuggestions.mockResolvedValue({ kind: 'ok', value: [S1] });
    renderHook(() => useAutopilotEvents(addEvent));
    await flush();
    expect(addEvent).toHaveBeenCalledTimes(1);
    expect(addEvent.mock.calls[0][0].title).toBe('Your agent has 1 suggested reply');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(addEvent).toHaveBeenCalledTimes(1);

    getAutopilotSuggestions.mockResolvedValue({ kind: 'ok', value: [S1, S2] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(addEvent).toHaveBeenCalledTimes(2);
    expect(addEvent.mock.calls[1][0].id).toBe('autopilot-suggestions-s2');
    expect(addEvent.mock.calls[1][0].title).toBe('Your agent has 2 suggested replies');
  });

  it('stays silent for an agent without autopilot or one that does not answer', async () => {
    getAutopilotSuggestions.mockResolvedValue({ kind: 'unsupported' });
    renderHook(() => useAutopilotEvents(addEvent));
    await flush();
    getAutopilotSuggestions.mockResolvedValue({ kind: 'error', message: 'no answer', code: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(addEvent).not.toHaveBeenCalled();
  });

  it('asks nothing while the agent is offline', async () => {
    mockDaemon.connected = false;
    renderHook(() => useAutopilotEvents(addEvent));
    await flush();
    expect(getAutopilotSuggestions).not.toHaveBeenCalled();
  });
});
