/**
 * Purpose: TDD tests for EventProvider context — state management,
 *          localStorage persistence, mock mode seeding, alert counting.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

/* Mock DaemonProvider so EventProvider can call useDaemonEvents internally */
vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => ({
    connected: true,
    daemonStatus: 'online',
    health: { status: 'ok', peerId: 'test', peers: 0 },
    refresh: vi.fn(),
    toggleDaemon: vi.fn(),
  }),
}));

import { EventProvider, useEvents } from '../EventProvider';
import type { ClawEvent } from '@/lib/types/claw-event';

/* ── Helpers ───────────────────────────────────────────────────────── */

function wrapper({ children }: { children: ReactNode }) {
  return <EventProvider>{children}</EventProvider>;
}

function makeEvent(overrides: Partial<ClawEvent> = {}): ClawEvent {
  return {
    id: `evt-test-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    source: 'daemon',
    category: 'system',
    triage: 'alert',
    title: 'Test event',
    description: 'A test event',
    read: false,
    dismissed: false,
    ...overrides,
  };
}

/* ── localStorage mock ─────────────────────────────────────────────── */

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

/* ── Tests ─────────────────────────────────────────────────────────── */

describe('EventProvider', () => {
  describe('default context', () => {
    it('provides empty events and balanced prefs by default', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      expect(result.current.events).toEqual([]);
      expect(result.current.alertCount).toBe(0);
      expect(result.current.preferences.preset).toBe('balanced');
    });
  });

  describe('addEvent', () => {
    it('adds an event to the list', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });
      const event = makeEvent({ id: 'add-1' });

      act(() => {
        result.current.addEvent(event);
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].id).toBe('add-1');
    });

    it('increments alertCount for alert triage', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        result.current.addEvent(makeEvent({ triage: 'alert', read: false }));
      });

      expect(result.current.alertCount).toBe(1);
    });

    it('increments alertCount for nudge triage', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        result.current.addEvent(makeEvent({ triage: 'nudge', read: false }));
      });

      expect(result.current.alertCount).toBe(1);
    });

    it('does NOT increment alertCount for digest triage', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        result.current.addEvent(makeEvent({ triage: 'digest', read: false }));
      });

      expect(result.current.alertCount).toBe(0);
    });

    it('does NOT increment alertCount for silent triage', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        result.current.addEvent(makeEvent({ triage: 'silent', read: false }));
      });

      expect(result.current.alertCount).toBe(0);
    });

    it('does NOT add duplicate event IDs', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });
      const event = makeEvent({ id: 'dup-1' });

      act(() => {
        result.current.addEvent(event);
      });
      act(() => {
        result.current.addEvent(event);
      });

      expect(result.current.events).toHaveLength(1);
    });

    it('newest events appear first', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });
      const old = makeEvent({ id: 'old', timestamp: '2026-01-01T00:00:00Z' });
      const recent = makeEvent({ id: 'new', timestamp: '2026-02-01T00:00:00Z' });

      act(() => {
        result.current.addEvent(old);
      });
      act(() => {
        result.current.addEvent(recent);
      });

      expect(result.current.events[0].id).toBe('new');
      expect(result.current.events[1].id).toBe('old');
    });

    it('caps events at 200, evicting oldest', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        for (let i = 0; i < 201; i++) {
          result.current.addEvent(
            makeEvent({
              id: `cap-${i}`,
              timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
            }),
          );
        }
      });

      expect(result.current.events).toHaveLength(200);
      // Oldest (cap-0) should have been evicted
      expect(result.current.events.find(e => e.id === 'cap-0')).toBeUndefined();
      // Newest (cap-200) should be present
      expect(result.current.events.find(e => e.id === 'cap-200')).toBeDefined();
    });
  });

  describe('markRead', () => {
    it('marks an event as read and decrements alertCount', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });
      const event = makeEvent({ id: 'read-1', triage: 'alert', read: false });

      act(() => {
        result.current.addEvent(event);
      });
      expect(result.current.alertCount).toBe(1);

      act(() => {
        result.current.markRead('read-1');
      });
      expect(result.current.alertCount).toBe(0);
      expect(result.current.events[0].read).toBe(true);
    });

    it('does not decrement alertCount for already-read events', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });
      const event = makeEvent({ id: 'already-read', triage: 'alert', read: true });

      act(() => {
        result.current.addEvent(event);
      });
      expect(result.current.alertCount).toBe(0);

      act(() => {
        result.current.markRead('already-read');
      });
      expect(result.current.alertCount).toBe(0);
    });
  });

  describe('markAllRead', () => {
    it('zeros alertCount and marks all events read', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        result.current.addEvent(makeEvent({ id: 'all-1', triage: 'alert', read: false }));
        result.current.addEvent(makeEvent({ id: 'all-2', triage: 'nudge', read: false }));
        result.current.addEvent(makeEvent({ id: 'all-3', triage: 'digest', read: false }));
      });
      expect(result.current.alertCount).toBe(2);

      act(() => {
        result.current.markAllRead();
      });

      expect(result.current.alertCount).toBe(0);
      expect(result.current.events.every(e => e.read)).toBe(true);
    });
  });

  describe('dismiss', () => {
    it('marks an event as dismissed and excludes from alertCount', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });
      const event = makeEvent({ id: 'dismiss-1', triage: 'alert', read: false });

      act(() => {
        result.current.addEvent(event);
      });
      expect(result.current.alertCount).toBe(1);

      act(() => {
        result.current.dismiss('dismiss-1');
      });
      expect(result.current.alertCount).toBe(0);
      expect(result.current.events[0].dismissed).toBe(true);
    });
  });

  describe('preferences', () => {
    it('defaults to balanced preset', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      expect(result.current.preferences.preset).toBe('balanced');
    });

    it('updates preferences via updatePreferences', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        result.current.updatePreferences({
          preset: 'minimal',
          overrides: {
            sync: 'silent',
            peer: 'silent',
            reputation: 'silent',
            credit: 'silent',
            security: 'alert',
            system: 'silent',
            agent: 'silent',
          },
        });
      });

      expect(result.current.preferences.preset).toBe('minimal');
    });

    it('persists preferences to localStorage', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        result.current.updatePreferences({
          preset: 'everything',
          overrides: {
            sync: 'nudge',
            peer: 'nudge',
            reputation: 'nudge',
            credit: 'nudge',
            security: 'alert',
            system: 'nudge',
            agent: 'nudge',
          },
        });
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('stonkagents:notification-prefs', expect.any(String));
      const saved = JSON.parse(localStorageMock.setItem.mock.calls.find((c: string[]) => c[0] === 'stonkagents:notification-prefs')![1]);
      expect(saved.preset).toBe('everything');
    });

    it('loads preferences from localStorage on mount', () => {
      const prefs = {
        preset: 'minimal',
        overrides: {
          sync: 'silent',
          peer: 'silent',
          reputation: 'silent',
          credit: 'silent',
          security: 'alert',
          system: 'silent',
          agent: 'silent',
        },
      };
      localStorageMock.setItem('stonkagents:notification-prefs', JSON.stringify(prefs));

      const { result } = renderHook(() => useEvents(), { wrapper });

      expect(result.current.preferences.preset).toBe('minimal');
    });
  });

  describe('read ID persistence', () => {
    it('persists read IDs to localStorage', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        result.current.addEvent(makeEvent({ id: 'persist-read', triage: 'alert', read: false }));
      });
      act(() => {
        result.current.markRead('persist-read');
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('stonkagents:event-read-ids', expect.any(String));
    });

    it('loads read IDs from localStorage and applies to events', () => {
      localStorageMock.setItem('stonkagents:event-read-ids', JSON.stringify(['restore-1']));

      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        result.current.addEvent(makeEvent({ id: 'restore-1', triage: 'alert', read: false }));
      });

      // Event should be marked as read because ID was in persisted read set
      expect(result.current.events[0].read).toBe(true);
      expect(result.current.alertCount).toBe(0);
    });
  });

  describe('dismissed ID persistence', () => {
    it('persists dismissed IDs to localStorage', () => {
      const { result } = renderHook(() => useEvents(), { wrapper });

      act(() => {
        result.current.addEvent(makeEvent({ id: 'persist-dismiss', triage: 'alert' }));
      });
      act(() => {
        result.current.dismiss('persist-dismiss');
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('stonkagents:event-dismissed-ids', expect.any(String));
    });
  });
});
