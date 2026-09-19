/**
 * Purpose: Tests for apiClient — envelope unwrapping, error handling, JSON parse safety
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiRequestError } from './client';

// Mock appConfig
vi.mock('@/lib/config/app.config', () => ({
  appConfig: { apiBaseUrl: 'http://localhost:7842' },
}));

describe('apiClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('unwraps { data: T } envelope on success', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '123', name: 'test' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await apiClient<{ id: string; name: string }>('/api/test');
    expect(result).toEqual({ id: '123', name: 'test' });
  });

  it('throws ApiRequestError on non-2xx with error envelope', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Resource not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(apiClient('/api/missing')).rejects.toThrow(ApiRequestError);
    // Need a fresh mock for the second assertion
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Resource not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(apiClient('/api/missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws ApiRequestError named by the status on a non-JSON failure', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    await expect(apiClient('/api/test')).rejects.toThrow(ApiRequestError);

    // Fresh mock for code check
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    await expect(apiClient('/api/test')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 502 });
  });

  it('a tracker that hangs ends in TIMEOUT naming the network, and a refused connection in NETWORK_ERROR', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiClient('/api/board/posts')).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: "Can't reach the network." });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    await expect(apiClient('/api/board/posts')).rejects.toMatchObject({
      code: 'TIMEOUT',
      message: 'The network did not answer in time.',
    });
  });
});
