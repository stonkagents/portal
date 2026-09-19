/**
 * Purpose: Tests for the gate's state machine: granted and unsupported go on to
 *          the agent probe (granted is remembered), denied and dismissed keep
 *          the dialog with their own phase, two failures unlock the bypass, a
 *          throwing check proceeds; the live permission flipping to granted
 *          while denied advances to `allowed` and then probes on its own; the
 *          probe's four verdicts (nothing there, wrong build, up to date,
 *          update) and the "gate needed" feature test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/daemon', () => ({
  DAEMON_API_V1: 'http://127.0.0.1:7861/api/v1',
  STATUS_TIMEOUT_MS: 4000,
  withLoopbackTarget: (_url: string, init?: RequestInit) => init ?? {},
}));

import { LOCAL_ACCESS_GRANTED_KEY, type LocalAccessOutcome } from '../local-network-access';
import type { DownloadDecision } from '../installed-agent';
import {
  ALLOWED_NOTICE_MS,
  LOCAL_ACCESS_MAX_ATTEMPTS,
  MISMATCH_NOTICE_MS,
  useLocalAccessGate,
  useLocalAccessGateNeeded,
} from '../use-local-access-gate';

const nothingInstalled = async (): Promise<DownloadDecision> => ({ kind: 'download' });

beforeEach(() => {
  sessionStorage.clear();
  /* No test here may reach a real agent: every fetch fails as if nothing were installed. */
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useLocalAccessGate', () => {
  it('proceeds on granted and remembers it for the session', async () => {
    const onProceed = vi.fn();
    const { result } = renderHook(() => useLocalAccessGate(onProceed, { check: async () => 'granted', checkAgent: nothingInstalled }));
    expect(result.current.phase).toBe('intro');
    await act(() => result.current.attempt());
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('intro');
    expect(sessionStorage.getItem(LOCAL_ACCESS_GRANTED_KEY)).toBe('1');
  });

  it('proceeds at once when the browser has no such permission, without remembering anything', async () => {
    const onProceed = vi.fn();
    const { result } = renderHook(() =>
      useLocalAccessGate(onProceed, { check: async () => 'unsupported', checkAgent: nothingInstalled }),
    );
    await act(() => result.current.attempt());
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(LOCAL_ACCESS_GRANTED_KEY)).toBeNull();
  });

  it('shows checking while the browser asks, then the outcome as the phase', async () => {
    let resolve!: (o: LocalAccessOutcome) => void;
    const check = () => new Promise<LocalAccessOutcome>(r => (resolve = r));
    const onProceed = vi.fn();
    const { result } = renderHook(() => useLocalAccessGate(onProceed, { check, checkAgent: nothingInstalled }));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.attempt();
    });
    expect(result.current.phase).toBe('checking');
    await act(async () => {
      resolve('denied');
      await pending;
    });
    expect(result.current.phase).toBe('denied');
    expect(result.current.attempts).toBe(1);
    expect(result.current.canBypass).toBe(false);
    expect(onProceed).not.toHaveBeenCalled();
  });

  it('keeps the dialog on a dismissed prompt and unlocks Download anyway after two failures', async () => {
    const onProceed = vi.fn();
    const checkAgent = vi.fn(nothingInstalled);
    const { result } = renderHook(() => useLocalAccessGate(onProceed, { check: async () => 'prompt', checkAgent }));
    for (let i = 0; i < LOCAL_ACCESS_MAX_ATTEMPTS; i++) await act(() => result.current.attempt());
    expect(result.current.phase).toBe('prompt');
    expect(result.current.attempts).toBe(LOCAL_ACCESS_MAX_ATTEMPTS);
    expect(result.current.canBypass).toBe(true);
    expect(onProceed).not.toHaveBeenCalled();
    expect(checkAgent).not.toHaveBeenCalled();
    act(() => result.current.bypass());
    /* The bypass is a bypass: no agent probe either. */
    expect(onProceed).toHaveBeenCalledTimes(1);
    expect(checkAgent).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('intro');
    expect(result.current.canBypass).toBe(false);
    expect(sessionStorage.getItem(LOCAL_ACCESS_GRANTED_KEY)).toBeNull();
  });

  it('proceeds when the check itself throws, and reset returns to the intro', async () => {
    const onProceed = vi.fn();
    const { result } = renderHook(() =>
      useLocalAccessGate(onProceed, {
        check: async () => {
          throw new Error('boom');
        },
        checkAgent: nothingInstalled,
      }),
    );
    await act(() => result.current.attempt());
    expect(onProceed).toHaveBeenCalledTimes(1);

    const denied = renderHook(() => useLocalAccessGate(vi.fn(), { check: async () => 'denied', checkAgent: nothingInstalled }));
    await act(() => denied.result.current.attempt());
    expect(denied.result.current.phase).toBe('denied');
    act(() => denied.result.current.reset());
    expect(denied.result.current.phase).toBe('intro');
    expect(denied.result.current.attempts).toBe(0);
  });

  describe('the permission watched live', () => {
    /** A PermissionStatus whose "change" the test fires by hand. */
    function liveStatus(state: string) {
      const listeners: Array<() => void> = [];
      const status = {
        state,
        addEventListener: vi.fn((_type: string, listener: () => void) => {
          listeners.push(listener);
        }),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => status) } });
      return {
        status,
        flip(next: string) {
          status.state = next;
          for (const listener of listeners) listener();
        },
      };
    }

    it('denied, then granted from the site settings: allowed, remembered, and the probe proceeds after the notice', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const live = liveStatus('denied');
      const onProceed = vi.fn();
      const checkAgent = vi.fn(nothingInstalled);
      const { result } = renderHook(() => useLocalAccessGate(onProceed, { check: async () => 'denied', checkAgent }));
      await act(async () => {
        await result.current.attempt();
      });
      expect(result.current.phase).toBe('denied');
      await waitFor(() => expect(live.status.addEventListener).toHaveBeenCalled());

      act(() => live.flip('granted'));
      expect(result.current.phase).toBe('allowed');
      expect(sessionStorage.getItem(LOCAL_ACCESS_GRANTED_KEY)).toBe('1');
      expect(checkAgent).not.toHaveBeenCalled();
      expect(onProceed).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(ALLOWED_NOTICE_MS);
      });
      expect(checkAgent).toHaveBeenCalledTimes(1);
      expect(onProceed).toHaveBeenCalledTimes(1);
      expect(result.current.phase).toBe('intro');
    });

    it('closing the dialog during the allowed notice cancels the probe', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const live = liveStatus('denied');
      const onProceed = vi.fn();
      const checkAgent = vi.fn(nothingInstalled);
      const { result } = renderHook(() => useLocalAccessGate(onProceed, { check: async () => 'denied', checkAgent }));
      await act(async () => {
        await result.current.attempt();
      });
      await waitFor(() => expect(live.status.addEventListener).toHaveBeenCalled());
      act(() => live.flip('granted'));
      expect(result.current.phase).toBe('allowed');
      act(() => result.current.reset());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ALLOWED_NOTICE_MS * 2);
      });
      expect(checkAgent).not.toHaveBeenCalled();
      expect(onProceed).not.toHaveBeenCalled();
      expect(result.current.phase).toBe('intro');
    });
  });

  describe('the agent probe after the permission', () => {
    it('runs only once the permission is granted, and downloads when nothing is installed', async () => {
      const onProceed = vi.fn();
      const checkAgent = vi.fn(nothingInstalled);
      const { result } = renderHook(() => useLocalAccessGate(onProceed, { check: async () => 'granted', checkAgent }));
      await act(() => result.current.attempt());
      expect(checkAgent).toHaveBeenCalledTimes(1);
      expect(onProceed).toHaveBeenCalledTimes(1);
      expect(result.current.agent).toBeNull();
    });

    it('checkAgent alone (permission granted or absent on the click) downloads when nothing answers, and when the probe throws', async () => {
      const onProceed = vi.fn();
      const check = vi.fn(async (): Promise<LocalAccessOutcome> => 'granted');
      const { result } = renderHook(() => useLocalAccessGate(onProceed, { check, checkAgent: nothingInstalled }));
      expect(await act(() => result.current.checkAgent())).toBe(true);
      expect(check).not.toHaveBeenCalled();
      expect(onProceed).toHaveBeenCalledTimes(1);

      const throwing = renderHook(() =>
        useLocalAccessGate(onProceed, {
          checkAgent: async () => {
            throw new Error('boom');
          },
        }),
      );
      expect(await act(() => throwing.result.current.checkAgent())).toBe(true);
      expect(onProceed).toHaveBeenCalledTimes(2);
    });

    it("wrong build: shows the mismatch line, then downloads this site's build on its own", async () => {
      vi.useFakeTimers();
      const onProceed = vi.fn();
      const decision: DownloadDecision = {
        kind: 'mismatch',
        mismatch: { agentEnv: 'stg', agentTrackerHost: 'tracker.stg.stonkagents.com', siteEnv: 'dev' },
      };
      const { result } = renderHook(() => useLocalAccessGate(onProceed, { checkAgent: async () => decision }));
      expect(await act(() => result.current.checkAgent())).toBe(false);
      expect(result.current.phase).toBe('mismatch');
      expect(result.current.agent).toEqual(decision);
      expect(onProceed).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(MISMATCH_NOTICE_MS);
      });
      expect(onProceed).toHaveBeenCalledTimes(1);
      expect(result.current.phase).toBe('intro');
      expect(result.current.agent).toBeNull();
    });

    it('wrong build: closing the dialog before the notice ends cancels the download', async () => {
      vi.useFakeTimers();
      const onProceed = vi.fn();
      const { result } = renderHook(() =>
        useLocalAccessGate(onProceed, {
          checkAgent: async () => ({ kind: 'mismatch', mismatch: { agentEnv: 'prd', agentTrackerHost: '', siteEnv: 'dev' } }),
        }),
      );
      await act(() => result.current.checkAgent());
      act(() => result.current.reset());
      act(() => {
        vi.advanceTimersByTime(MISMATCH_NOTICE_MS * 2);
      });
      expect(onProceed).not.toHaveBeenCalled();
      expect(result.current.phase).toBe('intro');
    });

    it('up to date: downloads nothing, tells the site the agent is there, and Download anyway still works', async () => {
      const onProceed = vi.fn();
      const onInstalled = vi.fn();
      const { result } = renderHook(() =>
        useLocalAccessGate(onProceed, {
          check: async () => 'granted',
          checkAgent: async () => ({ kind: 'installed', version: '2.6.1' }),
          onInstalled,
        }),
      );
      await act(() => result.current.attempt());
      expect(result.current.phase).toBe('installed');
      expect(result.current.agent).toEqual({ kind: 'installed', version: '2.6.1' });
      expect(onProceed).not.toHaveBeenCalled();
      expect(onInstalled).toHaveBeenCalledTimes(1);
      expect(result.current.attempts).toBe(0);
      expect(result.current.canBypass).toBe(false);
      act(() => result.current.bypass());
      expect(onProceed).toHaveBeenCalledTimes(1);
      expect(result.current.phase).toBe('intro');
    });

    it('older: offers the update and downloads only on the click', async () => {
      const onProceed = vi.fn();
      const onInstalled = vi.fn();
      const { result } = renderHook(() =>
        useLocalAccessGate(onProceed, {
          checkAgent: async () => ({ kind: 'update', current: '2.5.0', latest: '2.6.1' }),
          onInstalled,
        }),
      );
      expect(await act(() => result.current.checkAgent())).toBe(false);
      expect(result.current.phase).toBe('update');
      expect(result.current.agent).toEqual({ kind: 'update', current: '2.5.0', latest: '2.6.1' });
      expect(onProceed).not.toHaveBeenCalled();
      expect(onInstalled).not.toHaveBeenCalled();
      act(() => result.current.bypass());
      expect(onProceed).toHaveBeenCalledTimes(1);
    });

    it('ignores a second call while a check is running', async () => {
      let resolve!: (d: DownloadDecision) => void;
      const checkAgent = vi.fn(() => new Promise<DownloadDecision>(r => (resolve = r)));
      const onProceed = vi.fn();
      const { result } = renderHook(() => useLocalAccessGate(onProceed, { checkAgent }));
      let first!: Promise<boolean>;
      act(() => {
        first = result.current.checkAgent();
      });
      expect(result.current.phase).toBe('checking');
      expect(await act(() => result.current.checkAgent())).toBe(false);
      expect(checkAgent).toHaveBeenCalledTimes(1);
      await act(async () => {
        resolve({ kind: 'download' });
        await first;
      });
      expect(onProceed).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useLocalAccessGateNeeded', () => {
  it('is false without a Permissions API (Firefox, Safari, older Chrome) and when granted earlier this session', async () => {
    vi.stubGlobal('navigator', {});
    const { result } = renderHook(() => useLocalAccessGateNeeded());
    expect(result.current).toBe(false);

    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => ({ state: 'prompt' })) } });
    sessionStorage.setItem(LOCAL_ACCESS_GRANTED_KEY, '1');
    const remembered = renderHook(() => useLocalAccessGateNeeded());
    await waitFor(() => expect(remembered.result.current).toBe(false));
  });

  it('is true while the permission exists and is not granted, false once granted or unknown to the browser', async () => {
    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => ({ state: 'prompt' })) } });
    const prompt = renderHook(() => useLocalAccessGateNeeded());
    expect(prompt.result.current).toBeNull();
    await waitFor(() => expect(prompt.result.current).toBe(true));

    vi.stubGlobal('navigator', { permissions: { query: vi.fn(async () => ({ state: 'granted' })) } });
    const granted = renderHook(() => useLocalAccessGateNeeded());
    await waitFor(() => expect(granted.result.current).toBe(false));
    expect(sessionStorage.getItem(LOCAL_ACCESS_GRANTED_KEY)).toBe('1');

    sessionStorage.clear();
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn(async () => {
          throw new TypeError('not a valid PermissionName');
        }),
      },
    });
    const unknown = renderHook(() => useLocalAccessGateNeeded());
    await waitFor(() => expect(unknown.result.current).toBe(false));
  });
});
