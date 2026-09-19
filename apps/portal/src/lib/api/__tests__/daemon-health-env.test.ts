import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config/app.config', () => ({
  appConfig: {
    daemonUrl: 'http://localhost:7841',
    trackerUrl: 'https://tracker.dev.example',
    controllerUrl: 'http://localhost:7840',
    useRealDaemon: true,
    downloadBaseUrl: 'https://releases.dev.example',
  },
}));

import { daemonApi, legacyTrackerUrl, STATUS_TIMEOUT_MS } from '../daemon';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function mockDaemon(status: Record<string, unknown>, setup?: Record<string, unknown>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.endsWith('/health')) return json({ status: 'healthy', version: '2.3.1', uptime_seconds: 5 });
    if (url.endsWith('/api/v1/status')) return json(status);
    if (url.endsWith('/api/v1/setup/status')) return setup ? json(setup) : new Response('{}', { status: 404 });
    return new Response('{}', { status: 404 });
  });
}

afterEach(() => vi.restoreAllMocks());

describe('daemonApi.health environment detection', () => {
  it('reads tracker_url and environment from a 2.4.0 daemon without touching the setup status', async () => {
    mockDaemon({ daemon: { peer_id: 'p1' }, tracker_url: 'https://tracker.stg.example', environment: 'stg' });
    const h = await daemonApi.health();
    expect(h?.trackerUrl).toBe('https://tracker.stg.example');
    expect(h?.environment).toBe('stg');
    expect(
      (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some(c => String(c[0]).includes('/setup/status')),
    ).toBe(false);
  });

  it('falls back to the setup status tracker check on an older daemon', async () => {
    mockDaemon(
      { daemon: { peer_id: 'p1' } },
      {
        checks: [
          { id: 'service', status: 'ok' },
          { id: 'tracker', status: 'ok', detail: { trackerUrl: 'https://tracker.stg.example' } },
        ],
      },
    );
    const h = await daemonApi.health();
    expect(h?.trackerUrl).toBe('https://tracker.stg.example');
    expect(h?.environment).toBe('');
  });

  it('waits longer for the status than for the health probe: a slow tracker must not blank the peer id', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        const url = String(input);
        if (url.endsWith('/health')) return Promise.resolve(json({ status: 'healthy', version: '2.5.0', uptime_seconds: 5 }));
        if (url.endsWith('/api/v1/status')) {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(
              () =>
                resolve(json({ daemon: { peer_id: 'slow-peer' }, tracker_url: 'https://tracker.dev.example', environment: 'dev' })),
              2500,
            );
            init?.signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('aborted', 'AbortError'));
            });
          });
        }
        return Promise.resolve(new Response('{}', { status: 404 }));
      });
      const pending = daemonApi.health();
      await vi.advanceTimersByTimeAsync(3000);
      const h = await pending;
      expect(STATUS_TIMEOUT_MS).toBeGreaterThan(2500);
      expect(h?.peerId).toBe('slow-peer');
      expect(h?.environment).toBe('dev');
    } finally {
      vi.useRealTimers();
    }
  });

  it('legacyTrackerUrl is empty when the setup status is unavailable', async () => {
    mockDaemon({ daemon: { peer_id: 'p1' } });
    expect(await legacyTrackerUrl()).toBe('');
  });
});
