/**
 * Purpose: POST feedback to the tracker (FB-1).
 *
 * Contract (tracker, Ladani):
 *   POST {NEXT_PUBLIC_TRACKER_URL}/api/v1/feedback
 *   body { kind, message, path, contact?, contactVia?, walletAddress? }
 *   headers: X-Turnstile-Token when the Turnstile widget produced one (ignored by
 *            a tracker without TURNSTILE_SECRET_KEY)
 *   200 → { ok: true }   (anything else is treated as a failure)
 *   403 → { error: { code: 'TURNSTILE_FAILED', message } }       token missing or rejected: reload and retry
 *   503 → { error: { code: 'TURNSTILE_UNAVAILABLE', message } }  the verifier is down: try again in a minute
 *   4xx/5xx → { error: string } | { error: { code?, message } }
 *
 * Never fakes success: a 200 whose body is not `{ ok: true }` is the edge
 * answering for the tracker (a WAF page, an SPA fallback), and the report did
 * not land. The dialog keeps the user's text and shows the error.
 */

import { trackerEndpoint } from '@/config';

export type FeedbackKind = 'bug' | 'idea' | 'other' | 'wanted';

export type FeedbackContactVia = 'email' | 'phone' | 'telegram' | 'twitter' | 'discord';

export interface FeedbackPayload {
  kind: FeedbackKind;
  message: string;
  /** Route the report came from, e.g. "/tokens". */
  path: string;
  contact?: string;
  contactVia?: FeedbackContactVia;
  /** Connected wallet, when there is one. */
  walletAddress?: string;
}

export const FEEDBACK_PATH = '/api/v1/feedback';
export const FEEDBACK_MAX_MESSAGE = 2000;
export const FEEDBACK_MAX_CONTACT = 200;

export class FeedbackError extends Error {
  readonly status: number | null;
  /** The tracker's error code (`TURNSTILE_FAILED`, `TURNSTILE_UNAVAILABLE`, ...), when it sent one. */
  readonly code: string | null;
  constructor(message: string, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = 'FeedbackError';
    this.status = status;
    this.code = code;
  }
}

/** The tracker's error code, when the body carries one. Shared with `./interest`. */
export function trackerErrorCode(body: unknown): string | null {
  const code = ((body as { error?: { code?: unknown } } | null)?.error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code ? code : null;
}

/** Our words for the Turnstile refusals, used when the tracker sends a code without a message. */
const CODE_MESSAGES: Readonly<Record<string, string>> = {
  TURNSTILE_FAILED: 'The human check did not pass. Reload the page and try again.',
  TURNSTILE_UNAVAILABLE: 'The human check could not be verified right now. Try again in a minute.',
};

/**
 * The tracker's own words for a refused send, whichever shape it used
 * (`{ error: string }` or `{ error: { code?, message } }`); a code or status
 * fallback otherwise. Shared with the roadmap-interest client (`./interest`).
 */
export function trackerErrorMessage(body: unknown, status: number): string {
  const err = (body as { error?: unknown } | null)?.error;
  if (typeof err === 'string' && err) return err;
  const msg = (err as { message?: unknown } | null)?.message;
  if (typeof msg === 'string' && msg) return msg;
  const code = trackerErrorCode(body);
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  return `Could not send (${status})`;
}

/**
 * @throws {FeedbackError} when the tracker refused, was unreachable, or answered
 *   with anything other than `{ ok: true }`.
 */
export async function postFeedback(payload: FeedbackPayload, turnstileToken?: string | null): Promise<void> {
  let res: Response;
  try {
    res = await fetch(trackerEndpoint(FEEDBACK_PATH), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(turnstileToken ? { 'x-turnstile-token': turnstileToken } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new FeedbackError('The Network did not answer. Check your connection and try again.');
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new FeedbackError(trackerErrorMessage(body, res.status), res.status, trackerErrorCode(body));
  if ((body as { ok?: unknown } | null)?.ok !== true) {
    throw new FeedbackError('The send never reached the Network.', res.status);
  }
}
