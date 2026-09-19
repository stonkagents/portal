/**
 * Purpose: API client — base fetch wrapper with envelope unwrapping.
 * All Express API responses use { data: T } envelope.
 * This client unwraps the envelope, returning T directly.
 */

import { appConfig } from '@/lib/config/app.config';
import { ApiRequestError, codeForStatus, fetchWithDeadline } from '@/lib/api/errors';
import type { ApiError } from '@/lib/types/api';

// Re-export for backward compatibility — new code should import from '@/lib/api/errors'
export { ApiRequestError };

/**
 * Fetch wrapper that:
 * 1. Prepends NEXT_PUBLIC_API_BASE_URL
 * 2. Throws ApiRequestError on non-2xx responses
 * 3. Unwraps { data: T } envelope, returning T directly
 */
export async function apiClient<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${appConfig.apiBaseUrl}${path}`;
  /* A deadline on every read: a tracker that hangs ends in TIMEOUT, not an endless skeleton. */
  const res = await fetchWithDeadline(
    url,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    },
    { target: 'tracker' },
  );

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiRequestError(res.status, {
      code: codeForStatus(res.status),
      message: res.ok ? `Non-JSON response from ${path} (${res.status})` : `API error: ${res.status}`,
    });
  }

  if (!res.ok) {
    const err = (body as ApiError).error ?? { code: 'UNKNOWN', message: `API error: ${res.status}` };
    throw new ApiRequestError(res.status, err);
  }

  // Unwrap { data: T } envelope — return T directly
  return (body as { data: T }).data;
}

/** Pagination metadata from { data, meta } envelope. */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

/** Response with data + pagination metadata. */
export interface PaginatedResponse<T> {
  data: T;
  meta: PaginationMeta;
}

/**
 * Like apiClient but returns { data, meta } for paginated endpoints.
 * Use when you need total/limit/offset for pagination controls.
 */
export async function apiClientPaginated<T>(path: string, options?: RequestInit): Promise<PaginatedResponse<T>> {
  const url = `${appConfig.apiBaseUrl}${path}`;
  const res = await fetchWithDeadline(
    url,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    },
    { target: 'tracker' },
  );

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiRequestError(res.status, {
      code: codeForStatus(res.status),
      message: res.ok ? `Invalid JSON response (HTTP ${res.status})` : `API error: ${res.status}`,
    });
  }

  if (!res.ok) {
    const err = (body as ApiError).error ?? { code: 'UNKNOWN', message: `API error: ${res.status}` };
    throw new ApiRequestError(res.status, err);
  }

  const envelope = body as { data: T; meta?: PaginationMeta };
  return {
    data: envelope.data,
    meta: envelope.meta ?? { total: 0, limit: 20, offset: 0 },
  };
}
