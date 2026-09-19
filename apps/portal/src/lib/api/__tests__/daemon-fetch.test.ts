/**
 * Purpose: Tests for daemonFetch — shared daemon portal proxy mutation utility
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../errors';

vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://localhost:7841/api/v1' },
}));

import { daemonFetch } from '../daemon-fetch';

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve({ data }) } as Response;
}

function errorResponse(status: number, body: unknown) {
  return { ok: false, status, json: () => Promise.resolve(body) } as Response;
}

function nonJsonResponse(status: number) {
  return { ok: false, status, json: () => Promise.reject(new Error('not JSON')) } as Response;
}

describe('daemonFetch', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  it('prepends daemonUrl + /portal to path', async () => {
    mockFetch.mockResolvedValue(okResponse('ok'));
    await daemonFetch('/board/posts');
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:7841/api/v1/portal/board/posts');
  });

  it('never doubles the /api/v1 prefix and declares the loopback target address space (PERF-2)', async () => {
    mockFetch.mockResolvedValue(okResponse('ok'));
    await daemonFetch('/board/posts');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).not.toContain('/api/v1/api/v1');
    expect(init).toMatchObject({ targetAddressSpace: 'loopback' });
  });

  it('unwraps { data: T } envelope on success', async () => {
    mockFetch.mockResolvedValue(okResponse({ id: '1', title: 'Post' }));
    const result = await daemonFetch<{ id: string; title: string }>('/board/posts');
    expect(result).toEqual({ id: '1', title: 'Post' });
  });

  it('throws ApiRequestError on non-2xx with error envelope', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(401, {
        error: { code: 'UNAUTHORIZED', message: 'API key required' },
      }),
    );
    const err = (await daemonFetch('/board/posts').catch((e: unknown) => e)) as ApiRequestError;
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('API key required');
  });

  it('throws ApiRequestError with UNKNOWN code when error envelope is missing', async () => {
    mockFetch.mockResolvedValue(errorResponse(500, { message: 'bad' }));
    const err = (await daemonFetch('/x').catch((e: unknown) => e)) as ApiRequestError;
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe('UNKNOWN');
    expect(err.status).toBe(500);
  });

  it('throws ApiRequestError named by the status on a non-JSON failure (a bare 502 is SERVICE_UNAVAILABLE)', async () => {
    mockFetch.mockResolvedValue(nonJsonResponse(502));
    const err = (await daemonFetch('/x').catch((e: unknown) => e)) as ApiRequestError;
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('sets Content-Type: application/json when body is present', async () => {
    mockFetch.mockResolvedValue(okResponse(null));
    await daemonFetch('/board/posts', { method: 'POST', body: JSON.stringify({ text: 'hi' }) });
    const { headers } = mockFetch.mock.calls[0][1];
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('sends {} and Content-Type: application/json on a POST without a body (the tracker answers 415 otherwise)', async () => {
    mockFetch.mockResolvedValue(okResponse(null));
    await daemonFetch('/board/posts/p1/upvote', { method: 'POST' });
    const init = mockFetch.mock.calls[0][1];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{}');
  });

  it('leaves a GET without a body or a content type', async () => {
    mockFetch.mockResolvedValue(okResponse(null));
    await daemonFetch('/board/posts');
    const init = mockFetch.mock.calls[0][1];
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect(init.body).toBeUndefined();
  });

  it('passes through custom headers alongside Content-Type', async () => {
    mockFetch.mockResolvedValue(okResponse(null));
    await daemonFetch('/board/posts', {
      method: 'POST',
      body: JSON.stringify({ text: 'hi' }),
      headers: { 'X-Custom': 'value' },
    });
    const { headers } = mockFetch.mock.calls[0][1];
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Custom']).toBe('value');
  });
});
