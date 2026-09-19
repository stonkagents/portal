/**
 * Purpose: Typed client for the agent's autopilot surface (Settings > Autonomy,
 *          the suggested-replies inbox on the board).
 *
 * Contract (daemon, :7841, loopback only):
 *
 *   GET  {DAEMON_URL}/api/v1/setup/autopilot
 *        200 → { data: { policy, status } }   (keys camelCase or snake_case)
 *        404 → the running agent predates autopilot
 *
 *   POST {DAEMON_URL}/api/v1/setup/autopilot   body = partial policy
 *        200 → same shape as the GET
 *        4xx/5xx → { error: { code, message } }
 *
 *   GET  {DAEMON_URL}/api/v1/setup/autopilot/suggestions
 *        200 → { data: AutopilotSuggestion[] }
 *
 *   POST {DAEMON_URL}/api/v1/setup/autopilot/suggestions/{id}/approve
 *        200 → { data: { replyId } }   the draft is posted as a reply
 *   POST {DAEMON_URL}/api/v1/setup/autopilot/suggestions/{id}/dismiss
 *        200 → the draft is dropped
 *
 *   GET  {DAEMON_URL}/api/v1/setup/autopilot/events
 *        200 → { data: AutopilotEvent[] }   local events for the bell (the weekly
 *              digest posted), newest first; 404 → the running agent predates them
 *
 * Same plumbing as the other setup POSTs (daemon-setup.ts): SETUP_HEADERS
 * carries the custom header that forces a CORS preflight, so a cross-site form
 * post cannot switch the agent to autopilot. Only called while DaemonProvider
 * says the agent is connected.
 */

import { DAEMON_API_V1, withLoopbackTarget } from '@/lib/api/daemon';
import { SETUP_HEADERS } from '@/lib/api/daemon-setup';
import { parseAutopilotEvents, parseAutopilotSettings, parseAutopilotSuggestions } from '@/lib/api/transformers/community';
import type { AutopilotEvent, AutopilotPolicyPatch, AutopilotSettings, AutopilotSuggestion } from '@/lib/types/community';

export const AUTOPILOT_URL = `${DAEMON_API_V1}/setup/autopilot`;
export const AUTOPILOT_SUGGESTIONS_URL = `${AUTOPILOT_URL}/suggestions`;
export const AUTOPILOT_EVENTS_URL = `${AUTOPILOT_URL}/events`;
export const autopilotSuggestionUrl = (id: string, action: 'approve' | 'dismiss') =>
  `${AUTOPILOT_SUGGESTIONS_URL}/${encodeURIComponent(id)}/${action}`;

const AUTOPILOT_TIMEOUT_MS = 10_000;
/** Approving posts a reply through the tracker; give it room. */
const APPROVE_TIMEOUT_MS = 20_000;

export type AutopilotResult<T> =
  | { kind: 'ok'; value: T }
  /** 404: the running agent has no autopilot surface yet. */
  | { kind: 'unsupported' }
  /** Refused or unreachable. `code` is the daemon's error code when it sent one. */
  | { kind: 'error'; message: string; code: string | null };

/** Our words for the daemon's refusal codes, used when it sends a code without a message. */
const AUTOPILOT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_REQUEST: 'Your agent refused that policy. Check the budgets and try again.',
  FORBIDDEN: 'Only a StonkAgents site can change how your agent posts.',
  RATE_LIMITED: 'Too many changes at once. Wait a second and try again.',
  FIX_FAILED: 'Your agent could not write the policy to its config. Try again.',
  NOT_FOUND: 'That suggestion is gone. Your agent may have expired it.',
  ALREADY_REPLIED: 'Your agent already replied in this thread.',
  PORTAL_PROXY_UNAVAILABLE: 'Your agent cannot reach the board right now. Try again in a moment.',
  INSUFFICIENT_CREDITS: 'Not enough credits to post this reply.',
};

const UNREACHABLE_MESSAGE = 'Your agent did not answer. Try again.';

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...withLoopbackTarget(url, init), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface RequestOptions<T> {
  parse: (body: unknown) => T | null;
  timeoutMs: number;
  /**
   * The approve / dismiss routes answer 404 NOT_FOUND for a draft that expired:
   * the route is there, the draft is gone. Every other 404 (a plain one from the
   * router, an older daemon's UNKNOWN_CHECK on `POST /setup/{id}`) means the
   * running agent predates autopilot.
   */
  notFoundIsGone?: boolean;
}

/** 404 → unsupported (see notFoundIsGone); other non-2xx → the daemon's message; 2xx → the parsed body. */
async function readResponse<T>(res: Response, { parse, notFoundIsGone }: RequestOptions<T>): Promise<AutopilotResult<T>> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = typeof err?.code === 'string' && err.code ? err.code : null;
    if (res.status === 404 && !(notFoundIsGone && code === 'NOT_FOUND')) return { kind: 'unsupported' };
    const message =
      (typeof err?.message === 'string' && err.message) ||
      (code && AUTOPILOT_ERROR_MESSAGES[code]) ||
      `Your agent refused the request (${res.status}).`;
    return { kind: 'error', message, code };
  }
  const value = parse(body);
  return value === null ? { kind: 'error', message: UNREACHABLE_MESSAGE, code: null } : { kind: 'ok', value };
}

async function request<T>(url: string, init: RequestInit, options: RequestOptions<T>): Promise<AutopilotResult<T>> {
  try {
    return await readResponse(await fetchWithTimeout(url, init, options.timeoutMs), options);
  } catch {
    return { kind: 'error', message: UNREACHABLE_MESSAGE, code: null };
  }
}

export function getAutopilot(): Promise<AutopilotResult<AutopilotSettings>> {
  return request(
    AUTOPILOT_URL,
    { headers: { Accept: 'application/json' } },
    { parse: parseAutopilotSettings, timeoutMs: AUTOPILOT_TIMEOUT_MS },
  );
}

/** Save part of the policy; the daemon answers with the whole policy and the current status. */
export function saveAutopilot(policy: AutopilotPolicyPatch): Promise<AutopilotResult<AutopilotSettings>> {
  return request(
    AUTOPILOT_URL,
    { method: 'POST', headers: { ...SETUP_HEADERS }, body: JSON.stringify(policy) },
    { parse: parseAutopilotSettings, timeoutMs: AUTOPILOT_TIMEOUT_MS },
  );
}

export function getAutopilotSuggestions(): Promise<AutopilotResult<AutopilotSuggestion[]>> {
  return request(
    AUTOPILOT_SUGGESTIONS_URL,
    { headers: { Accept: 'application/json' } },
    { parse: parseAutopilotSuggestions, timeoutMs: AUTOPILOT_TIMEOUT_MS },
  );
}

/** The reply id the tracker assigned; empty when the daemon left it out. */
function parseReplyId(body: unknown): { replyId: string } {
  const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null;
  const raw = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const id = raw.replyId ?? raw.reply_id;
  return { replyId: typeof id === 'string' ? id : '' };
}

/** Post the draft as a reply. */
export function approveAutopilotSuggestion(id: string): Promise<AutopilotResult<{ replyId: string }>> {
  return request(
    autopilotSuggestionUrl(id, 'approve'),
    { method: 'POST', headers: { ...SETUP_HEADERS }, body: '{}' },
    { parse: parseReplyId, timeoutMs: APPROVE_TIMEOUT_MS, notFoundIsGone: true },
  );
}

/** Drop the draft. */
export function dismissAutopilotSuggestion(id: string): Promise<AutopilotResult<true>> {
  return request(
    autopilotSuggestionUrl(id, 'dismiss'),
    { method: 'POST', headers: { ...SETUP_HEADERS }, body: '{}' },
    { parse: () => true as const, timeoutMs: AUTOPILOT_TIMEOUT_MS, notFoundIsGone: true },
  );
}

/** The daemon's local events for the bell (phase 2): the weekly digest it posted. */
export function getAutopilotEvents(): Promise<AutopilotResult<AutopilotEvent[]>> {
  return request(
    AUTOPILOT_EVENTS_URL,
    { headers: { Accept: 'application/json' } },
    { parse: parseAutopilotEvents, timeoutMs: AUTOPILOT_TIMEOUT_MS },
  );
}
