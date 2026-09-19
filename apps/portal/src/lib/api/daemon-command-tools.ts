/**
 * Purpose: Typed client for the background command tools job (Windows, agent
 *          2.6.0 and later). The installer registers a scheduled task that
 *          installs the stonkagents CLI, onboards it and starts the OpenClaw
 *          gateway after setup; the job writes <data folder>\command-tools.json
 *          and the controller serves it:
 *
 *   GET  {CONTROLLER}/setup/command-tools
 *        200 → { state, phase, detail, started_at, updated_at, finished_at,
 *                error, log_path, attempt, cli_present, gateway_running,
 *                task_name, supported }
 *        404 → the running agent predates the job (2.5.x): nothing to show
 *
 *   POST {CONTROLLER}/setup/command-tools/retry
 *        202 → { status: "started", task_name, attempt }
 *        4xx/5xx → { error: { code, message } }
 *        Carries SETUP_HEADERS (Content-Type: application/json and
 *        X-StonkAgents-Setup: 1) like every other setup POST, so it can only
 *        go through the daemon's controller proxy (the controller's own CORS
 *        does not admit the custom header): {DAEMON}/api/v1/controller/...
 *
 * Reads go through the daemon proxy first and fall back to the controller
 * directly (the update status hook does the same); the retry is proxy only.
 */

import { CONTROLLER_URL, DAEMON_API_V1, withLoopbackTarget } from '@/lib/api/daemon';
import { SETUP_HEADERS } from '@/lib/api/daemon-setup';

export type CommandToolsState = 'not_started' | 'running' | 'ready' | 'failed';

export interface CommandToolsStatus {
  state: CommandToolsState;
  /** "Downloading the command tools", "Setting up the gateway", ... */
  phase: string;
  /** npm's counter while it runs: "213 package files ready". */
  detail: string;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  /** Failed only: the exit status plus the script's last line. */
  error: string | null;
  logPath: string | null;
  attempt: number;
  /** The installed CLI shim still exists (the controller checked). */
  cliPresent: boolean;
  /** This environment's gateway answers. */
  gatewayRunning: boolean;
  taskName: string;
  /** False on macOS, where there is no such job. */
  supported: boolean;
}

export const COMMAND_TOOLS_PROXY_URL = `${DAEMON_API_V1}/controller/setup/command-tools`;
export const COMMAND_TOOLS_DIRECT_URL = `${CONTROLLER_URL}/setup/command-tools`;
export const COMMAND_TOOLS_RETRY_URL = `${COMMAND_TOOLS_PROXY_URL}/retry`;

const STATES: ReadonlySet<string> = new Set<CommandToolsState>(['not_started', 'running', 'ready', 'failed']);

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/** Null for anything that is not a status answer (an error envelope, an older controller). Exported for tests. */
export function parseCommandToolsStatus(raw: unknown): CommandToolsStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.state !== 'string' || !STATES.has(body.state)) return null;
  return {
    state: body.state as CommandToolsState,
    phase: str(body.phase) ?? '',
    detail: str(body.detail) ?? '',
    startedAt: str(body.started_at),
    updatedAt: str(body.updated_at),
    finishedAt: str(body.finished_at),
    error: str(body.error),
    logPath: str(body.log_path),
    attempt: typeof body.attempt === 'number' ? body.attempt : 0,
    cliPresent: body.cli_present === true,
    gatewayRunning: body.gateway_running === true,
    taskName: str(body.task_name) ?? '',
    supported: body.supported !== false,
  };
}

const TIMEOUT_MS = 5_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...withLoopbackTarget(url, init), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The job's status, or null when the agent has no such surface (404) or is
 * unreachable; the caller shows nothing then.
 */
export async function getCommandToolsStatus(): Promise<CommandToolsStatus | null> {
  for (const url of [COMMAND_TOOLS_PROXY_URL, COMMAND_TOOLS_DIRECT_URL]) {
    try {
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404) return null;
      if (!res.ok) continue;
      const status = parseCommandToolsStatus(await res.json());
      if (status) return status;
    } catch {
      /* next */
    }
  }
  return null;
}

export type CommandToolsRetryResult = { kind: 'ok'; attempt: number } | { kind: 'error'; message: string; code: string | null };

/** Our words for the controller's refusal codes; its own message wins when present. */
export const COMMAND_TOOLS_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  ALREADY_RUNNING: 'The command tools are still being set up.',
  NO_USER: 'Nobody is logged on at this machine, so the setup cannot start. Log on and retry.',
  NOT_SUPPORTED: 'The command tools job only exists on Windows.',
  CONTROLLER_UNREACHABLE: 'The StonkAgents Controller service is not running.',
};

export async function retryCommandTools(): Promise<CommandToolsRetryResult> {
  try {
    const res = await fetchWithTimeout(COMMAND_TOOLS_RETRY_URL, { method: 'POST', headers: SETUP_HEADERS, body: '{}' });
    const body = (await res.json().catch(() => null)) as { attempt?: unknown; error?: { code?: unknown; message?: unknown } } | null;
    if (res.ok) return { kind: 'ok', attempt: typeof body?.attempt === 'number' ? body.attempt : 0 };
    const code = typeof body?.error?.code === 'string' ? body.error.code : null;
    const message = typeof body?.error?.message === 'string' ? body.error.message : '';
    return { kind: 'error', code, message: message || (code && COMMAND_TOOLS_ERROR_MESSAGES[code]) || `Retry failed (HTTP ${res.status}).` };
  } catch {
    return { kind: 'error', code: null, message: 'Your agent did not answer. Is it running?' };
  }
}
