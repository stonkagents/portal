/**
 * Purpose: Tests for the agent identity client (Settings > Identity): the
 *          GET/POST contract, the setup headers on the POST, the 404
 *          pre-endpoint case, refusals, and the name sanitizer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DISPLAY_NAME_MAX_LENGTH,
  IDENTITY_URL,
  getAgentIdentity,
  parseAgentIdentity,
  sanitizeDisplayName,
  saveAgentIdentity,
} from '../daemon-identity';
import { SETUP_HEADER } from '../daemon-setup';

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

const IDENTITY = { peerId: '12D3KooWabc', displayName: 'Alice' };

describe('url', () => {
  it('lives under the daemon api v1 setup root', () => {
    expect(IDENTITY_URL).toMatch(/\/api\/v1\/setup\/identity$/);
  });
});

describe('parseAgentIdentity', () => {
  it('reads the { data } envelope', () => {
    expect(parseAgentIdentity({ data: IDENTITY })).toEqual(IDENTITY);
  });

  it('reads a bare identity and snake_case spellings', () => {
    expect(parseAgentIdentity(IDENTITY)).toEqual(IDENTITY);
    expect(parseAgentIdentity({ data: { peer_id: 'p', display_name: 'N' } })).toEqual({ peerId: 'p', displayName: 'N' });
  });

  it('treats a missing display name as empty', () => {
    expect(parseAgentIdentity({ data: { peerId: 'p' } })).toEqual({ peerId: 'p', displayName: '' });
  });

  it('carries the public key when the agent sends one, in either spelling, and omits it otherwise', () => {
    expect(parseAgentIdentity({ data: { peerId: 'p', publicKey: 'AAAA' } })).toEqual({
      peerId: 'p',
      displayName: '',
      publicKey: 'AAAA',
    });
    expect(parseAgentIdentity({ data: { peerId: 'p', public_key: 'BBBB' } })).toEqual({
      peerId: 'p',
      displayName: '',
      publicKey: 'BBBB',
    });
    expect(parseAgentIdentity({ data: { peerId: 'p', publicKey: '' } })).toEqual({ peerId: 'p', displayName: '' });
  });

  it('rejects anything without a peer id', () => {
    expect(parseAgentIdentity({ data: { displayName: 'N' } })).toBeNull();
    expect(parseAgentIdentity(null)).toBeNull();
    expect(parseAgentIdentity('x')).toBeNull();
  });
});

describe('sanitizeDisplayName', () => {
  it('strips angle brackets, trims, and cuts at the limit', () => {
    expect(sanitizeDisplayName('  <b>Alice</b>  ')).toBe('bAlice/b');
    expect(sanitizeDisplayName('x'.repeat(DISPLAY_NAME_MAX_LENGTH + 20))).toHaveLength(DISPLAY_NAME_MAX_LENGTH);
    expect(sanitizeDisplayName('   ')).toBe('');
  });
});

describe('getAgentIdentity', () => {
  it('returns the identity on 200', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: IDENTITY }));
    await expect(getAgentIdentity()).resolves.toEqual({ kind: 'ok', identity: IDENTITY });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(IDENTITY_URL);
    expect(init.method).toBeUndefined();
  });

  it('reports an agent that predates the endpoint as unsupported', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'NOT_FOUND' } }, 404));
    await expect(getAgentIdentity()).resolves.toEqual({ kind: 'unsupported' });
  });

  it('reports a network failure as an error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    const result = await getAgentIdentity();
    expect(result.kind).toBe('error');
  });

  it('reports a malformed answer as an error', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: {} }));
    const result = await getAgentIdentity();
    expect(result.kind).toBe('error');
  });
});

describe('saveAgentIdentity', () => {
  it('POSTs the name as JSON with the setup headers', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: IDENTITY }));
    await expect(saveAgentIdentity('Alice')).resolves.toEqual({ kind: 'ok', identity: IDENTITY });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(IDENTITY_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers[SETUP_HEADER]).toBe('1');
    expect(JSON.parse(init.body)).toEqual({ displayName: 'Alice' });
  });

  it('sends an empty name to clear it', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { ...IDENTITY, displayName: '' } }));
    const result = await saveAgentIdentity('');
    expect(result).toEqual({ kind: 'ok', identity: { ...IDENTITY, displayName: '' } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ displayName: '' });
  });

  it('surfaces the daemon message on a refusal', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'INVALID_REQUEST', message: 'too long' } }, 400));
    await expect(saveAgentIdentity('x')).resolves.toEqual({ kind: 'error', message: 'too long', code: 'INVALID_REQUEST' });
  });

  it('uses our words when the daemon sends only a code', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'INVALID_REQUEST' } }, 400));
    const result = await saveAgentIdentity('x');
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.message).toMatch(/50 characters/);
  });

  it('reports 404 as unsupported', async () => {
    fetchMock.mockResolvedValueOnce(json(null, 404));
    await expect(saveAgentIdentity('x')).resolves.toEqual({ kind: 'unsupported' });
  });
});

describe('trackerSynced', () => {
  it('carries the sync flag and reason from a save, and neither from a GET', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { ...IDENTITY, trackerSynced: false, trackerError: 'tracker timeout' } }));
    const saved = await saveAgentIdentity('Alice');
    expect(saved).toEqual({ kind: 'ok', identity: { ...IDENTITY, trackerSynced: false, trackerError: 'tracker timeout' } });

    fetchMock.mockResolvedValueOnce(json({ data: IDENTITY }));
    const read = await getAgentIdentity();
    expect(read.kind === 'ok' && read.identity).toEqual(IDENTITY);
  });
});
