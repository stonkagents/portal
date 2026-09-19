/**
 * Purpose: The releases manifest read has a deadline: a host that accepts the
 *          connection and goes quiet must settle the download button on
 *          "unavailable, try again" rather than "Preparing your download".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/config/app.config', () => ({
  appConfig: { downloadBaseUrl: 'https://releases.example.test/' },
}));

import { getWindowsInstallerUrl, MANIFEST_TIMEOUT_MS } from '../manifest';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('manifest fetch', () => {
  it('asks the configured releases host with an abort signal on the request', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        schema_version: 1,
        latest_version: '2.6.0',
        min_supported: '2.0.0',
        released: '2026-09-18',
        release_notes: '',
        platforms: { 'windows-amd64': { url: '/StonkAgents-Setup-2.6.0.exe', sha256: '', size: 1, installer: { url: '/StonkAgents-Setup-2.6.0.exe', sha256: '', size: 1 } } },
      }),
    });
    expect(await getWindowsInstallerUrl()).toBe('https://releases.example.test/StonkAgents-Setup-2.6.0.exe');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://releases.example.test/manifest.json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(MANIFEST_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('reads a fired deadline as no installer, so the hook can offer a retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    /* A fresh module: the first test's answer is otherwise served from the 15 minute cache. */
    vi.resetModules();
    const fresh = await import('../manifest');
    fetchMock.mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError'));
    expect(await fresh.getWindowsInstallerUrl()).toBeUndefined();
  });
});
