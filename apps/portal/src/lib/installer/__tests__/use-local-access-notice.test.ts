/**
 * Purpose: Tests for the permission banner's state: the live permission read
 *          (unsupported, prompt, denied, granted, and a change event clearing
 *          it) and the one-per-page slot (priority over mount order, hand-over
 *          on unmount).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/daemon', () => ({
  DAEMON_API_V1: 'http://127.0.0.1:7861/api/v1',
  STATUS_TIMEOUT_MS: 4000,
  withLoopbackTarget: (_url: string, init?: RequestInit) => init ?? {},
}));

import { localAccessBlocked, resetLocalAccessNoticeSlot, useLocalAccessNoticeSlot, useLocalAccessState } from '../use-local-access-notice';

/** A PermissionStatus stand-in whose state the test flips, firing change like the browser does. */
function fakeStatus(state: string) {
  const listeners = new Set<() => void>();
  const status = {
    state,
    addEventListener: vi.fn((_type: string, cb: () => void) => listeners.add(cb)),
    removeEventListener: vi.fn((_type: string, cb: () => void) => listeners.delete(cb)),
    set(next: string) {
      status.state = next;
      for (const cb of listeners) cb();
    },
    listeners,
  };
  return status;
}

afterEach(() => vi.unstubAllGlobals());

describe('useLocalAccessState', () => {
  it('is unsupported without a Permissions API, or when no spelling of the permission exists', async () => {
    vi.stubGlobal('navigator', {});
    expect(renderHook(() => useLocalAccessState()).result.current).toBe('unsupported');

    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn(async () => {
          throw new TypeError('not a valid PermissionName');
        }),
      },
    });
    const { result } = renderHook(() => useLocalAccessState());
    expect(result.current).toBe('unknown');
    await waitFor(() => expect(result.current).toBe('unsupported'));
  });

  it('reports prompt and denied as blocking, granted as not', async () => {
    for (const [state, blocked] of [
      ['prompt', true],
      ['denied', true],
      ['granted', false],
    ] as const) {
      vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => fakeStatus(state)) } });
      const { result, unmount } = renderHook(() => useLocalAccessState());
      await waitFor(() => expect(result.current).toBe(state));
      expect(localAccessBlocked(result.current)).toBe(blocked);
      unmount();
    }
    expect(localAccessBlocked('unsupported')).toBe(false);
    expect(localAccessBlocked('unknown')).toBe(false);
  });

  it('follows the change event (the user allowed access), and stops listening on unmount', async () => {
    const status = fakeStatus('prompt');
    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => status) } });
    const { result, unmount } = renderHook(() => useLocalAccessState());
    await waitFor(() => expect(result.current).toBe('prompt'));
    act(() => status.set('granted'));
    expect(result.current).toBe('granted');
    act(() => status.set('denied'));
    expect(result.current).toBe('denied');
    unmount();
    expect(status.listeners.size).toBe(0);
  });
});

describe('useLocalAccessNoticeSlot', () => {
  beforeEach(() => resetLocalAccessNoticeSlot());

  it('gives the slot to the first mounted instance and hands it on when that one unmounts', async () => {
    const first = renderHook(() => useLocalAccessNoticeSlot());
    await waitFor(() => expect(first.result.current).toBe(true));
    const second = renderHook(() => useLocalAccessNoticeSlot());
    await waitFor(() => expect(second.result.current).toBe(false));
    expect(first.result.current).toBe(true);
    first.unmount();
    await waitFor(() => expect(second.result.current).toBe(true));
  });

  it('prefers the higher priority (a page top) over an earlier mounted inline instance', async () => {
    const inline = renderHook(() => useLocalAccessNoticeSlot(0));
    await waitFor(() => expect(inline.result.current).toBe(true));
    const pageTop = renderHook(() => useLocalAccessNoticeSlot(1));
    await waitFor(() => expect(pageTop.result.current).toBe(true));
    expect(inline.result.current).toBe(false);
    pageTop.unmount();
    await waitFor(() => expect(inline.result.current).toBe(true));
  });
});
