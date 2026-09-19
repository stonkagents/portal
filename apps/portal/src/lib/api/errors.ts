/**
 * Purpose: Shared API error class for structured error handling across all API clients.
 */

import type { ApiError } from '@/lib/types/api';

/** Custom error class carrying the structured API error with HTTP status */
export class ApiRequestError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, body: ApiError['error']) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

/** Who a request was addressed to; names the party in a transport error. */
export type RequestTarget = 'agent' | 'tracker';

/** Every portal request has a deadline, so a hung server ends in a named error, never an endless spinner. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

/** Status 0 codes for a request that never got an HTTP answer. */
export const TIMEOUT_CODE = 'TIMEOUT';
export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

const TARGET_NAMES: Record<RequestTarget, string> = { agent: 'your agent', tracker: 'the network' };

/** The user-facing message for a request that never got an answer from `target`. */
export function transportMessage(code: typeof TIMEOUT_CODE | typeof NETWORK_ERROR_CODE, target: RequestTarget): string {
  const who = TARGET_NAMES[target];
  return code === TIMEOUT_CODE ? `${who[0].toUpperCase()}${who.slice(1)} did not answer in time.` : `Can't reach ${who}.`;
}

/** True when `error` is the abort of a deadline or of a caller's signal. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError' || error.name === 'TimeoutError'
    : error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

/**
 * fetch with a deadline. The caller's signal still cancels; the deadline turns a hung
 * server into TIMEOUT and a refused connection into NETWORK_ERROR, both ApiRequestError
 * (status 0) so every screen can map them to one named, retryable message.
 * A caller's own abort (a Stop button) is rethrown untouched.
 */
export async function fetchWithDeadline(
  url: string,
  init: RequestInit | undefined,
  options: { timeoutMs?: number; target: RequestTarget },
): Promise<Response> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, target } = options;
  const callerSignal = init?.signal ?? undefined;
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    if (callerSignal?.aborted) throw error;
    if (deadline.aborted || isAbortError(error)) {
      throw new ApiRequestError(0, { code: TIMEOUT_CODE, message: transportMessage(TIMEOUT_CODE, target) });
    }
    if (error instanceof TypeError) {
      throw new ApiRequestError(0, { code: NETWORK_ERROR_CODE, message: transportMessage(NETWORK_ERROR_CODE, target) });
    }
    throw error;
  }
}

/**
 * The error code for a failed response whose body was not JSON (a gateway page, an
 * empty 502, a rate limiter's plain text): the status still says what happened.
 */
export function codeForStatus(status: number): string {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 502 || status === 503 || status === 504) return 'SERVICE_UNAVAILABLE';
  if (status >= 500) return 'INTERNAL_ERROR';
  return 'PARSE_ERROR';
}
