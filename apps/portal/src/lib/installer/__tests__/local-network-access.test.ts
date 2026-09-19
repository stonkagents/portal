/**
 * Purpose: Tests for the local access check behind the Download gate: the
 *          permission name fallback, the outcome for every permission state
 *          (granted, denied, prompt answered, prompt dismissed, timed out, no
 *          such permission, a throwing API), the probe request, the session
 *          memory and the download launcher's fallback.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api/daemon', () => ({
  DAEMON_API_V1: 'http://127.0.0.1:7861/api/v1',
  withLoopbackTarget: (_url: string, init?: RequestInit) => ({ ...(init ?? {}), targetAddressSpace: 'loopback' }),
}));

import {
  LOCAL_ACCESS_GRANTED_KEY,
  LOCAL_ACCESS_PERMISSION_NAMES,
  LOCAL_ACCESS_PROBE_URL,
  checkLocalAccess,
  launchDownload,
  localAccessRemembered,
  permissionsApiPresent,
  probeLocalAgent,
  queryLocalAccessPermission,
  rememberLocalAccessGranted,
} from '../local-network-access';

/** A PermissionStatus stand-in whose state the test flips, firing `change` like the browser does. */
function fakeStatus(state: PermissionState) {
  const target = new EventTarget() as EventTarget & { state: PermissionState; set: (next: PermissionState) => void };
  target.state = state;
  target.set = next => {
    target.state = next;
    target.dispatchEvent(new Event('change'));
  };
  return target as unknown as PermissionStatus & { set: (next: PermissionState) => void };
}

function navWith(query: ((d: { name: string }) => Promise<PermissionStatus>) | undefined): Navigator {
  return (query ? { permissions: { query } } : {}) as unknown as Navigator;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('queryLocalAccessPermission', () => {
  it('returns null when the browser has no Permissions API at all', async () => {
    expect(permissionsApiPresent(navWith(undefined))).toBe(false);
    expect(await queryLocalAccessPermission(navWith(undefined))).toBeNull();
    expect(await queryLocalAccessPermission(undefined)).toBeNull();
  });

  it('tries every known spelling and keeps the first the browser accepts', async () => {
    const asked: string[] = [];
    const status = fakeStatus('prompt');
    const query = vi.fn(async (d: { name: string }) => {
      asked.push(d.name);
      if (d.name === 'local-network-access') return status;
      throw new TypeError(`'${d.name}' is not a valid PermissionName`);
    });
    expect(await queryLocalAccessPermission(navWith(query))).toBe(status);
    expect(asked).toEqual(['loopback-network', 'local-network-access']);
    expect(LOCAL_ACCESS_PERMISSION_NAMES).toContain('local-network');
  });

  it('returns null when every spelling throws (Firefox, Safari, older Chrome)', async () => {
    const query = vi.fn(async () => {
      throw new TypeError('not a valid PermissionName');
    });
    expect(await queryLocalAccessPermission(navWith(query))).toBeNull();
    expect(query).toHaveBeenCalledTimes(LOCAL_ACCESS_PERMISSION_NAMES.length);
  });
});

describe('probeLocalAgent', () => {
  it('fetches the daemon health URL as a loopback request and swallows the failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(probeLocalAgent()).resolves.toBeUndefined();
    expect(LOCAL_ACCESS_PROBE_URL).toBe('http://127.0.0.1:7861/health');
    expect(fetchMock).toHaveBeenCalledWith(
      LOCAL_ACCESS_PROBE_URL,
      expect.objectContaining({ targetAddressSpace: 'loopback', cache: 'no-store' }),
    );
    vi.unstubAllGlobals();
  });
});

describe('checkLocalAccess', () => {
  const probe = vi.fn(async () => {});
  beforeEach(() => probe.mockClear());

  it('is unsupported (download goes ahead) when the browser has no such permission, still firing the probe', async () => {
    expect(await checkLocalAccess({ query: async () => null, probe })).toBe('unsupported');
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('answers granted and denied without a probe', async () => {
    expect(await checkLocalAccess({ query: async () => fakeStatus('granted'), probe })).toBe('granted');
    expect(await checkLocalAccess({ query: async () => fakeStatus('denied'), probe })).toBe('denied');
    expect(probe).not.toHaveBeenCalled();
  });

  it('probes on prompt and reads the answer the user gives in the browser dialog', async () => {
    const status = fakeStatus('prompt');
    const asking = vi.fn(
      () =>
        new Promise<void>(resolve => {
          // The browser shows its prompt; the user clicks Allow a moment later and the fetch goes through.
          setTimeout(() => {
            status.set('granted');
            resolve();
          }, 5);
        }),
    );
    expect(await checkLocalAccess({ query: async () => status, probe: asking })).toBe('granted');
    expect(asking).toHaveBeenCalledTimes(1);

    const blocked = fakeStatus('prompt');
    const refusing = vi.fn(async () => {
      blocked.set('denied');
      throw new TypeError('Failed to fetch');
    });
    expect(await checkLocalAccess({ query: async () => blocked, probe: refusing })).toBe('denied');
  });

  it('stays prompt when the user dismisses the browser dialog (the fetch fails, the state does not move)', async () => {
    const status = fakeStatus('prompt');
    const dismissed = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await checkLocalAccess({ query: async () => status, probe: dismissed })).toBe('prompt');
  });

  it('gives up on a prompt nobody answers after the timeout and aborts the probe', async () => {
    vi.useFakeTimers();
    const status = fakeStatus('prompt');
    let aborted = false;
    const hanging = vi.fn(
      (signal: AbortSignal) =>
        new Promise<void>((_, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const result = checkLocalAccess({ query: async () => status, probe: hanging, promptTimeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1001);
    expect(await result).toBe('prompt');
    expect(aborted).toBe(true);
  });

  it('never traps the user: a throwing API counts as unsupported', async () => {
    expect(
      await checkLocalAccess({
        query: async () => {
          throw new Error('boom');
        },
        probe,
      }),
    ).toBe('unsupported');
    const status = fakeStatus('prompt');
    let calls = 0;
    expect(
      await checkLocalAccess({
        query: async () => {
          if (++calls > 1) throw new Error('boom');
          return status;
        },
        probe: async () => {
          throw new TypeError('Failed to fetch');
        },
      }),
    ).toBe('unsupported');
  });
});

describe('session memory', () => {
  beforeEach(() => sessionStorage.clear());

  it('remembers a granted answer for the session under one key', () => {
    expect(localAccessRemembered()).toBe(false);
    rememberLocalAccessGranted();
    expect(sessionStorage.getItem(LOCAL_ACCESS_GRANTED_KEY)).toBe('1');
    expect(localAccessRemembered()).toBe(true);
  });
});

describe('launchDownload', () => {
  it('opens a new tab and detaches it, or navigates the same tab when the browser refuses the tab', () => {
    const child = { opener: {} } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(child);
    launchDownload('https://releases.example.test/Setup.exe');
    expect(open).toHaveBeenCalledWith('https://releases.example.test/Setup.exe', '_blank');
    expect(child.opener).toBeNull();

    open.mockReturnValue(null);
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { value: { ...original, assign }, writable: true, configurable: true });
    launchDownload('https://releases.example.test/Setup.exe');
    expect(assign).toHaveBeenCalledWith('https://releases.example.test/Setup.exe');
    Object.defineProperty(window, 'location', { value: original, writable: true, configurable: true });
  });
});
