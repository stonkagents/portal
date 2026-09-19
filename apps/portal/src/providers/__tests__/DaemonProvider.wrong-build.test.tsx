/**
 * Purpose: Regression for the owner's observation of 2026-09-17. The Dev site was
 *          reading the board through a healthy Staging agent answering on the
 *          configured port (a 2.3.1 build, whose /status names neither tracker_url
 *          nor environment), so "online" showed the staging board (his one post) and
 *          "offline" the dev tracker (everyone's posts). Through the real
 *          daemonApi.health (not a mock of it) and the real provider: such an agent
 *          reads as not connected, its tracker host comes from the setup status, the
 *          mismatch names the Staging build, and the board hooks therefore take the
 *          tracker path. A 2.4.x Staging agent (fields present) and a Dev agent are
 *          checked the same way.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

/* This site: the Dev deployment at 2fb0080, talking to the dev tracker and the dev agent port. */
vi.mock('@/lib/config/app.config', () => ({
  appConfig: {
    daemonUrl: 'http://127.0.0.1:7861/api/v1',
    trackerUrl: 'https://tracker.dev.stonkagents.com',
    apiBaseUrl: 'https://tracker.dev.stonkagents.com',
    controllerUrl: 'http://127.0.0.1:7860',
    useRealDaemon: true,
    downloadBaseUrl: 'https://releases.dev.stonkagents.com',
  },
}));
vi.mock('@/config', () => ({ config: { env: 'dev', api: { trackerUrl: 'https://tracker.dev.stonkagents.com' } } }));
const mockProfile = vi.hoisted(() => ({ value: { hasInstalledDaemon: true } as { hasInstalledDaemon?: boolean } | null }));
vi.mock('@/lib/user-profile', () => ({ getProfile: () => mockProfile.value }));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DaemonProvider, useDaemon } from '../DaemonProvider';
import { useCommunityInfinite } from '@/lib/api/hooks/use-community';

const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

type Agent = { status: Record<string, unknown>; setup?: Record<string, unknown> };

/** The owner's staging 2.3.1 agent as it answered on 2026-09-17: no environment fields on /status, the tracker only in the setup check. */
const STAGING_2_3_1: Agent = {
  status: { daemon: { version: '2.3.1', peer_id: '12D3KooWAHPvT9yzT3mbNp5TUCaDTgVr1Ed4qbkz8AXcRSBXKeHc' }, network: { connected: true, peers: 1 }, tracker_registered: true },
  setup: { checks: [{ id: 'service', status: 'ok' }, { id: 'tracker', status: 'ok', detail: { apiKeyPresent: true, trackerUrl: 'https://tracker.stg.stonkagents.com' } }] },
};
/** A 2.4.x staging build says so on /status. */
const STAGING_2_4: Agent = {
  status: { daemon: { version: '2.4.0', peer_id: 'p-stg' }, network: { peers: 1 }, tracker_url: 'https://tracker.stg.stonkagents.com', environment: 'stg' },
};
/** The dev build this site is for. */
const DEV_2_4: Agent = {
  status: { daemon: { version: '2.4.4', peer_id: 'p-dev' }, network: { peers: 1 }, tracker_url: 'https://tracker.dev.stonkagents.com', environment: 'dev' },
};

/** Answers the agent on the configured port and the board on either host. */
function serve(agent: Agent) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url === 'http://127.0.0.1:7861/health') return json({ status: 'healthy', version: agent.status.daemon && (agent.status.daemon as { version: string }).version, uptime_seconds: 5 });
    if (url === 'http://127.0.0.1:7861/api/v1/status') return json(agent.status);
    if (url === 'http://127.0.0.1:7861/api/v1/setup/status') return agent.setup ? json(agent.setup) : new Response('{}', { status: 404 });
    if (url.includes('/board/posts')) return json({ data: [], meta: { total: 0, limit: 20, offset: 0 } });
    return new Response('{}', { status: 404 });
  });
}

const wrapper = ({ children }: { children: ReactNode }) => createElement(DaemonProvider, null, children);

async function flush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('Dev site with an agent of another build on the configured port (owner observation, 2026-09-17)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(WINDOWS_UA);
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('a healthy Staging 2.3.1 agent (no environment fields) is not connected: its tracker comes from the setup status', async () => {
    const spy = serve(STAGING_2_3_1);
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(300);

    expect(result.current.connected).toBe(false);
    expect(result.current.daemonStatus).toBe('offline');
    expect(result.current.envMismatch).toEqual({ agentEnv: 'stg', agentTrackerHost: 'tracker.stg.stonkagents.com', siteEnv: 'dev' });
    const urls = spy.mock.calls.map(c => String(c[0]));
    expect(urls).toContain('http://127.0.0.1:7861/api/v1/setup/status');
  });

  it('a healthy Staging 2.4.x agent (fields present) is not connected either, without the setup status', async () => {
    const spy = serve(STAGING_2_4);
    const { result } = renderHook(() => useDaemon(), { wrapper });
    await flush(300);

    expect(result.current.connected).toBe(false);
    expect(result.current.envMismatch).toEqual({ agentEnv: 'stg', agentTrackerHost: 'tracker.stg.stonkagents.com', siteEnv: 'dev' });
    expect(spy.mock.calls.some(c => String(c[0]).includes('/setup/status'))).toBe(false);
  });

  it('the board is read from the dev tracker while the wrong build answers, and through the agent once the dev build does', async () => {
    const spy = serve(STAGING_2_3_1);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => ({ daemon: useDaemon(), board: useCommunityInfinite() }), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(DaemonProvider, null, createElement(QueryClientProvider, { client: qc }, children)),
    });
    await flush(300);
    expect(result.current.daemon.connected).toBe(false);
    await flush(300);
    let boardUrls = spy.mock.calls.map(c => String(c[0])).filter(u => u.includes('/board/posts'));
    expect(boardUrls.length).toBeGreaterThan(0);
    expect(boardUrls.every(u => u.startsWith('https://tracker.dev.stonkagents.com/api/board/posts'))).toBe(true);

    /* The owner installs the Dev build on 7861: the next poll connects and the board goes through the agent. */
    spy.mockRestore();
    const devSpy = serve(DEV_2_4);
    await flush(5_500);
    expect(result.current.daemon.connected).toBe(true);
    expect(result.current.daemon.envMismatch).toBeNull();
    await flush(300);
    boardUrls = devSpy.mock.calls.map(c => String(c[0])).filter(u => u.includes('/board/posts'));
    expect(boardUrls.length).toBeGreaterThan(0);
    expect(boardUrls.every(u => u.startsWith('http://127.0.0.1:7861/api/v1/portal/board/posts'))).toBe(true);
  });
});
