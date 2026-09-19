/**
 * Purpose: POST roadmap interest to the tracker (RI-1).
 *
 * Distinct from feedback: a coming-soon surface asking "what should your agent
 * be able to do?" collects product interest, not a bug report. Product
 * development mines it per capability, so the body carries a fixed set of
 * capability keys (multi-select) plus the free text, a priority and the route.
 *
 * Contract (tracker):
 *   POST {tracker}/api/v1/interest
 *   body { capabilities: string[], description, priority, contact?, contactVia?, walletAddress?, path }
 *   headers: x-turnstile-token when the Turnstile widget produced one
 *   200 → { ok: true, counts?: Record<capability, number> }   (anything else is a failure)
 *   4xx/5xx → { error: string } | { error: { message } }
 *
 * Never fakes success: a 200 whose body is not `{ ok: true }` is the edge
 * answering for the tracker, and the interest did not land. `counts`, when
 * present, is how many submissions so far include each selected capability.
 */

import { trackerEndpoint } from '@/config';
import { trackerErrorCode, trackerErrorMessage, type FeedbackContactVia } from './feedback';

/** The capability keys the tracker accepts (its CHECK constraint mirrors this list). */
export const INTEREST_CAPABILITY_KEYS = ['trade', 'knowledge', 'learn', 'community', 'alerts', 'token', 'automate', 'other'] as const;

export type InterestCapability = (typeof INTEREST_CAPABILITY_KEYS)[number];

export type InterestPriority = 'nice' | 'important' | 'pay';

export interface InterestCapabilityOption {
  key: InterestCapability;
  /** What the chip says. */
  label: string;
  /** Short mono tag shown with the label (the stored key, so the admin view reads the same). */
  tag: string;
}

/** Chip order is the product's order of asking, not popularity. */
export const INTEREST_CAPABILITIES: readonly InterestCapabilityOption[] = [
  { key: 'trade', label: 'Trade for me', tag: 'sniper / copy' },
  { key: 'knowledge', label: 'Share and sell knowledge', tag: 'knowledge' },
  { key: 'learn', label: 'Learn from other agents', tag: 'learn' },
  { key: 'community', label: 'Run my community', tag: 'community' },
  { key: 'alerts', label: 'Send me alerts', tag: 'alerts' },
  { key: 'token', label: 'Manage my token', tag: 'token' },
  { key: 'automate', label: 'Automate tasks on my machine', tag: 'automate' },
  { key: 'other', label: 'Something else', tag: 'other' },
];

export const INTEREST_PRIORITIES: readonly { key: InterestPriority; label: string }[] = [
  { key: 'nice', label: 'Nice to have' },
  { key: 'important', label: 'Important' },
  { key: 'pay', label: 'I’d pay for it' },
];

export interface InterestPayload {
  capabilities: InterestCapability[];
  description: string;
  priority: InterestPriority;
  contact?: string;
  contactVia?: FeedbackContactVia;
  /** Connected wallet, when there is one. */
  walletAddress?: string;
  /** Route the interest came from, e.g. "/". */
  path: string;
}

export interface InterestResult {
  /** Submissions so far that include each selected capability, when the tracker reports them. */
  counts?: Partial<Record<InterestCapability, number>>;
}

export const INTEREST_PATH = '/api/v1/interest';
export const INTEREST_MAX_DESCRIPTION = 600;
export const INTEREST_MAX_CONTACT = 200;
function isInterestCapability(v: unknown): v is InterestCapability {
  return typeof v === 'string' && (INTEREST_CAPABILITY_KEYS as readonly string[]).includes(v);
}

export class InterestError extends Error {
  readonly status: number | null;
  /** The tracker's error code (`TURNSTILE_FAILED`, `TURNSTILE_UNAVAILABLE`, ...), when it sent one. */
  readonly code: string | null;
  constructor(message: string, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = 'InterestError';
    this.status = status;
    this.code = code;
  }
}

/** Keeps only counts for known keys with finite non-negative values; anything else is dropped. */
function readCounts(raw: unknown): InterestResult['counts'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<Record<InterestCapability, number>> = {};
  let any = false;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isInterestCapability(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      out[k] = Math.floor(v);
      any = true;
    }
  }
  return any ? out : undefined;
}

/**
 * @throws {InterestError} when the tracker refused, was unreachable, or answered
 *   with anything other than `{ ok: true }`.
 */
export async function postInterest(payload: InterestPayload, turnstileToken?: string | null): Promise<InterestResult> {
  let res: Response;
  try {
    res = await fetch(trackerEndpoint(INTEREST_PATH), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(turnstileToken ? { 'x-turnstile-token': turnstileToken } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new InterestError('The Network did not answer. Check your connection and try again.');
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new InterestError(trackerErrorMessage(body, res.status), res.status, trackerErrorCode(body));
  if ((body as { ok?: unknown } | null)?.ok !== true) {
    throw new InterestError('The send never reached the Network.', res.status);
  }
  return { counts: readCounts((body as { counts?: unknown }).counts) };
}
