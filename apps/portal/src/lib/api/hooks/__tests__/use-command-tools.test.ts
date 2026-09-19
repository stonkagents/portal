/**
 * Purpose: Tests for the command tools hooks: idle offline, the poll cadence
 *          (5 s while running, 60 s otherwise), the visibility and blocking
 *          rules, and the retry mutation's optimistic "running" state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as ClientModule from '@/lib/api/daemon-command-tools';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { CommandToolsStatus } from '@/lib/api/daemon-command-tools';

const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const client = vi.hoisted(() => ({
  getCommandToolsStatus: vi.fn(),
  retryCommandTools: vi.fn(),
}));
vi.mock('@/lib/api/daemon-command-tools', async importOriginal => {
  const actual = await importOriginal<typeof ClientModule>();
  return { ...actual, ...client };
});

import {
  COMMAND_TOOLS_POLL_IDLE_MS,
  COMMAND_TOOLS_POLL_RUNNING_MS,
  COMMAND_TOOLS_READY_VISIBLE_MS,
  commandToolsBlocking,
  commandToolsPending,
  commandToolsVisible,
  useCommandTools,
  useRetryCommandTools,
} from '../use-command-tools';
import { queryKeys } from '@/lib/api/keys';

function status(overrides: Partial<CommandToolsStatus> = {}): CommandToolsStatus {
  return {
    state: 'running',
    phase: 'Downloading the command tools',
    detail: '213 package files ready',
    startedAt: '2026-09-17T12:00:00Z',
    updatedAt: '2026-09-17T12:01:42Z',
    finishedAt: null,
    error: null,
    logPath: null,
    attempt: 1,
    cliPresent: false,
    gatewayRunning: false,
    taskName: 'StonkAgents command tools',
    supported: true,
    ...overrides,
  };
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('commandToolsVisible', () => {
  const now = Date.parse('2026-09-17T12:10:00Z');
  it('shows running and failed jobs, and a ready job for a minute', () => {
    expect(commandToolsVisible(status(), now)).toBe(true);
    expect(commandToolsVisible(status({ state: 'failed', error: 'boom' }), now)).toBe(true);
    expect(commandToolsVisible(status({ state: 'ready', finishedAt: '2026-09-17T12:09:30Z' }), now)).toBe(true);
    expect(
      commandToolsVisible(
        status({ state: 'ready', finishedAt: new Date(now - COMMAND_TOOLS_READY_VISIBLE_MS - 1000).toISOString() }),
        now,
      ),
    ).toBe(false);
    expect(commandToolsVisible(status({ state: 'ready', finishedAt: null }), now)).toBe(false);
  });
  it('hides jobs that never started, unsupported platforms and unknown agents', () => {
    expect(commandToolsVisible(status({ state: 'not_started' }), now)).toBe(false);
    expect(commandToolsVisible(status({ supported: false }), now)).toBe(false);
    expect(commandToolsVisible(null, now)).toBe(false);
    expect(commandToolsVisible(undefined, now)).toBe(false);
  });
});

describe('commandToolsPending / commandToolsBlocking', () => {
  it('blocks tool-dependent controls while a known job is running, not started, or failed', () => {
    expect(commandToolsBlocking(status())).toBe(true);
    expect(commandToolsBlocking(status({ state: 'failed' }))).toBe(true);
    expect(commandToolsBlocking(status({ state: 'ready' }))).toBe(false);
    expect(commandToolsBlocking(status({ state: 'not_started' }))).toBe(true);
    expect(commandToolsBlocking(status({ supported: false }))).toBe(false);
    expect(commandToolsBlocking(null)).toBe(false);
  });

  it('says why: running (a job that never started counts as setting up) or failed', () => {
    expect(commandToolsPending(status())).toBe('running');
    expect(commandToolsPending(status({ state: 'not_started' }))).toBe('running');
    expect(commandToolsPending(status({ state: 'failed' }))).toBe('failed');
    expect(commandToolsPending(status({ state: 'ready' }))).toBeNull();
    expect(commandToolsPending(status({ state: 'running', supported: false }))).toBeNull();
    expect(commandToolsPending(undefined)).toBeNull();
  });

  it('lets a never-started job through when the gateway answers anyway (the tools are there)', () => {
    expect(commandToolsPending(status({ state: 'not_started' }), true)).toBeNull();
    expect(commandToolsPending(status({ state: 'not_started', gatewayRunning: true }))).toBeNull();
    // A running or failed job still waits, whatever the gateway says.
    expect(commandToolsPending(status({ state: 'running' }), true)).toBe('running');
    expect(commandToolsPending(status({ state: 'failed' }), true)).toBe('failed');
  });
});

describe('useCommandTools', () => {
  it('loads the status from the controller', async () => {
    client.getCommandToolsStatus.mockResolvedValueOnce(status());
    const { result } = renderHook(() => useCommandTools(), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.data?.state).toBe('running'));
    expect(result.current.data?.detail).toBe('213 package files ready');
  });

  it('asks nothing while the agent is offline', () => {
    mockDaemon.connected = false;
    const { result } = renderHook(() => useCommandTools(), { wrapper: wrapperFor(makeClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(client.getCommandToolsStatus).not.toHaveBeenCalled();
  });

  it('polls every 5 s while the job runs and every 60 s otherwise', async () => {
    vi.useFakeTimers();
    try {
      client.getCommandToolsStatus.mockResolvedValue(status());
      const { result } = renderHook(() => useCommandTools(), { wrapper: wrapperFor(makeClient()) });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.data?.state).toBe('running');
      expect(client.getCommandToolsStatus).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COMMAND_TOOLS_POLL_RUNNING_MS + 50);
      });
      expect(client.getCommandToolsStatus).toHaveBeenCalledTimes(2);

      // Old news: a ready job from long ago polls at the idle cadence.
      client.getCommandToolsStatus.mockResolvedValue(status({ state: 'ready', finishedAt: '2020-01-01T00:00:00Z' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COMMAND_TOOLS_POLL_RUNNING_MS + 50);
      });
      expect(result.current.data?.state).toBe('ready');
      const calls = client.getCommandToolsStatus.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COMMAND_TOOLS_POLL_RUNNING_MS * 4);
      });
      expect(client.getCommandToolsStatus).toHaveBeenCalledTimes(calls);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COMMAND_TOOLS_POLL_IDLE_MS);
      });
      expect(client.getCommandToolsStatus).toHaveBeenCalledTimes(calls + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useRetryCommandTools', () => {
  it('flips the cached status to running on success and refetches', async () => {
    const qc = makeClient();
    qc.setQueryData(queryKeys.daemon.commandTools, status({ state: 'failed', error: 'exited 1', finishedAt: '2026-09-17T12:05:00Z' }));
    client.retryCommandTools.mockResolvedValueOnce({ kind: 'ok', attempt: 2 });
    client.getCommandToolsStatus.mockResolvedValue(status({ attempt: 2 }));
    const { result } = renderHook(() => useRetryCommandTools(), { wrapper: wrapperFor(qc) });
    await act(async () => {
      await result.current.mutateAsync();
    });
    const cached = qc.getQueryData<CommandToolsStatus>(queryKeys.daemon.commandTools);
    expect(cached?.state).toBe('running');
    expect(cached?.error).toBeNull();
    expect(cached?.finishedAt).toBeNull();
  });

  it("surfaces the controller's refusal as the mutation error", async () => {
    client.retryCommandTools.mockResolvedValueOnce({ kind: 'error', code: 'NO_USER', message: 'Nobody is logged on' });
    const { result } = renderHook(() => useRetryCommandTools(), { wrapper: wrapperFor(makeClient()) });
    await act(async () => {
      await result.current.mutateAsync().catch(() => undefined);
    });
    await waitFor(() => expect(result.current.error?.message).toBe('Nobody is logged on'));
  });
});
