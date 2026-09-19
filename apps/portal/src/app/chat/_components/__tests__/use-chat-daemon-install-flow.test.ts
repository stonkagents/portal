/**
 * Purpose: Tests for useChatDaemonInstallFlow — detection comes from DaemonProvider's
 *          install watch; the hook never polls localhost on its own (PERF-3).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const daemon = vi.hoisted(() => ({
  connected: false,
  health: { status: 'offline' },
  installWatch: { active: false, timedOut: false },
  startInstallWatch: vi.fn(),
  stopInstallWatch: vi.fn(),
}));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => daemon }));
const recordDaemonInstall = vi.hoisted(() => vi.fn());
vi.mock('@/lib/user-profile', () => ({ recordDaemonInstall }));

import { useChatDaemonInstallFlow } from '../use-chat-daemon-install-flow';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  daemon.connected = false;
  daemon.health = { status: 'offline' };
  daemon.installWatch = { active: false, timedOut: false };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useChatDaemonInstallFlow', () => {
  it('starts the provider install watch on Download and walks waiting → detecting → live → idle', () => {
    const onLive = vi.fn();
    const { result, rerender } = renderHook(() => useChatDaemonInstallFlow(onLive));
    expect(result.current.installStep).toBe('idle');

    act(() => result.current.handleDownload());
    expect(result.current.installStep).toBe('waiting');
    expect(daemon.startInstallWatch).toHaveBeenCalledOnce();

    daemon.health = { status: 'starting' };
    rerender();
    expect(result.current.installStep).toBe('detecting');

    daemon.connected = true;
    daemon.health = { status: 'ok' };
    rerender();
    expect(result.current.installStep).toBe('live');
    expect(recordDaemonInstall).toHaveBeenCalledOnce();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.installStep).toBe('idle');
    expect(onLive).toHaveBeenCalledOnce();
  });

  it('reports the watch timeout and retries through the provider', () => {
    const { result, rerender } = renderHook(() => useChatDaemonInstallFlow());
    act(() => result.current.handleDownload());
    daemon.installWatch = { active: false, timedOut: true };
    rerender();
    expect(result.current.installTimeout).toBe(true);
    act(() => result.current.setInstallTimeout(false));
    expect(daemon.startInstallWatch).toHaveBeenCalledTimes(2);
    act(() => result.current.setInstallTimeout(true));
    expect(daemon.stopInstallWatch).toHaveBeenCalledOnce();
  });
});
