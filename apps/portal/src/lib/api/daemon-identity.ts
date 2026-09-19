/**
 * Purpose: Typed client for the agent's identity surface (Settings > Identity).
 *
 * Contract (daemon, :7841, loopback only):
 *
 *   GET  {DAEMON_URL}/api/v1/setup/identity
 *        200 → { data: { peerId, displayName, publicKey? } }
 *        404 → the running agent predates the identity surface
 *
 *   POST {DAEMON_URL}/api/v1/setup/identity   body { displayName }
 *        displayName is 0..50 characters; empty clears the name. The daemon
 *        writes it to config.yaml and re-announces it to the tracker, which
 *        shows it beside the peer id on every public surface.
 *        200 → { data: { peerId, displayName, trackerSynced, trackerError? } }
 *              trackerSynced false = saved on the agent, the tracker has not
 *              acknowledged the heartbeat yet (it retries on its own)
 *        4xx/5xx → { error: { code, message } } (INVALID_REQUEST, FORBIDDEN,
 *              RATE_LIMITED, FIX_FAILED)
 *
 * Same plumbing as the other setup POSTs (daemon-setup.ts): SETUP_HEADERS
 * carries the custom header that forces a CORS preflight, so a cross-site
 * form post cannot rename the agent. Only called while DaemonProvider says
 * the agent is connected.
 */

import { DAEMON_API_V1, withLoopbackTarget } from '@/lib/api/daemon';
import { SETUP_HEADERS } from '@/lib/api/daemon-setup';

export interface AgentIdentity {
  peerId: string;
  /** Empty when the owner has not set one. */
  displayName: string;
  /** Ed25519 public key, base64. Absent on agents that predate it. */
  publicKey?: string;
  /**
   * On a save: whether the tracker acknowledged the new name within the
   * daemon's wait. False means saved on the agent, still syncing; undefined
   * on a GET.
   */
  trackerSynced?: boolean;
  /** The daemon's reason when trackerSynced is false. */
  trackerError?: string;
}

export const DISPLAY_NAME_MAX_LENGTH = 50;

export const IDENTITY_URL = `${DAEMON_API_V1}/setup/identity`;

const IDENTITY_TIMEOUT_MS = 10_000;

export type IdentityResult =
  | { kind: 'ok'; identity: AgentIdentity }
  /** 404: the running agent has no identity surface yet. */
  | { kind: 'unsupported' }
  /** Refused or unreachable. `code` is the daemon's error code when it sent one. */
  | { kind: 'error'; message: string; code: string | null };

/** Our words for the daemon's refusal codes, used when it sends a code without a message. */
const IDENTITY_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_REQUEST: `Display names are up to ${DISPLAY_NAME_MAX_LENGTH} characters.`,
  FORBIDDEN: 'Only a StonkAgents site can rename your agent.',
  RATE_LIMITED: 'Too many changes at once. Wait a second and try again.',
  FIX_FAILED: 'Your agent could not write the name to its config. Try again.',
};

const UNREACHABLE_MESSAGE = 'Your agent did not answer. Try again.';

/**
 * What the owner typed, as the daemon will store it: trimmed, angle brackets
 * removed (the tracker strips them too), cut at the limit.
 */
export function sanitizeDisplayName(value: string): string {
  return value.replace(/[<>]/g, '').trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
}

/** Accepts `{ data: {...} }` or a bare identity; both spellings of the id. */
export function parseAgentIdentity(value: unknown): AgentIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const wrapped = (value as { data?: unknown }).data;
  const body = wrapped && typeof wrapped === 'object' ? (wrapped as Record<string, unknown>) : (value as Record<string, unknown>);
  const peerId = body.peerId ?? body.peer_id;
  if (typeof peerId !== 'string') return null;
  const displayName = body.displayName ?? body.display_name;
  const identity: AgentIdentity = { peerId, displayName: typeof displayName === 'string' ? displayName : '' };
  const publicKey = body.publicKey ?? body.public_key;
  if (typeof publicKey === 'string' && publicKey) identity.publicKey = publicKey;
  if (typeof body.trackerSynced === 'boolean') identity.trackerSynced = body.trackerSynced;
  if (typeof body.trackerError === 'string' && body.trackerError) identity.trackerError = body.trackerError;
  return identity;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IDENTITY_TIMEOUT_MS);
  try {
    return await fetch(url, { ...withLoopbackTarget(url, init), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readIdentityResponse(res: Response): Promise<IdentityResult> {
  if (res.status === 404) return { kind: 'unsupported' };
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    const code = typeof err?.code === 'string' && err.code ? err.code : null;
    const message =
      (typeof err?.message === 'string' && err.message) ||
      (code && IDENTITY_ERROR_MESSAGES[code]) ||
      `Your agent refused the change (${res.status}).`;
    return { kind: 'error', message, code };
  }
  const identity = parseAgentIdentity(body);
  return identity ? { kind: 'ok', identity } : { kind: 'error', message: UNREACHABLE_MESSAGE, code: null };
}

export async function getAgentIdentity(): Promise<IdentityResult> {
  try {
    const res = await fetchWithTimeout(IDENTITY_URL, { headers: { Accept: 'application/json' } });
    return await readIdentityResponse(res);
  } catch {
    return { kind: 'error', message: UNREACHABLE_MESSAGE, code: null };
  }
}

/** Save the display name; an empty string clears it. The caller sanitizes first. */
export async function saveAgentIdentity(displayName: string): Promise<IdentityResult> {
  try {
    const res = await fetchWithTimeout(IDENTITY_URL, {
      method: 'POST',
      headers: { ...SETUP_HEADERS },
      body: JSON.stringify({ displayName }),
    });
    return await readIdentityResponse(res);
  } catch {
    return { kind: 'error', message: UNREACHABLE_MESSAGE, code: null };
  }
}
