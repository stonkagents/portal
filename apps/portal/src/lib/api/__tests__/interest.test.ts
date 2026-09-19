/**
 * Purpose: Tests for the roadmap interest client (RI-1): the tracker endpoint,
 *          the body shape, counts read-back, the never-fake-success guard, and
 *          error surfacing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackerEndpoint } from '@/config';
import { postInterest, InterestError, INTEREST_PATH, INTEREST_CAPABILITY_KEYS, INTEREST_CAPABILITIES } from '../interest';

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

const PAYLOAD = {
  capabilities: ['trade', 'alerts'] as const,
  description: 'Snipe new launches and ping me',
  priority: 'pay' as const,
  path: '/',
};

describe('postInterest', () => {
  it('POSTs the interest to the tracker and resolves with the counts on { ok: true }', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, counts: { trade: 12, alerts: 3 } }));
    const result = await postInterest({
      ...PAYLOAD,
      capabilities: [...PAYLOAD.capabilities],
      walletAddress: 'Wa11et',
      contact: '@bob',
      contactVia: 'telegram',
    });
    expect(result).toEqual({ counts: { trade: 12, alerts: 3 } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(trackerEndpoint(INTEREST_PATH));
    expect(url).toMatch(/\/api\/v1\/interest$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      capabilities: ['trade', 'alerts'],
      description: 'Snipe new launches and ping me',
      priority: 'pay',
      path: '/',
      walletAddress: 'Wa11et',
      contact: '@bob',
      contactVia: 'telegram',
    });
  });

  it('sends the Turnstile token as a header only when the widget produced one', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await postInterest({ ...PAYLOAD, capabilities: ['trade'] });
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).not.toHaveProperty('x-turnstile-token');

    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await postInterest({ ...PAYLOAD, capabilities: ['trade'] }, null);
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].headers).not.toHaveProperty('x-turnstile-token');

    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await postInterest({ ...PAYLOAD, capabilities: ['trade'] }, 'ts-token');
    expect(((fetchMock.mock.calls[2] as [string, RequestInit])[1].headers as Record<string, string>)['x-turnstile-token']).toBe(
      'ts-token',
    );
  });

  it('resolves without counts when the tracker sends none, and drops unknown or malformed counts', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await expect(postInterest({ ...PAYLOAD, capabilities: ['trade'] })).resolves.toEqual({ counts: undefined });
    fetchMock.mockResolvedValueOnce(json({ ok: true, counts: { trade: '12', bogus: 4, alerts: -1, token: 2.7 } }));
    await expect(postInterest({ ...PAYLOAD, capabilities: ['trade'] })).resolves.toEqual({ counts: { token: 2 } });
  });

  it('never fakes success: a 200 without { ok: true } is a failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('html');
      },
    });
    await expect(postInterest({ ...PAYLOAD, capabilities: ['trade'] })).rejects.toThrow('The send never reached the Network.');
    fetchMock.mockResolvedValueOnce(json({ ok: false, counts: { trade: 1 } }));
    await expect(postInterest({ ...PAYLOAD, capabilities: ['trade'] })).rejects.toBeInstanceOf(InterestError);
  });

  it('carries the Turnstile refusal code and status on the error', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'TURNSTILE_FAILED', message: 'Challenge verification failed.' } }, 403));
    const err = await postInterest({ ...PAYLOAD, capabilities: ['trade'] }, 'stale').catch((e: unknown) => e as InterestError);
    expect(err).toBeInstanceOf(InterestError);
    expect(err).toMatchObject({ status: 403, code: 'TURNSTILE_FAILED', message: 'Challenge verification failed.' });
  });

  it("surfaces the tracker's own words on 4xx, as a string or an error object", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Too many, try in a minute' }, 429));
    await expect(postInterest({ ...PAYLOAD, capabilities: ['trade'] })).rejects.toThrow('Too many, try in a minute');
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: 'VALIDATION_ERROR', message: 'priority must be one of: nice, important, pay' } }, 400),
    );
    await expect(postInterest({ ...PAYLOAD, capabilities: ['trade'] })).rejects.toThrow('priority must be one of');
    fetchMock.mockResolvedValueOnce(json(null, 500));
    await expect(postInterest({ ...PAYLOAD, capabilities: ['trade'] })).rejects.toThrow('Could not send (500)');
  });

  it('turns a network failure into a readable error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(postInterest({ ...PAYLOAD, capabilities: ['trade'] })).rejects.toThrow(
      'The Network did not answer. Check your connection and try again.',
    );
  });
});

describe('capability catalogue', () => {
  it('lists every accepted key exactly once with a label and a mono tag', () => {
    expect(INTEREST_CAPABILITIES.map(c => c.key)).toEqual([...INTEREST_CAPABILITY_KEYS]);
    expect(INTEREST_CAPABILITIES.map(c => c.label)).toEqual([
      'Trade for me',
      'Share and sell knowledge',
      'Learn from other agents',
      'Run my community',
      'Send me alerts',
      'Manage my token',
      'Automate tasks on my machine',
      'Something else',
    ]);
    for (const c of INTEREST_CAPABILITIES) expect(c.tag).toBeTruthy();
  });
});
