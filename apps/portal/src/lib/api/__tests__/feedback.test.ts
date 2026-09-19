/**
 * Purpose: Tests for the feedback client (FB-1): the tracker endpoint, the
 *          never-fake-success guard, and error surfacing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackerEndpoint } from '@/config';
import { postFeedback, FeedbackError, FEEDBACK_PATH } from '../feedback';

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

const PAYLOAD = { kind: 'bug' as const, message: 'The chart is blank', path: '/tokens' };

describe('postFeedback', () => {
  it('POSTs the report to the tracker and resolves on { ok: true }', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await expect(
      postFeedback({ ...PAYLOAD, walletAddress: 'Wa11et', contact: '@bob', contactVia: 'telegram' }),
    ).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(trackerEndpoint(FEEDBACK_PATH));
    expect(url).toMatch(/\/api\/v1\/feedback$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      kind: 'bug',
      message: 'The chart is blank',
      path: '/tokens',
      walletAddress: 'Wa11et',
      contact: '@bob',
      contactVia: 'telegram',
    });
    expect(init.headers).not.toHaveProperty('x-turnstile-token');
  });

  it('sends the Turnstile token as a header when the widget produced one', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await postFeedback(PAYLOAD, 'ts-token');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-turnstile-token']).toBe('ts-token');
  });

  it('never fakes success: a 200 without { ok: true } is a failure', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('html');
      },
    });
    await expect(postFeedback(PAYLOAD)).rejects.toThrow('The send never reached the Network.');
    fetchMock.mockResolvedValueOnce(json({ ok: false }));
    await expect(postFeedback(PAYLOAD)).rejects.toBeInstanceOf(FeedbackError);
  });

  it("surfaces the tracker's own words on 4xx, as a string or an error object", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Too many reports, try in a minute' }, 429));
    await expect(postFeedback(PAYLOAD)).rejects.toThrow('Too many reports, try in a minute');
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'TURNSTILE', message: 'Human check failed' } }, 403));
    await expect(postFeedback(PAYLOAD)).rejects.toThrow('Human check failed');
    fetchMock.mockResolvedValueOnce(json(null, 500));
    await expect(postFeedback(PAYLOAD)).rejects.toThrow('Could not send (500)');
  });

  it('carries the Turnstile refusal codes, with our words when the tracker sends none', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: 'TURNSTILE_FAILED', message: 'Challenge verification failed. Reload the page and try again.' } }, 403),
    );
    const failed = await postFeedback(PAYLOAD, 'stale').catch((e: unknown) => e as FeedbackError);
    expect(failed).toMatchObject({ status: 403, code: 'TURNSTILE_FAILED' });
    expect((failed as FeedbackError).message).toMatch(/Reload the page/);

    fetchMock.mockResolvedValueOnce(json({ error: { code: 'TURNSTILE_UNAVAILABLE' } }, 503));
    const down = await postFeedback(PAYLOAD, 'tok').catch((e: unknown) => e as FeedbackError);
    expect(down).toMatchObject({ status: 503, code: 'TURNSTILE_UNAVAILABLE' });
    expect((down as FeedbackError).message).toMatch(/Try again in a minute/);

    fetchMock.mockResolvedValueOnce(json({ error: 'plain' }, 400));
    expect(await postFeedback(PAYLOAD).catch((e: unknown) => e as FeedbackError)).toMatchObject({ status: 400, code: null });
  });

  it('turns a network failure into a readable error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(postFeedback(PAYLOAD)).rejects.toThrow('The Network did not answer. Check your connection and try again.');
  });
});
