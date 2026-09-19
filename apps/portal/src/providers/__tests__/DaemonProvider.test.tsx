/**
 * Purpose: DaemonProvider is the only thing that talks to localhost (PERF-3):
 *          never on platforms without an installer, never on Windows until an
 *          install is recorded or Download is clicked, then with back-off.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const mockHealth = vi.hoisted(() => vi.fn());
const mockControl = vi.hoisted(() => ({ start: vi.fn(), shutdown: vi.fn() }));
vi.mock('@/lib/api/daemon', () => ({
  daemonApi: { health: mockHealth },
  daemonControl: mockControl,
}));

const mockProfile = vi.hoisted(() => ({ value: null as { hasInstalledDaemon?: boolean } | null }));
vi.mock('@/lib/user-profile', () => ({
  getProfile: () => mockProfile.value,
}));

/* This site: the Dev deployment, talking to the dev tracker. */
vi.mock('@/config', () => ({ config: { env: 'dev', api: { trackerUrl: 'https://tracker.dev.stonkagents.com' } } }));

import { DaemonProvider, useDaemon, INSTALL_TIMEOUT_MS } from '../DaemonProvider';

const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
};

const OK = {
  status: 'ok',
  peerId: 'peer-1',
  peers: 2,
  uptimeSeconds: 10,
  sharedAssets: 0,
  transfer: { uploadSpeedBps: 0, downloadSpeedBps: 0, shareRatio: 0, totalUploadedBytes: 0, totalDownloadedBytes: 0 },
  healthIndicators: { natStatus: 'open', dhtReady: true, mdnsReady: true, relayConnected: false },
};

function setUA(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}

const wrapper = ({ children }: { children: ReactNode }) => createElement(DaemonProvider, null, children);

async function flush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('DaemonProvider (PERF-3 platform gate)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockHealth.mockReset();
    mockHealth.mockResolvedValue(null);
    mockProfile.value = null;
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ['macOS', UA.mac],
    ['iPhone', UA.iphone],
    ['Android', UA.android],
  ])('never probes localhost on %s, even with an install recorded', async (_name, ua) => {
    setUA(ua);
    mockProfile.value = { hasInstalledDaemon: true };
    const { result } = renderHook(() => useDaemon(), { wrapper });

    await flush(70_000);

    expect(mockHealth).not.toHaveBeenCalled();
    expect(result.current.support).toBe('unsupported');
    expect(result.current.connected).toBe(false);
    expect(result.current.daemonStatus).toBe('offline');
  });

  it('does nothing on an unsupported platform when asked to refresh, toggle, or watch', async () => {
    setUA(UA.iphone);
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(10);

    await act(async () => {
      await result.current.refresh();
      await result.current.toggleDaemon();
      result.current.startInstallWatch();
    });
    await flush(10_000);

    expect(mockHealth).not.toHaveBeenCalled();
    expect(mockControl.start).not.toHaveBeenCalled();
    expect(result.current.installWatch.active).toBe(false);
  });

  it('discovers slowly on Windows with no recorded install: one probe on load, then 30 s backing off to 2 min', async () => {
    setUA(UA.windows);
    const { result } = renderHook(() => useDaemon(), { wrapper });

    await flush(200);
    expect(mockHealth).toHaveBeenCalledTimes(1);
    expect(result.current.support).toBe('supported');

    /* 30 s, 60 s, 120 s, 120 s: an agent installed outside the site's Download flow is still found. */
    await flush(30_000);
    expect(mockHealth).toHaveBeenCalledTimes(2);
    await flush(60_000);
    expect(mockHealth).toHaveBeenCalledTimes(3);
    await flush(120_000);
    expect(mockHealth).toHaveBeenCalledTimes(4);
  });

  it('probes once on load on Windows when an install is recorded, then backs off while it fails', async () => {
    setUA(UA.windows);
    mockProfile.value = { hasInstalledDaemon: true };
    renderHook(() => useDaemon(), { wrapper });

    await flush(200);
    expect(mockHealth).toHaveBeenCalledTimes(1);

    /* 5 s, 10 s, 20 s, 40 s, 60 s, 60 s … — never every 5 s. */
    await flush(5_000);
    expect(mockHealth).toHaveBeenCalledTimes(2);
    await flush(10_000);
    expect(mockHealth).toHaveBeenCalledTimes(3);
    await flush(20_000);
    expect(mockHealth).toHaveBeenCalledTimes(4);
    await flush(40_000);
    expect(mockHealth).toHaveBeenCalledTimes(5);
    await flush(60_000);
    expect(mockHealth).toHaveBeenCalledTimes(6);
  });

  it('polls every 5 s while connected and pauses in a hidden tab', async () => {
    setUA(UA.windows);
    mockProfile.value = { hasInstalledDaemon: true };
    mockHealth.mockResolvedValue(OK);
    const { result } = renderHook(() => useDaemon(), { wrapper });

    await flush(200);
    expect(result.current.connected).toBe(true);
    const afterFirst = mockHealth.mock.calls.length;

    await flush(10_100);
    expect(mockHealth.mock.calls.length - afterFirst).toBe(2);

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    const beforeHidden = mockHealth.mock.calls.length;
    await flush(30_000);
    expect(mockHealth.mock.calls.length).toBe(beforeHidden);
  });

  it('runs the install watch from Download: 3 → 6 → 12 s, then stops at the timeout and falls back to discovery until a manual retry', async () => {
    setUA(UA.windows);
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(200);
    /* Discovery probes once on load even with nothing recorded. */
    expect(mockHealth).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.startInstallWatch();
    });
    expect(result.current.installWatch.active).toBe(true);
    await flush(200);
    const atStart = mockHealth.mock.calls.length;
    await flush(3_000);
    expect(mockHealth).toHaveBeenCalledTimes(atStart + 1);
    await flush(6_000);
    expect(mockHealth).toHaveBeenCalledTimes(atStart + 2);
    await flush(12_000);
    expect(mockHealth).toHaveBeenCalledTimes(atStart + 3);

    await flush(INSTALL_TIMEOUT_MS);
    expect(result.current.installWatch).toEqual({ active: false, timedOut: true });
    /* After the timeout only the slow discovery cadence remains: at most a few probes in two minutes, never 3 to 12 s apart. */
    const atTimeout = mockHealth.mock.calls.length;
    await flush(120_000);
    expect(mockHealth.mock.calls.length - atTimeout).toBeLessThanOrEqual(5);

    act(() => {
      result.current.startInstallWatch();
    });
    await flush(200);
    expect(result.current.installWatch).toEqual({ active: true, timedOut: false });
  });

  it('ends the install watch and keeps the steady poll once the daemon answers', async () => {
    setUA(UA.windows);
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(200);
    act(() => {
      result.current.startInstallWatch();
    });
    mockHealth.mockResolvedValue(OK);
    await flush(3_200);

    expect(result.current.connected).toBe(true);
    expect(result.current.installWatch.active).toBe(false);
    expect(result.current.health.peerId).toBe('peer-1');
  });
});

describe('DaemonProvider (Kill Switch: stop and resume through the controller)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockHealth.mockReset();
    mockControl.start.mockReset();
    mockControl.shutdown.mockReset();
    mockProfile.value = { hasInstalledDaemon: true };
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    setUA(UA.windows);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('stopAgent posts /stop, flags the stop, and startAgent posts /start and clears it', async () => {
    mockHealth.mockResolvedValue(OK);
    mockControl.shutdown.mockResolvedValue({ status: 'stopped', message: 'daemon service stopped' });
    mockControl.start.mockResolvedValue({ status: 'started', message: 'daemon service started' });
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(200);
    expect(result.current.connected).toBe(true);
    expect(result.current.stoppedByUser).toBe(false);

    /* The controller stops the service synchronously: the next probe finds nothing. */
    mockHealth.mockResolvedValue(null);
    let ok = false;
    await act(async () => {
      ok = await result.current.stopAgent();
    });
    expect(ok).toBe(true);
    expect(mockControl.shutdown).toHaveBeenCalledTimes(1);
    expect(result.current.stoppedByUser).toBe(true);
    expect(result.current.connected).toBe(false);

    mockHealth.mockResolvedValue(OK);
    await act(async () => {
      ok = await result.current.startAgent();
    });
    expect(ok).toBe(true);
    expect(mockControl.start).toHaveBeenCalledTimes(1);
    expect(result.current.stoppedByUser).toBe(false);
    expect(result.current.connected).toBe(true);
  });

  it('keeps the flag off when the controller refuses the stop', async () => {
    mockHealth.mockResolvedValue(OK);
    mockControl.shutdown.mockResolvedValue(null);
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(200);

    let ok = true;
    await act(async () => {
      ok = await result.current.stopAgent();
    });
    expect(ok).toBe(false);
    expect(result.current.stoppedByUser).toBe(false);
    expect(result.current.connected).toBe(true);
  });

  it('clears the flag when the agent comes back on its own after the stop', async () => {
    mockHealth.mockResolvedValue(OK);
    mockControl.shutdown.mockResolvedValue({ status: 'stopped', message: 'daemon service stopped' });
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(200);

    mockHealth.mockResolvedValue(null);
    await act(async () => {
      await result.current.stopAgent();
    });
    expect(result.current.stoppedByUser).toBe(true);
    expect(result.current.connected).toBe(false);

    /* Restarted from the tray: the next successful probe ends safe mode without a click. */
    mockHealth.mockResolvedValue(OK);
    await flush(5_200);
    expect(result.current.connected).toBe(true);
    expect(result.current.stoppedByUser).toBe(false);
    expect(mockControl.start).not.toHaveBeenCalled();
  });

  it('toggleDaemon stops a connected agent and starts a stopped one', async () => {
    mockHealth.mockResolvedValue(OK);
    mockControl.shutdown.mockResolvedValue({ status: 'stopped', message: 'daemon service stopped' });
    mockControl.start.mockResolvedValue({ status: 'started', message: 'daemon service started' });
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(200);

    mockHealth.mockResolvedValue(null);
    await act(async () => {
      await result.current.toggleDaemon();
    });
    expect(mockControl.shutdown).toHaveBeenCalledTimes(1);
    expect(result.current.stoppedByUser).toBe(true);

    mockHealth.mockResolvedValue(OK);
    await act(async () => {
      await result.current.toggleDaemon();
    });
    expect(mockControl.start).toHaveBeenCalledTimes(1);
    expect(result.current.stoppedByUser).toBe(false);
  });
});

describe('DaemonProvider (environment gate: an agent of another environment is not connected)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockHealth.mockReset();
    mockProfile.value = { hasInstalledDaemon: true };
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    setUA(UA.windows);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('connects to an agent whose tracker is this site\'s, and to an older agent that names none', async () => {
    mockHealth.mockResolvedValue({ ...OK, trackerUrl: 'https://TRACKER.dev.stonkagents.com/api/v1', environment: 'dev' });
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(200);
    expect(result.current.connected).toBe(true);
    expect(result.current.envMismatch).toBeNull();

    mockHealth.mockResolvedValue(OK);
    await flush(5_200);
    expect(result.current.connected).toBe(true);
    expect(result.current.envMismatch).toBeNull();
  });

  it('reads a healthy Staging agent as not connected on the Dev site and says which build to install', async () => {
    mockHealth.mockResolvedValue({ ...OK, trackerUrl: 'https://tracker.stg.stonkagents.com', environment: 'stg' });
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(200);

    expect(result.current.connected).toBe(false);
    expect(result.current.daemonStatus).toBe('offline');
    expect(result.current.envMismatch).toEqual({ agentEnv: 'stg', agentTrackerHost: 'tracker.stg.stonkagents.com', siteEnv: 'dev' });
    /* Still a live agent: the steady poll goes on, so swapping the build is noticed without a reload. */
    const calls = mockHealth.mock.calls.length;
    await flush(5_200);
    expect(mockHealth.mock.calls.length).toBe(calls + 1);

    mockHealth.mockResolvedValue({ ...OK, trackerUrl: 'https://tracker.dev.stonkagents.com', environment: 'dev' });
    await flush(5_200);
    expect(result.current.connected).toBe(true);
    expect(result.current.envMismatch).toBeNull();
  });

  it('falls back to the environment label when the agent names no tracker', async () => {
    mockHealth.mockResolvedValue({ ...OK, trackerUrl: '', environment: 'prd' });
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(200);
    expect(result.current.connected).toBe(false);
    expect(result.current.envMismatch).toEqual({ agentEnv: 'prd', agentTrackerHost: '', siteEnv: 'dev' });
  });
});
