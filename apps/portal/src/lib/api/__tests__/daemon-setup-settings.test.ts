/**
 * Purpose: Tests for the Settings side of the setup client: a fix with a JSON
 *          body (bandwidth caps, storage path), the detail readers the tabs
 *          bind to, and the installer peer-key endpoint with its masking.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  applySetupFix,
  getInstallerPeerKey,
  maskApiKey,
  parsePeerKey,
  PEER_KEY_URL,
  readBandwidthCaps,
  readStoragePath,
  readTrackerUrl,
  SETUP_HEADER,
  setupFixUrl,
} from '../daemon-setup';

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('applySetupFix with a body', () => {
  it('sends the bandwidth caps as the JSON body with the setup headers', async () => {
    fetchMock.mockResolvedValueOnce(json({ check: { id: 'bandwidth', status: 'ok', detail: { uploadMbps: 20, downloadMbps: 100 } } }));
    const res = await applySetupFix('bandwidth', { uploadMbps: 20, downloadMbps: 100 });
    expect(res).toMatchObject({ kind: 'ok', restartRequired: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(setupFixUrl('bandwidth'));
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ uploadMbps: 20, downloadMbps: 100 });
    expect((init.headers as Record<string, string>)[SETUP_HEADER]).toBe('1');
  });

  it('sends the storage path and reads the 202 as restart required', async () => {
    fetchMock.mockResolvedValueOnce(json({ check: { id: 'storage', status: 'ok', detail: { path: 'D:\\agent' } } }, 202));
    const res = await applySetupFix('storage', { path: 'D:\\agent' });
    expect(res).toMatchObject({ kind: 'ok', restartRequired: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ path: 'D:\\agent' });
  });

  it('still sends an empty object when no body is given', async () => {
    fetchMock.mockResolvedValueOnce(json({ check: { id: 'autostart', status: 'ok' } }));
    await applySetupFix('autostart');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('{}');
  });
});

describe('setup detail readers', () => {
  it('reads caps in Mbps, null for an unset cap', () => {
    expect(readBandwidthCaps({ id: 'bandwidth', status: 'ok', detail: { uploadMbps: 20, downloadMbps: 100 } })).toEqual({
      uploadMbps: 20,
      downloadMbps: 100,
    });
    expect(readBandwidthCaps({ id: 'bandwidth', status: 'missing', detail: { uploadMbps: null, downloadMbps: 0 } })).toEqual({
      uploadMbps: null,
      downloadMbps: null,
    });
    expect(readBandwidthCaps(null)).toEqual({ uploadMbps: null, downloadMbps: null });
  });

  it('reads the storage path and the pending one a 202 left behind', () => {
    expect(readStoragePath({ id: 'storage', status: 'ok', detail: { path: 'C:\\data' } })).toEqual({
      path: 'C:\\data',
      pendingPath: null,
    });
    expect(
      readStoragePath({ id: 'storage', status: 'ok', detail: { path: 'C:\\data', pendingPath: 'D:\\data', restartRequired: true } }),
    ).toEqual({ path: 'C:\\data', pendingPath: 'D:\\data' });
    expect(readStoragePath({ id: 'storage', status: 'missing', detail: { path: '' } })).toEqual({ path: null, pendingPath: null });
  });

  it('reads the tracker URL only when the daemon sent one', () => {
    expect(readTrackerUrl({ id: 'tracker', status: 'ok', detail: { trackerUrl: 'https://tracker.dev.stonkagents.com' } })).toBe(
      'https://tracker.dev.stonkagents.com',
    );
    expect(readTrackerUrl({ id: 'tracker', status: 'missing', detail: {} })).toBeNull();
    expect(readTrackerUrl(undefined)).toBeNull();
  });
});

describe('getInstallerPeerKey', () => {
  it('GETs the loopback installer endpoint and reads the snake_case answer', async () => {
    fetchMock.mockResolvedValueOnce(json({ api_key: 'sk_live_abcdefghijklmnop', tracker_url: 'https://tracker.dev.stonkagents.com' }));
    expect(await getInstallerPeerKey()).toEqual({
      kind: 'ok',
      key: { apiKey: 'sk_live_abcdefghijklmnop', trackerUrl: 'https://tracker.dev.stonkagents.com' },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { targetAddressSpace?: string }];
    expect(url).toBe(PEER_KEY_URL);
    expect(init.method).toBeUndefined();
    expect(init.targetAddressSpace).toBe('loopback');
  });

  it('maps 503 to not-registered, 404 to unsupported, anything else to an error', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'NOT_REGISTERED' } }, 503));
    expect(await getInstallerPeerKey()).toEqual({ kind: 'not-registered' });
    fetchMock.mockResolvedValueOnce(json({}, 404));
    expect(await getInstallerPeerKey()).toEqual({ kind: 'unsupported' });
    fetchMock.mockResolvedValueOnce(json({}, 403));
    expect(await getInstallerPeerKey()).toMatchObject({ kind: 'error' });
    fetchMock.mockResolvedValueOnce(json({ tracker_url: 'x' }));
    expect(await getInstallerPeerKey()).toMatchObject({ kind: 'error' });
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect(await getInstallerPeerKey()).toEqual({ kind: 'error', message: 'Your agent did not answer. Try again.' });
  });

  it('parses either spelling and refuses an empty key', () => {
    expect(parsePeerKey({ apiKey: 'k1234567890123', trackerUrl: 't' })).toEqual({ apiKey: 'k1234567890123', trackerUrl: 't' });
    expect(parsePeerKey({ api_key: '' })).toBeNull();
    expect(parsePeerKey(null)).toBeNull();
  });

  it('masks the key to its first and last four characters', () => {
    expect(maskApiKey('sk_live_abcdefghijklmnop')).toBe('sk_l••••••••mnop');
    expect(maskApiKey('short')).toBe('••••••••');
    expect(maskApiKey('sk_live_abcdefghijklmnop')).not.toContain('abcdefgh');
  });
});
