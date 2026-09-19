/**
 * Purpose: Tests for daemonFetch — envelope validation, error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { daemonFetch } from './daemon-fetch';
import { ApiRequestError } from './errors';

// Mock appConfig
vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://localhost:7841/api/v1' },
}));

describe('daemonFetch', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('unwraps { data: T } envelope on success', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: 'post-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await daemonFetch<{ id: string }>('/board/posts');
    expect(result).toEqual({ id: 'post-1' });
  });

  it('throws ApiRequestError on non-2xx', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'API key required' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(daemonFetch('/board/posts')).rejects.toThrow(ApiRequestError);
  });

  it('throws PARSE_ERROR when response lacks data field', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(daemonFetch('/test')).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  });

  it('names a non-JSON failure by its status (a plain 500 is INTERNAL_ERROR, not a parse error)', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    await expect(daemonFetch('/test')).rejects.toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
  });

  it('a hung daemon ends in TIMEOUT with a message that names the agent', async () => {
    vi.useFakeTimers();
    try {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );
      const pending = daemonFetch('/board/posts', { timeoutMs: 1_000 }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1_100);
      const err = (await pending) as ApiRequestError;
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.code).toBe('TIMEOUT');
      expect(err.status).toBe(0);
      expect(err.message).toBe('Your agent did not answer in time.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a refused connection ends in NETWORK_ERROR, not a bare TypeError', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(daemonFetch('/board/posts')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
      message: "Can't reach your agent.",
    });
  });

  it("a caller's own abort is rethrown as is (a Stop button is not a timeout)", async () => {
    const controller = new AbortController();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const pending = daemonFetch('/board/posts', { signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();
    const err = await pending;
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('AbortError');
  });
});
