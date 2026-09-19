/**
 * Purpose: Tests for the agent probe behind the download (health and status
 *          with their caps, no live agent ever touched) and for the decision:
 *          nothing installed downloads, another build downloads with a
 *          mismatch, an up to date or uncomparable agent is "installed", an
 *          older one is an "update", and a missing manifest never downloads
 *          over a working agent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/api/daemon', () => ({
  DAEMON_API_V1: 'http://127.0.0.1:7861/api/v1',
  STATUS_TIMEOUT_MS: 4000,
  withLoopbackTarget: (_url: string, init?: RequestInit) => init ?? {},
}));

import {
  AGENT_HEALTH_URL,
  AGENT_PROBE_TIMEOUT_MS,
  AGENT_STATUS_URL,
  checkInstalledAgent,
  decideDownload,
  probeInstalledAgent,
  type InstalledAgent,
  type SiteIdentity,
} from '../installed-agent';

const devSite: SiteIdentity = { trackerUrl: 'https://tracker.dev.stonkagents.com', env: 'dev' };
const devAgent: InstalledAgent = { version: '2.6.1', trackerUrl: 'https://tracker.dev.stonkagents.com', environment: 'dev' };

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('probeInstalledAgent', () => {
  it('reads the version from /health and the build from /status', async () => {
    const fetch = vi.fn(async (url: string) =>
      url === AGENT_HEALTH_URL
        ? jsonResponse({ status: 'healthy', version: ' 2.6.1 ' })
        : jsonResponse({ tracker_url: 'https://tracker.dev.stonkagents.com', environment: 'dev' }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(probeInstalledAgent()).resolves.toEqual(devAgent);
    expect(fetch.mock.calls.map(c => c[0])).toEqual([AGENT_HEALTH_URL, AGENT_STATUS_URL]);
    expect(AGENT_HEALTH_URL).toBe('http://127.0.0.1:7861/health');
  });

  it('is null when nothing answers /health, and never asks /status then', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetch);
    await expect(probeInstalledAgent()).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false)));
    await expect(probeInstalledAgent()).resolves.toBeNull();
  });

  it('gives /health three seconds, then counts the agent as not installed', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))),
    );
    const pending = probeInstalledAgent();
    await vi.advanceTimersByTimeAsync(AGENT_PROBE_TIMEOUT_MS + 1);
    await expect(pending).resolves.toBeNull();
  });

  it('keeps an agent whose /status fails (an older daemon) with an unknown build', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === AGENT_HEALTH_URL) return jsonResponse({ status: 'healthy', version: '2.3.0' });
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(probeInstalledAgent()).resolves.toEqual({ version: '2.3.0', trackerUrl: '', environment: '' });
  });
});

describe('decideDownload', () => {
  it('downloads when nothing is installed', () => {
    expect(decideDownload(null, '2.6.1', devSite)).toEqual({ kind: 'download' });
  });

  it("downloads this site's build over another environment's agent, naming the mismatch", () => {
    const stg: InstalledAgent = { version: '9.0.0', trackerUrl: 'https://tracker.stg.stonkagents.com', environment: 'stg' };
    expect(decideDownload(stg, '2.6.1', devSite)).toEqual({
      kind: 'mismatch',
      mismatch: { agentEnv: 'stg', agentTrackerHost: 'tracker.stg.stonkagents.com', siteEnv: 'dev' },
    });
  });

  it('is installed when the agent is the site release or newer', () => {
    expect(decideDownload(devAgent, '2.6.1', devSite)).toEqual({ kind: 'installed', version: '2.6.1' });
    expect(decideDownload({ ...devAgent, version: '2.7.0' }, '2.6.1', devSite)).toEqual({ kind: 'installed', version: '2.7.0' });
  });

  it('is an update when the agent is older', () => {
    expect(decideDownload({ ...devAgent, version: '2.5.9' }, '2.6.1', devSite)).toEqual({ kind: 'update', current: '2.5.9', latest: '2.6.1' });
  });

  it('never downloads over a working agent when the versions cannot be compared (no manifest, a dev build)', () => {
    expect(decideDownload(devAgent, undefined, devSite)).toEqual({ kind: 'installed', version: '2.6.1' });
    expect(decideDownload({ ...devAgent, version: 'dev' }, '2.6.1', devSite)).toEqual({ kind: 'installed', version: 'dev' });
  });

  it('treats an agent that names no build as this site\'s (an older daemon)', () => {
    expect(decideDownload({ version: '2.3.0', trackerUrl: '', environment: '' }, '2.6.1', devSite)).toEqual({
      kind: 'update',
      current: '2.3.0',
      latest: '2.6.1',
    });
  });
});

describe('checkInstalledAgent', () => {
  it('asks for the site release only once an agent answered, and downloads when the probe throws', async () => {
    const siteVersion = vi.fn(async () => '2.6.1');
    await expect(checkInstalledAgent({ probe: async () => null, siteVersion, site: devSite })).resolves.toEqual({ kind: 'download' });
    expect(siteVersion).not.toHaveBeenCalled();

    await expect(checkInstalledAgent({ probe: async () => devAgent, siteVersion, site: devSite })).resolves.toEqual({
      kind: 'installed',
      version: '2.6.1',
    });
    expect(siteVersion).toHaveBeenCalledTimes(1);

    await expect(
      checkInstalledAgent({
        probe: async () => {
          throw new Error('boom');
        },
        siteVersion,
        site: devSite,
      }),
    ).resolves.toEqual({ kind: 'download' });
  });

  it('keeps a working agent when the manifest fetch throws', async () => {
    await expect(
      checkInstalledAgent({
        probe: async () => ({ ...devAgent, version: '1.0.0' }),
        siteVersion: async () => {
          throw new Error('manifest down');
        },
        site: devSite,
      }),
    ).resolves.toEqual({ kind: 'installed', version: '1.0.0' });
  });
});
