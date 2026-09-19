/**
 * Purpose: Tests for the autopilot client: the GET/POST contract, the setup
 *          headers on every POST, the 404 pre-endpoint case, refusals, and the
 *          approve / dismiss URLs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AUTOPILOT_EVENTS_URL,
  AUTOPILOT_SUGGESTIONS_URL,
  AUTOPILOT_URL,
  approveAutopilotSuggestion,
  autopilotSuggestionUrl,
  dismissAutopilotSuggestion,
  getAutopilot,
  getAutopilotEvents,
  getAutopilotSuggestions,
  saveAutopilot,
} from '../daemon-autopilot';
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

const BODY = { data: { policy: { mode: 'suggest', categories: ['request'] }, status: { enabled: true, suggestions_pending: 2 } } };

describe('urls', () => {
  it('live under the daemon api v1 setup root', () => {
    expect(AUTOPILOT_URL).toMatch(/\/api\/v1\/setup\/autopilot$/);
    expect(AUTOPILOT_SUGGESTIONS_URL).toBe(`${AUTOPILOT_URL}/suggestions`);
    expect(autopilotSuggestionUrl('s 1', 'approve')).toBe(`${AUTOPILOT_URL}/suggestions/s%201/approve`);
    expect(autopilotSuggestionUrl('s1', 'dismiss')).toBe(`${AUTOPILOT_URL}/suggestions/s1/dismiss`);
  });
});

describe('getAutopilot', () => {
  it('GETs and parses the envelope', async () => {
    fetchMock.mockResolvedValueOnce(json(BODY));
    const res = await getAutopilot();
    expect(res.kind).toBe('ok');
    if (res.kind !== 'ok') return;
    expect(res.value.policy.mode).toBe('suggest');
    expect(res.value.status.suggestionsPending).toBe(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(AUTOPILOT_URL);
    expect(init.method).toBeUndefined();
  });

  it('is unsupported on a 404', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'NOT_FOUND' } }, 404));
    expect(await getAutopilot()).toEqual({ kind: 'unsupported' });
  });

  it('is an error when the daemon does not answer or answers nonsense', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect((await getAutopilot()).kind).toBe('error');
    fetchMock.mockResolvedValueOnce(json({ data: {} }));
    expect((await getAutopilot()).kind).toBe('error');
  });
});

describe('saveAutopilot', () => {
  it('POSTs the partial policy as JSON with the setup headers', async () => {
    fetchMock.mockResolvedValueOnce(json(BODY));
    const res = await saveAutopilot({ mode: 'bounty', minBountyMultiple: 3, officeHours: null });
    expect(res.kind).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(AUTOPILOT_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers[SETUP_HEADER]).toBe('1');
    expect(JSON.parse(init.body)).toEqual({ mode: 'bounty', minBountyMultiple: 3, officeHours: null });
  });

  it('carries the daemon message and code on a refusal, with our words when only a code came', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'INVALID_REQUEST', message: 'cap must be >= 0' } }, 400));
    expect(await saveAutopilot({ dailyCreditCap: -1 })).toEqual({
      kind: 'error',
      message: 'cap must be >= 0',
      code: 'INVALID_REQUEST',
    });
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'RATE_LIMITED' } }, 429));
    const res = await saveAutopilot({ mode: 'off' });
    expect(res).toMatchObject({ kind: 'error', code: 'RATE_LIMITED' });
    if (res.kind === 'error') expect(res.message).toMatch(/Too many changes/);
  });
});

describe('suggestions', () => {
  it('GETs the inbox', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: [{ id: 's1', post_id: 'p1', draft: 'hi' }] }));
    const res = await getAutopilotSuggestions();
    expect(res).toMatchObject({ kind: 'ok', value: [{ id: 's1', postId: 'p1', draft: 'hi' }] });
    expect(fetchMock.mock.calls[0][0]).toBe(AUTOPILOT_SUGGESTIONS_URL);
  });

  it('approve POSTs to /{id}/approve with the setup headers and reads the reply id', async () => {
    fetchMock.mockResolvedValueOnce(json({ data: { reply_id: 'r1' } }));
    expect(await approveAutopilotSuggestion('s1')).toEqual({ kind: 'ok', value: { replyId: 'r1' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(autopilotSuggestionUrl('s1', 'approve'));
    expect(init.method).toBe('POST');
    expect(init.headers[SETUP_HEADER]).toBe('1');
    expect(init.body).toBe('{}');
  });

  it('dismiss POSTs to /{id}/dismiss and is ok on an empty 200', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('empty');
      },
    });
    expect(await dismissAutopilotSuggestion('s1')).toEqual({ kind: 'ok', value: true });
    expect(fetchMock.mock.calls[0][0]).toBe(autopilotSuggestionUrl('s1', 'dismiss'));
  });

  it('reads a 404 NOT_FOUND as a gone suggestion, not as an old agent', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'NOT_FOUND', message: 'suggestion not found or expired' } }, 404));
    const res = await approveAutopilotSuggestion('s1');
    expect(res).toEqual({ kind: 'error', code: 'NOT_FOUND', message: 'suggestion not found or expired' });
  });

  it('reads an old daemon answering UNKNOWN_CHECK on the setup POST as unsupported', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'UNKNOWN_CHECK', message: 'unknown setup check: autopilot' } }, 404));
    expect(await saveAutopilot({ mode: 'off' })).toEqual({ kind: 'unsupported' });
  });
});

describe('events (phase 2)', () => {
  it('GETs the daemon events and reads digest_posted rows, dropping unknown kinds', async () => {
    expect(AUTOPILOT_EVENTS_URL).toBe(`${AUTOPILOT_URL}/events`);
    fetchMock.mockResolvedValueOnce(
      json({
        data: [
          { id: 'd1', kind: 'digest_posted', post_id: 'p9', mint: 'Mint111', symbol: 'STONK', title: 'STONK weekly digest, Sep 9 to Sep 15', created_at: '2026-09-15T09:00:00Z' },
          { id: 'x1', kind: 'something_else' },
          { kind: 'digest_posted' },
        ],
      }),
    );
    const res = await getAutopilotEvents();
    expect(fetchMock.mock.calls[0][0]).toBe(AUTOPILOT_EVENTS_URL);
    expect(res).toEqual({
      kind: 'ok',
      value: [{ id: 'd1', kind: 'digest_posted', postId: 'p9', mint: 'Mint111', symbol: 'STONK', title: 'STONK weekly digest, Sep 9 to Sep 15', createdAt: '2026-09-15T09:00:00Z' }],
    });
  });

  it('is unsupported on a 404', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'NOT_FOUND', message: 'no' } }, 404));
    expect(await getAutopilotEvents()).toEqual({ kind: 'unsupported' });
  });
});
