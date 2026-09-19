/**
 * Purpose: Daemon API client — mirrors Go daemon endpoints on localhost:7841
 */

import { appConfig } from '@/lib/config/app.config';
import { ApiRequestError, fetchWithDeadline } from '@/lib/api/errors';
import { parseAgentEnvironment } from '@/lib/api/agent-environment';
import { SHARE_RULE_MESSAGE, UNSUPPORTED_FILE_TYPE_CODE } from '@/lib/utils/share-rules';

const DAEMON_BASE = appConfig.daemonUrl;
const TRACKER_BASE = appConfig.trackerUrl;
const CONTROLLER_URL = appConfig.controllerUrl;
const USE_REAL_DAEMON = appConfig.useRealDaemon;
/**
 * /api/v1/status on a daemon before 2.6.1 waits on a tracker round trip (the online
 * peer count), so on a slow link it takes longer than the one-second health probe.
 * A status that times out drops the peer id and the environment of a healthy agent,
 * which then reads as unknown or as the wrong build. Give it longer than /health.
 */
export const STATUS_TIMEOUT_MS = 4000;
/** POST /share waits for the daemon to chunk and announce the file. */
export const SHARE_TIMEOUT_MS = 120_000;
/** Root of daemon (no path) — for /health which is at root */
const DAEMON_ROOT = DAEMON_BASE.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '') || DAEMON_BASE;
/** Base for daemon API v1 routes — /status, /downloads/status, etc. are under /api/v1 */
const DAEMON_API_V1 = /\/api\/v1\/?$/.test(DAEMON_BASE) ? DAEMON_BASE.replace(/\/$/, '') : `${DAEMON_ROOT}/api/v1`;

/**
 * Chrome's Local Network Access check (PERF-2): a fetch from an https page to
 * localhost is blocked unless the request declares its target address space,
 * in which case Chrome shows its one-time permission prompt. The daemon
 * (:7841) and the controller (:7840) must also answer the preflight with
 * `Access-Control-Allow-Private-Network: true`; without that header the
 * request still fails and the portal reads an installed daemon as offline.
 * `targetAddressSpace` is not in lib.dom yet, hence the cast.
 */
export function withLoopbackTarget(url: string, init?: RequestInit): RequestInit {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url)) return init ?? {};
  return { ...init, targetAddressSpace: 'loopback' } as RequestInit;
}

/** Generic fetch with timeout and error handling */
export async function safeFetch<T>(url: string, timeoutMs = 1000, init?: RequestInit): Promise<T | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      ...withLoopbackTarget(url, init),
    });
    clearTimeout(id);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Normalize daemon status — real daemon returns "healthy", mock returns "ok" */
function normalizeStatus(status: string | undefined): string {
  if (status === 'healthy') return 'ok';
  return status ?? 'offline';
}

/** Daemon health check — returns true if daemon is reachable */
export async function checkDaemonHealth(): Promise<boolean> {
  const url = USE_REAL_DAEMON ? `${DAEMON_ROOT}/health` : `${DAEMON_BASE}/health`;
  const data = await safeFetch<{ status: string }>(url);
  return normalizeStatus(data?.status) === 'ok';
}

/** Thrown when the daemon refuses a share with 415 UNSUPPORTED_FILE_TYPE (not a plain-text file). */
export class UnsupportedFileTypeError extends Error {
  readonly code = UNSUPPORTED_FILE_TYPE_CODE;
  constructor() {
    super(SHARE_RULE_MESSAGE);
    this.name = 'UnsupportedFileTypeError';
  }
}

/** Thrown when uploading a file whose CID already exists in the daemon's store. */
export class DuplicateContentError extends Error {
  readonly existing: { cid?: string; filename?: string; size?: number };
  constructor(existing: { cid?: string; filename?: string; size?: number }) {
    super('File already shared');
    this.name = 'DuplicateContentError';
    this.existing = existing;
  }
}

// ─── Agent chat (POST /api/v1/agent/chat, GET .../history/{id}) ─────────────
// Token chat: owner = creator, holder = buyer. Only holders chat with owner's LLM. user_id = holder wallet, context_id = token contract.

/** Request body for POST /api/v1/agent/chat (matches the agent repository AgentChatRequest). */
export interface AgentChatRequest {
  session_id?: string;
  user_id?: string;
  context_id?: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string; agent_id?: string }[];
  system_prompt?: string;
  /** Model to use for this completion (e.g. "gpt-5.4-mini", "gpt-5.4"). Defaults to mini server-side. */
  model?: string;
}

/** Response from POST /api/v1/agent/chat. */
export interface AgentChatResponse {
  response: string;
  session_id?: string;
  credits_deducted?: number;
}

/** Message shape from daemon chat history responses (session and token history modes). */
export interface AgentChatHistoryMessage {
  id?: number;
  session_id?: string;
  seq: number;
  role: string;
  content: string;
  agent_id?: string;
  created_at: string;
  credits_deducted: number;
}

/** Response from GET /api/v1/agent/chat/history/{session_id}. */
export interface AgentChatHistoryResponse {
  session?: { id: string; system_prompt?: string; created_at: string; updated_at: string };
  user_id?: string;
  token_address?: string;
  /** Rows may be daemon-shaped or tracker-shaped; normalize in the UI. */
  messages: unknown[];
}

/** Session item from GET /api/v1/agent/chat/sessions. */
export interface AgentChatSessionItem {
  id: string;
  user_id?: string;
  context_id?: string;
  system_prompt?: string;
  created_at: string;
  updated_at: string;
}

/** Response from GET /api/v1/agent/chat/sessions. */
export interface AgentChatSessionsResponse {
  sessions: AgentChatSessionItem[];
}

/** Non-empty path segment for token history GETs; daemon ignores it when `token_address` is present. */
export const AGENT_CHAT_TOKEN_HISTORY_PATH_SEGMENT = 'token';

/**
 * Fetch daemon API path; throws ApiRequestError on !res.ok so callers can map status/code.
 * Success response is raw JSON (no { data } envelope).
 */
async function daemonApiFetch<T>(path: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 15_000, signal: callerSignal, ...init } = options;
  const url = `${DAEMON_API_V1}${path}`;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
  const res = await fetch(url, {
    ...withLoopbackTarget(url, init),
    signal,
    headers: {
      ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiRequestError(res.status, {
      code: 'PARSE_ERROR',
      message: `Server returned non-JSON response (status ${res.status})`,
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

  return json as T;
}

/** The tracker URL an older daemon reports through its setup status (loopback GET). Exported for tests. */
export async function legacyTrackerUrl(): Promise<string> {
  const setup = await safeFetch<{ checks?: Array<{ id?: string; detail?: { trackerUrl?: unknown } }> }>(
    `${DAEMON_API_V1}/setup/status`,
  );
  const url = setup?.checks?.find(c => c.id === 'tracker')?.detail?.trackerUrl;
  return typeof url === 'string' ? url.trim() : '';
}

/** Daemon endpoints — returns null on failure (offline) */
export const daemonApi = {
  health: async () => {
    if (USE_REAL_DAEMON) {
      const raw = await safeFetch<{ status: string; version: string; uptime_seconds: number }>(`${DAEMON_ROOT}/health`);
      if (!raw) return null;
      const statusData = await safeFetch<{
        daemon: { peer_id: string };
        network: { peers: number };
        shared_assets: number;
        transfer: {
          upload_speed_bps: number;
          download_speed_bps: number;
          share_ratio: number;
          total_uploaded_bytes: number;
          total_downloaded_bytes: number;
        };
        health: { nat_status: string; dht_ready: boolean; mdns_ready: boolean; relay_connected: boolean };
        tracker_url?: string;
        environment?: string;
      }>(`${DAEMON_API_V1}/status`, STATUS_TIMEOUT_MS);
      /* Which tracker the agent talks to and which build it is. Daemons before 2.4.0 do not
         say so on /status, but their setup check for the tracker names the URL. */
      const environment = { ...parseAgentEnvironment(statusData) };
      if (!environment.trackerUrl) {
        environment.trackerUrl = await legacyTrackerUrl();
      }
      return {
        status: normalizeStatus(raw.status),
        trackerUrl: environment.trackerUrl,
        environment: environment.environment,
        peerId: statusData?.daemon?.peer_id ?? '',
        peers: statusData?.network?.peers ?? 0,
        uptimeSeconds: raw.uptime_seconds ?? 0,
        sharedAssets: statusData?.shared_assets ?? 0,
        transfer: {
          uploadSpeedBps: statusData?.transfer?.upload_speed_bps ?? 0,
          downloadSpeedBps: statusData?.transfer?.download_speed_bps ?? 0,
          shareRatio: statusData?.transfer?.share_ratio ?? 0,
          totalUploadedBytes: statusData?.transfer?.total_uploaded_bytes ?? 0,
          totalDownloadedBytes: statusData?.transfer?.total_downloaded_bytes ?? 0,
        },
        healthIndicators: {
          natStatus: statusData?.health?.nat_status ?? 'unknown',
          dhtReady: statusData?.health?.dht_ready ?? false,
          mdnsReady: statusData?.health?.mdns_ready ?? false,
          relayConnected: statusData?.health?.relay_connected ?? false,
        },
      };
    }
    return safeFetch<{
      status: string;
      peerId: string;
      peers: number;
      uptimeSeconds: number;
      sharedAssets: number;
      transfer: {
        uploadSpeedBps: number;
        downloadSpeedBps: number;
        shareRatio: number;
        totalUploadedBytes: number;
        totalDownloadedBytes: number;
      };
      healthIndicators: { natStatus: string; dhtReady: boolean; mdnsReady: boolean; relayConnected: boolean };
      trackerUrl?: string;
      environment?: string;
    }>(`${DAEMON_BASE}/health`);
  },
  nodeStats: () =>
    safeFetch<{
      uploadSpeed: number;
      downloadSpeed: number;
      activePeers: number;
      totalShared: string;
      reputation: number;
      shareRatio: number;
      uptime: string;
    }>(`${DAEMON_API_V1}/node/stats`),
  library: () =>
    safeFetch<{ files: unknown[]; storage: { used: string; limit: string; percent: number } }>(`${DAEMON_API_V1}/library`),
  /** Link Solana wallet to current peer on the tracker (daemon proxies with its API key). */
  linkWallet: async (walletAddress: string): Promise<{ success: boolean; wallet_address?: string } | null> => {
    if (!USE_REAL_DAEMON || !walletAddress?.trim()) return null;
    const url = `${DAEMON_API_V1}/wallet/link`;
    const res = await fetch(
      url,
      withLoopbackTarget(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletAddress.trim() }),
      }),
    );
    if (!res.ok) return null;
    return res.json() as Promise<{ success: boolean; wallet_address?: string }>;
  },
  /** Trigger a download of a CID from the swarm. Returns queued info or null if daemon unreachable. */
  download: async (cid: string): Promise<{ cid: string; status: string; message: string } | null> => {
    if (!USE_REAL_DAEMON || !cid?.trim()) return null;
    return safeFetch<{ cid: string; status: string; message: string }>(`${DAEMON_API_V1}/download`, 5000, {
      method: 'POST',
      body: JSON.stringify({ cid: cid.trim() }),
    });
  },
  /**
   * Share a file with the swarm: uploads file to daemon (multipart), daemon chunks and announces to tracker.
   * Returns { cid, message } on success; throws DuplicateContentError on 409; throws Error on other failures.
   */
  shareFile: async (file: File, options?: { force?: boolean }): Promise<{ cid: string; message: string } | null> => {
    if (!USE_REAL_DAEMON || !file) return null;
    const form = new FormData();
    form.append('file', file, file.name);
    if (options?.force) form.append('force', 'true');
    const url = `${DAEMON_API_V1}/share`;
    /* A refused or hung upload ends as a named transport error ("Can't reach your agent."), not a bare
       "Failed to fetch"; the deadline is generous because the daemon chunks the file before answering. */
    const res = await fetchWithDeadline(
      url,
      withLoopbackTarget(url, {
        method: 'POST',
        body: form,
        // Do not set Content-Type: browser sets multipart/form-data with boundary
      }),
      { timeoutMs: SHARE_TIMEOUT_MS, target: 'agent' },
    );
    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string; details?: { cid?: string; filename?: string; size?: number } };
      };
      if (res.status === 409 && errBody?.error?.code === 'DUPLICATE_CONTENT' && errBody.error.details) {
        throw new DuplicateContentError(errBody.error.details);
      }
      if (res.status === 415 || errBody?.error?.code === UNSUPPORTED_FILE_TYPE_CODE) {
        throw new UnsupportedFileTypeError();
      }
      const msg = errBody?.error?.message ?? res.statusText;
      throw new Error(msg || `Upload failed (${res.status})`);
    }
    return res.json() as Promise<{ cid: string; message: string }>;
  },
  /**
   * POST /api/v1/agent/chat — send messages, get LLM response. Throws ApiRequestError on 4xx/5xx (e.g. 402 insufficient credits, 404 SESSION_NOT_FOUND).
   * Pass `signal` to enable user-initiated abort (Stop button).
   *
   * Timeout: 5 minutes. Detailed-mode reasoning models (gpt-5.x, o-series)
   * routinely take 90–180s; tighter timeouts cancel completed-but-slow calls
   * and the user gets charged with no response.
   */
  agentChat: (body: AgentChatRequest, signal?: AbortSignal): Promise<AgentChatResponse> =>
    daemonApiFetch<AgentChatResponse>('/agent/chat', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 300_000,
      signal,
    }),
  /**
   * GET /api/v1/agent/chat/history/{sessionId} — load chat history. user_id required; optional token_address enables token-chat history mode
   * (daemon proxies to tracker; path segment is ignored for lookup when token_address is set).
   * Throws ApiRequestError on 4xx/5xx.
   */
  agentChatHistory: (sessionId: string, userId: string, tokenAddress?: string): Promise<AgentChatHistoryResponse> => {
    const params = new URLSearchParams({ user_id: userId });
    if (tokenAddress != null && tokenAddress !== '') params.set('token_address', tokenAddress);
    return daemonApiFetch<AgentChatHistoryResponse>(`/agent/chat/history/${encodeURIComponent(sessionId)}?${params.toString()}`, {
      timeoutMs: 15_000,
    });
  },
  /**
   * GET tracker-backed token chat history via the daemon: same as tracker
   * `GET /api/v1/agent/chat/history?user_id=&token_address=`, proxied with the daemon’s API key.
   * Uses a fixed path segment because the daemon router requires a non-empty segment.
   */
  agentTokenChatHistory: (userId: string, tokenAddress: string): Promise<AgentChatHistoryResponse> => {
    const segment = AGENT_CHAT_TOKEN_HISTORY_PATH_SEGMENT;
    return daemonApi.agentChatHistory(segment, userId, tokenAddress);
  },
  /**
   * GET /api/v1/agent/chat/sessions — list chat sessions for user (and optional context/token). user_id required. Returns empty array if not persisted.
   */
  agentChatSessions: (userId: string, contextId?: string): Promise<AgentChatSessionsResponse> => {
    const params = new URLSearchParams({ user_id: userId });
    if (contextId != null && contextId !== '') params.set('context_id', contextId);
    return daemonApiFetch<AgentChatSessionsResponse>(`/agent/chat/sessions?${params.toString()}`, { timeoutMs: 10_000 });
  },
};

/** Tracker endpoints — peer discovery and network stats */
export const trackerApi = {
  peers: (view = 'connected') => safeFetch<unknown[]>(`${TRACKER_BASE}/peers?view=${view}`),
  peerAction: (peerId: string, action: 'trust' | 'block') =>
    safeFetch<{ success: boolean }>(`${TRACKER_BASE}/peers/${peerId}/${action}`),
  networkStats: () =>
    safeFetch<{
      totalAgents: number;
      online: number;
      seeding: number;
      avgReputation: number;
    }>(`${TRACKER_BASE}/network/stats`),
};

/** Daemon control — start/stop via controller at :7840 */
export const daemonControl = {
  shutdown: () => safeFetch<{ status: string; message: string }>(`${CONTROLLER_URL}/stop`, 5000, { method: 'POST' }),
  start: () => safeFetch<{ status: string; message: string }>(`${CONTROLLER_URL}/start`, 5000, { method: 'POST' }),
  status: () => safeFetch<{ daemon: string; healthy: boolean }>(`${CONTROLLER_URL}/status`),
};

/** Export base URLs and flags for reference. Use DAEMON_API_V1 for daemon API paths under /api/v1. */
export { DAEMON_BASE, DAEMON_API_V1, TRACKER_BASE, CONTROLLER_URL, USE_REAL_DAEMON };
