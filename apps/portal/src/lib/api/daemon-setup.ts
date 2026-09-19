/**
 * Purpose: Typed client for the agent's setup surface (RUN-1, Permissions step).
 *
 * Contract (daemon, :7841, loopback only — Ladani is building it):
 *
 *   GET  {DAEMON_URL}/api/v1/setup/status
 *        200 → { checks: SetupCheck[] }
 *        404 → the running agent predates the setup surface
 *
 *   POST {DAEMON_URL}/api/v1/setup/{id}
 *        Applies the fix for one check and returns the re-evaluated check:
 *        200 → { check: SetupCheck } (a bare SetupCheck is accepted too)
 *        202 → { check: SetupCheck } with `detail.restartRequired: true`: the
 *              change is written to config.yaml but only a restart applies it
 *              (a moved storage directory; the chunk store opens once at boot)
 *        4xx/5xx → { error: { code, message } }
 *        Privileged fixes (firewall, autostart) run in the controller; the
 *        daemon proxies them the way it proxies start/stop. Unprivileged
 *        fixes (storage, bandwidth, origin) are written to config.yaml and
 *        applied live.
 *
 *        Every mutating setup call MUST carry `Content-Type: application/json`
 *        and `X-StonkAgents-Setup: 1` (SETUP_HEADERS). The daemon and the
 *        controller refuse a POST without them: a custom header forces a CORS
 *        preflight, which a cross-site form post cannot pass, so a page on
 *        another origin cannot rewrite the agent's config (CSRF). GETs are
 *        unchanged.
 *
 * Same loopback conventions as daemon.ts: `withLoopbackTarget` declares the
 * target address space for Chrome's Local Network Access check (PERF-2).
 * This module never runs on an unsupported platform; the hook that drives it
 * is gated on DaemonProvider.connected.
 */

import { DAEMON_API_V1, withLoopbackTarget } from '@/lib/api/daemon';

export type SetupCheckId =
  | 'service'
  | 'controller'
  | 'firewall'
  | 'p2p'
  | 'tracker'
  | 'storage'
  | 'bandwidth'
  | 'autostart'
  | 'origin';

export type SetupCheckStatus = 'ok' | 'missing' | 'failed';

export interface SetupCheck {
  id: SetupCheckId;
  status: SetupCheckStatus;
  /** One human-readable line; shown next to a red row. */
  message?: string;
  /** Free-form detail (candidate folders, current caps, NAT status …). */
  detail?: Record<string, unknown>;
}

export interface SetupStatus {
  checks: SetupCheck[];
}

/** Every check id, in the order the daemon is expected to evaluate them. */
const SETUP_CHECK_IDS: readonly SetupCheckId[] = [
  'service',
  'controller',
  'firewall',
  'p2p',
  'tracker',
  'storage',
  'bandwidth',
  'autostart',
  'origin',
];

/** Checks that have a POST fix. The rest are reported only. */
const FIXABLE_CHECK_IDS: ReadonlySet<SetupCheckId> = new Set<SetupCheckId>([
  'firewall',
  'storage',
  'bandwidth',
  'autostart',
  'origin',
]);

/** The three rows the Permissions step renders, each backed by one or more checks. */
export interface SetupRow {
  id: 'network' | 'storage' | 'bandwidth';
  label: string;
  description: string;
  checks: readonly SetupCheckId[];
}

export const SETUP_ROWS: readonly SetupRow[] = [
  {
    id: 'network',
    label: 'Network access',
    description: 'A firewall rule for your agent, a reachable P2P port, and this site allowed to talk to it.',
    checks: ['firewall', 'p2p', 'origin'],
  },
  {
    id: 'storage',
    label: 'Storage directory',
    description: 'A writable folder with free space for the knowledge your agent shares and receives.',
    checks: ['storage'],
  },
  {
    id: 'bandwidth',
    label: 'Bandwidth allocation',
    description: 'Upload and download caps so your agent never saturates the connection.',
    checks: ['bandwidth'],
  },
];

/** Checks shown as a compact status line rather than a row. */
export const SETUP_STATUS_LINE_IDS: readonly SetupCheckId[] = ['service', 'controller', 'autostart', 'tracker'];

export type SetupStatusResult =
  | { kind: 'ok'; status: SetupStatus }
  /** 404: the running agent has no setup surface yet. */
  | { kind: 'unsupported' }
  /** Network failure, timeout or a non-JSON answer. */
  | { kind: 'unreachable' };

export type SetupFixResult =
  /** Applied. `restartRequired` is true for a 202: written to config, live after the agent restarts. */
  | { kind: 'ok'; check: SetupCheck | null; restartRequired: boolean }
  | { kind: 'unsupported' }
  /** Refused. `code` is the daemon's error code when it sent one (see SETUP_ERROR_MESSAGES). */
  | { kind: 'error'; message: string; code: string | null };

/**
 * The daemon runs every status check concurrently under an 8s budget (a slow
 * netsh or sc query can take that long), and answers when the budget ends.
 * Anything shorter here reads a live agent as unreachable.
 */
export const STATUS_TIMEOUT_MS = 10_000;
/** Privileged fixes may raise an elevation prompt; give them room. */
const FIX_TIMEOUT_MS = 20_000;

/**
 * Our words for the daemon's refusal codes, used when it sends a code without
 * a message. Its own message wins when present.
 */
export const SETUP_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  /** 403: the origin asked for is not a StonkAgents host. */
  ORIGIN_NOT_ALLOWED: 'Only a StonkAgents site can be allowed to talk to your agent.',
  /** 400: a storage path or bandwidth value the daemon will not accept. */
  INVALID_REQUEST: 'Your agent refused that value. Check the path or the caps and try again.',
  /** 409 from the controller: it cannot find the agent executable to write a firewall rule for. */
  DAEMON_EXE_MISSING: 'The controller cannot find your agent’s program file. Reinstall the agent and try again.',
  ELEVATION_DENIED: 'The change needs administrator approval. Try again and accept the prompt.',
  CONTROLLER_UNREACHABLE: 'The StonkAgents Controller service is not running.',
  RATE_LIMITED: 'Too many changes at once. Wait a second and try again.',
};

/** The daemon's message when a check did not finish inside its budget (`status: 'failed'`). */
const CHECK_TIMED_OUT = /did not finish within/i;

/** True when the daemon gave up on this check rather than evaluating it; the row should say "slow", not "broken". */
export function checkTimedOut(check: SetupCheck): boolean {
  return check.status === 'failed' && CHECK_TIMED_OUT.test(check.message ?? '');
}

export const SETUP_STATUS_URL = `${DAEMON_API_V1}/setup/status`;
export const setupFixUrl = (id: SetupCheckId) => `${DAEMON_API_V1}/setup/${id}`;

/** The custom header every setup POST carries; the daemon and the controller refuse a fix without it. */
export const SETUP_HEADER = 'X-StonkAgents-Setup';

/** Headers for every mutating setup call. Content-Type is required even with no body. */
export const SETUP_HEADERS: Readonly<Record<string, string>> = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  [SETUP_HEADER]: '1',
};

/** What the Permissions step says next to a fix that only a restart applies. */
export const SETUP_RESTART_REQUIRED_NOTE = 'Saved. Restart your agent to apply it.';

const CHECK_STATUSES: ReadonlySet<string> = new Set(['ok', 'missing', 'failed']);

function isSetupCheck(value: unknown): value is SetupCheck {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    (SETUP_CHECK_IDS as readonly string[]).includes(v.id) &&
    typeof v.status === 'string' &&
    CHECK_STATUSES.has(v.status)
  );
}

/** Keep only well-formed checks; an unknown id from a newer daemon is ignored, not fatal. */
export function parseSetupStatus(value: unknown): SetupStatus | null {
  if (!value || typeof value !== 'object') return null;
  const { checks } = value as { checks?: unknown };
  if (!Array.isArray(checks)) return null;
  return { checks: checks.filter(isSetupCheck) };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...withLoopbackTarget(url, init), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getSetupStatus(): Promise<SetupStatusResult> {
  try {
    const res = await fetchWithTimeout(SETUP_STATUS_URL, { headers: { Accept: 'application/json' } }, STATUS_TIMEOUT_MS);
    if (res.status === 404) return { kind: 'unsupported' };
    if (!res.ok) return { kind: 'unreachable' };
    const status = parseSetupStatus(await res.json());
    return status ? { kind: 'ok', status } : { kind: 'unreachable' };
  } catch {
    return { kind: 'unreachable' };
  }
}

/** Upload and download caps in Mbps, as the daemon reports and accepts them. */
export interface BandwidthCaps {
  uploadMbps: number;
  downloadMbps: number;
}

/**
 * Bodies the fix endpoints accept. Bandwidth: either cap may be omitted to keep
 * the configured value. Storage: the new data directory (empty = let the daemon
 * pick a candidate). Firewall, autostart and origin take no body.
 */
export type SetupFixParams = Partial<BandwidthCaps> | { path: string };

/** The caps the daemon reported for the bandwidth check; null for a cap that is not configured. */
export function readBandwidthCaps(check: SetupCheck | null | undefined): { uploadMbps: number | null; downloadMbps: number | null } {
  const up = check?.detail?.uploadMbps;
  const down = check?.detail?.downloadMbps;
  return {
    uploadMbps: typeof up === 'number' && up > 0 ? up : null,
    downloadMbps: typeof down === 'number' && down > 0 ? down : null,
  };
}

/** The data directory the storage check reports, plus the path a 202 wrote that only a restart applies. */
export function readStoragePath(check: SetupCheck | null | undefined): { path: string | null; pendingPath: string | null } {
  const path = check?.detail?.path;
  const pending = check?.detail?.pendingPath;
  return {
    path: typeof path === 'string' && path.trim() ? path : null,
    pendingPath: typeof pending === 'string' && pending.trim() ? pending : null,
  };
}

/** The tracker URL the tracker check reports; null when the daemon did not include one. */
export function readTrackerUrl(check: SetupCheck | null | undefined): string | null {
  const url = check?.detail?.trackerUrl;
  return typeof url === 'string' && url.trim() ? url : null;
}

/**
 * Apply the fix for one check. `params` is the JSON body the fix takes (see
 * SetupFixParams); without one an empty object is sent rather than no body:
 * the daemon accepts either, but a body makes the required Content-Type honest.
 */
export async function applySetupFix(id: SetupCheckId, params?: SetupFixParams): Promise<SetupFixResult> {
  try {
    const res = await fetchWithTimeout(
      setupFixUrl(id),
      { method: 'POST', headers: { ...SETUP_HEADERS }, body: JSON.stringify(params ?? {}) },
      FIX_TIMEOUT_MS,
    );
    if (res.status === 404) return { kind: 'unsupported' };
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
      const code = typeof err?.code === 'string' && err.code ? err.code : null;
      const message =
        (typeof err?.message === 'string' && err.message) ||
        (code && SETUP_ERROR_MESSAGES[code]) ||
        `Could not apply the fix (${res.status})`;
      return { kind: 'error', message, code };
    }
    const { check: wrapped } = (body as { check?: unknown } | null) ?? {};
    const check = isSetupCheck(wrapped) ? wrapped : isSetupCheck(body) ? body : null;
    /* 202 is the daemon's word for "written, not live"; the check's detail repeats it for a proxied answer. */
    const restartRequired = res.status === 202 || check?.detail?.restartRequired === true;
    return { kind: 'ok', check, restartRequired };
  } catch {
    return { kind: 'error', message: 'Your agent did not answer. Try again.', code: null };
  }
}

/**
 * GET {DAEMON_URL}/api/v1/installer/peer-key (loopback only): the tracker API
 * key the agent registered with and the tracker it talks to. Shown masked in
 * Settings > Credits; the key identifies the agent to the network, so the
 * portal never stores it.
 *   200 → { api_key, tracker_url }
 *   503 NOT_REGISTERED → the agent has not registered with the tracker yet
 */
export interface InstallerPeerKey {
  apiKey: string;
  trackerUrl: string;
}

export type PeerKeyResult =
  | { kind: 'ok'; key: InstallerPeerKey }
  /** 503: registered key not there yet. */
  | { kind: 'not-registered' }
  /** 404: the running agent has no installer surface. */
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export const PEER_KEY_URL = `${DAEMON_API_V1}/installer/peer-key`;

export function parsePeerKey(value: unknown): InstallerPeerKey | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const apiKey = v.api_key ?? v.apiKey;
  if (typeof apiKey !== 'string' || !apiKey) return null;
  const trackerUrl = v.tracker_url ?? v.trackerUrl;
  return { apiKey, trackerUrl: typeof trackerUrl === 'string' ? trackerUrl : '' };
}

export async function getInstallerPeerKey(): Promise<PeerKeyResult> {
  try {
    const res = await fetchWithTimeout(PEER_KEY_URL, { headers: { Accept: 'application/json' } }, STATUS_TIMEOUT_MS);
    if (res.status === 404) return { kind: 'unsupported' };
    if (res.status === 503) return { kind: 'not-registered' };
    if (!res.ok) return { kind: 'error', message: `Your agent refused to share its key (${res.status}).` };
    const key = parsePeerKey(await res.json().catch(() => null));
    return key ? { kind: 'ok', key } : { kind: 'error', message: 'Your agent answered without a key.' };
  } catch {
    return { kind: 'error', message: 'Your agent did not answer. Try again.' };
  }
}

/**
 * The key as Settings shows it: first and last four characters around a fixed
 * run of dots, so a shoulder-surfer learns nothing and the owner can still
 * tell two keys apart. Short keys are fully masked.
 */
export function maskApiKey(key: string): string {
  if (key.length <= 12) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

/** True when every check the daemon reported is ok. An empty list counts as ok. */
export function allChecksOk(status: SetupStatus): boolean {
  return status.checks.every(c => c.status === 'ok');
}

/**
 * The checks that hold the Permissions step: not ok, fixable from here, and
 * actually evaluated. A report-only check (service, controller, p2p, tracker)
 * that is not ok has nothing behind a Grant button: the agent retries the
 * DHT, the relay and the tracker registration on its own, so it must not keep
 * the visitor at a step with no way through. A fixable check the daemon could
 * not finish inside its budget is slow, not denied, and does not block either.
 */
export function blockingChecks(status: SetupStatus): SetupCheck[] {
  return status.checks.filter(c => c.status !== 'ok' && FIXABLE_CHECK_IDS.has(c.id) && !checkTimedOut(c));
}

/** True when a check the visitor can act on is still not ok. */
export function setupBlocked(status: SetupStatus): boolean {
  return blockingChecks(status).length > 0;
}

/** Labels for the checks a "still connecting" note names. */
export const SETUP_CHECK_LABELS: Readonly<Record<SetupCheckId, string>> = {
  service: 'agent service',
  controller: 'controller',
  firewall: 'firewall rule',
  p2p: 'P2P network',
  tracker: 'tracker registration',
  storage: 'storage folder',
  bandwidth: 'bandwidth caps',
  autostart: 'autostart',
  origin: 'portal origin',
};

/**
 * One sentence for the checks that are not ok but block nothing: what is still
 * settling and that the agent keeps trying. Null when everything is ok or only
 * blocking checks remain (the rows already say those).
 */
export function pendingChecksNote(status: SetupStatus): string | null {
  const pending = status.checks.filter(c => c.status !== 'ok' && (!FIXABLE_CHECK_IDS.has(c.id) || checkTimedOut(c)));
  if (pending.length === 0) return null;
  const names = pending.map(c => SETUP_CHECK_LABELS[c.id]).join(', ');
  const failed = pending.find(c => c.status === 'failed' && !checkTimedOut(c));
  const reason = failed?.message ? ` (${failed.message})` : '';
  return `Still settling: ${names}${reason}. Your agent keeps trying on its own; you can continue and check back in Settings.`;
}

/** Status of a row: ok only when every backing check the daemon reported is ok. */
export function rowStatus(status: SetupStatus, row: SetupRow): SetupCheckStatus {
  const backing = status.checks.filter(c => row.checks.includes(c.id));
  if (backing.some(c => c.status === 'failed')) return 'failed';
  if (backing.some(c => c.status === 'missing')) return 'missing';
  return 'ok';
}

/** The first fixable check in a row that is not ok, or null when nothing can be fixed from here. */
export function rowFix(status: SetupStatus, row: SetupRow): SetupCheck | null {
  return status.checks.find(c => row.checks.includes(c.id) && c.status !== 'ok' && FIXABLE_CHECK_IDS.has(c.id)) ?? null;
}
