/**
 * Purpose: Shared fetch wrapper for daemon portal proxy mutations.
 * All daemon portal mutations go through daemon (:7841) /api/v1/portal/*
 * which proxies to tracker (:7842) with X-API-Key injection.
 */

import { appConfig } from '@/lib/config/app.config';
import { ApiRequestError, codeForStatus, fetchWithDeadline } from '@/lib/api/errors';
import { withLoopbackTarget } from '@/lib/api/daemon';

/**
 * Base of the portal proxy. NEXT_PUBLIC_DAEMON_URL is configured both with
 * and without the `/api/v1` suffix across env files; either way the proxy
 * lives at exactly one `/api/v1/portal`.
 */
function portalBase(): string {
  const root = appConfig.daemonUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
  return `${root}/api/v1/portal`;
}

/** Reads and the like carry no body; anything else is a JSON write. */
function isMutation(method: string | undefined): boolean {
  const m = (method ?? 'GET').toUpperCase();
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS';
}

/**
 * Every write is JSON, even one with nothing to say (an upvote, a bounty
 * extension): the tracker's content-type check answers 415 to a bare POST, and
 * the daemon proxy forwards exactly the headers it was given. So a mutation
 * without a body sends `{}` and always declares application/json.
 */
export function withJsonBody(options?: RequestInit): RequestInit | undefined {
  if (!isMutation(options?.method)) return options;
  return {
    ...options,
    body: options?.body ?? '{}',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  };
}

/**
 * Every proxy call has a deadline (fetchWithDeadline): a daemon that dies mid-request or a
 * tracker that hangs behind it ends in TIMEOUT or NETWORK_ERROR, never in an endless spinner.
 * `timeoutMs` on the options overrides the default for a long write (an upload).
 */
export type DaemonFetchOptions = RequestInit & { timeoutMs?: number };

async function requestJson(path: string, options?: DaemonFetchOptions): Promise<{ res: Response; json: unknown }> {
  const url = `${portalBase()}${path}`;
  const { timeoutMs, ...rest } = options ?? {};
  const init = withJsonBody(rest);
  const res = await fetchWithDeadline(
    url,
    {
      ...withLoopbackTarget(url, init),
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    },
    { timeoutMs, target: 'agent' },
  );

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    /* A failed answer with no JSON body (a gateway page, an empty 502) is still named by its status. */
    throw new ApiRequestError(res.status, {
      code: codeForStatus(res.status),
      message: res.ok ? `Server returned non-JSON response (status ${res.status})` : `Request failed: ${res.status}`,
    });
  }

  if (!res.ok) {
    const body = json as { error?: { code?: string; message?: string; details?: unknown } };
    throw new ApiRequestError(res.status, {
      code: body.error?.code ?? 'UNKNOWN',
      message: body.error?.message ?? `Request failed: ${res.status}`,
      details: body.error?.details,
    });
  }

  return { res, json };
}

/**
 * Fetch wrapper for daemon portal proxy mutations:
 * 1. Prepends the daemon root + /api/v1/portal to path
 * 2. Sets Content-Type: application/json only when body is present
 * 3. Throws ApiRequestError on non-2xx responses
 * 4. Unwraps { data: T } envelope, returning T directly
 */
export async function daemonFetch<T>(path: string, options?: DaemonFetchOptions): Promise<T> {
  const { res, json } = await requestJson(path, options);
  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new ApiRequestError(res.status, {
      code: 'PARSE_ERROR',
      message: 'Response missing data envelope',
    });
  }
  return (json as { data: T }).data;
}

/** Like daemonFetch but returns { data, meta } for paginated endpoints. */
export async function daemonFetchPaginated<T>(
  path: string,
  options?: DaemonFetchOptions,
): Promise<{ data: T; meta: { total: number; limit: number; offset: number } }> {
  const { json } = await requestJson(path, options);
  const envelope = json as { data: T; meta?: { total: number; limit: number; offset: number } };
  return {
    data: envelope.data,
    meta: envelope.meta ?? { total: 0, limit: 20, offset: 0 },
  };
}
