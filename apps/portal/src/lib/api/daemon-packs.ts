/**
 * Purpose: Typed client for the agent's pack install surface (the Curated Packs
 *          cards in the gallery, the Packs tab in Settings).
 *
 * Contract (daemon, loopback only; agent-sync docs/packs.md sections 9 to 12):
 *
 *   POST   {DAEMON}/api/v1/packs/install      body = { pack?, items?, cid?, replace? }
 *          200 → { status: "ok", message, state_dir, requested, installed, replaced,
 *                  already_installed, refused, failed, results[] }
 *          503 → the same shape with status "not_ready" while the command tools
 *                are still finishing (up to ten minutes after setup). A state to
 *                render, not a failure to retry blindly, so the body is read
 *                before the HTTP code is judged.
 *          4xx/5xx otherwise → { error: { code, message, details } }
 *
 *   GET    {DAEMON}/api/v1/packs/installed
 *          200 → { status: "ok" | "not_ready", state_dir, items[] }
 *
 *   DELETE {DAEMON}/api/v1/packs/installed/{id}    {id} is the ITEM id, not the
 *          skill directory name (the index is keyed by id).
 *          200 → { status: "removed" | "not_ready", message, state_dir, item }
 *          404 NOT_INSTALLED → this agent has no record of installing that id.
 *
 * `results` carries one row per requested item, always, in catalog order: one
 * bad item never stops a pack, so every caller renders rows, not one verdict.
 *
 * `wants` (required programs, operating systems, whether the item declares an
 * install block) is read out of the bundle and reported. Nothing in it is ever
 * executed, by the daemon or by this portal.
 */

import { DAEMON_API_V1, withLoopbackTarget } from '@/lib/api/daemon';
import { ApiRequestError, codeForStatus, fetchWithDeadline } from '@/lib/api/errors';

export const PACKS_INSTALL_URL = `${DAEMON_API_V1}/packs/install`;
export const PACKS_INSTALLED_URL = `${DAEMON_API_V1}/packs/installed`;
export const packsRemoveUrl = (id: string) => `${PACKS_INSTALLED_URL}/${encodeURIComponent(id)}`;

/**
 * The daemon bounds a whole install request at ten minutes (90 s per bundle
 * fetch over the swarm). Matching it means a slow pack ends in the daemon's own
 * answer rather than in a deadline the portal invented.
 */
export const PACK_INSTALL_TIMEOUT_MS = 10 * 60_000;
export const PACKS_READ_TIMEOUT_MS = 10_000;
export const PACK_REMOVE_TIMEOUT_MS = 20_000;

/** Where the agent's OpenClaw state directory is, and which rule resolved it. */
export interface PackStateDir {
  dir: string;
  skillsDir: string;
  /** OPENCLAW_STATE_DIR | OPENCLAW_CONFIG_PATH | home | data-dir | none */
  source: string;
  home: string;
  /** The directory is there now. False while the command tools are still finishing. */
  exists: boolean;
  /** Present only when the resolution needs saying (the Windows service correction). */
  note: string;
}

/** What an item asks of the machine. Reported, never acted on. */
export interface PackWants {
  bins: string[];
  os: string[];
  /** The skill declares an install block. We do not run it. */
  installHooks: boolean;
}

export type PackItemStatus = 'installed' | 'replaced' | 'already_installed' | 'refused' | 'failed';

/** One row of an install answer: one requested item and what happened to it. */
export interface PackInstallResult {
  id: string;
  name: string;
  type: string;
  pack: string;
  version: string;
  cid: string;
  status: PackItemStatus;
  /** The refusal code when the status is refused or failed (VERSION_DIFFERS, NAME_IN_USE, ...). */
  code: string;
  /** The daemon's own sentence. Shown as it came, never replaced with a generic one. */
  message: string;
  /** Where it landed, relative to the state directory. */
  path: string;
  files: number;
  bytes: number;
  touches: string;
  wants: PackWants | null;
}

export interface PackInstallAnswer {
  /** 'ok' once the request ran; 'not_ready' while the command tools are finishing. */
  status: 'ok' | 'not_ready';
  message: string;
  stateDir: PackStateDir;
  requested: number;
  installed: number;
  replaced: number;
  alreadyInstalled: number;
  refused: number;
  failed: number;
  results: PackInstallResult[];
}

/** One row of the installed index: what is on disk and where it came from. */
export interface InstalledPackItem {
  id: string;
  name: string;
  type: string;
  pack: string;
  version: string;
  title: string;
  description: string;
  cid: string;
  sha256: string;
  /** ISO 8601, when this agent wrote it. */
  installedAt: string;
  /** The exact files the agent wrote, relative to the state directory. */
  paths: string[];
  wants: PackWants | null;
}

export interface InstalledPacksAnswer {
  status: 'ok' | 'not_ready';
  message: string;
  stateDir: PackStateDir;
  items: InstalledPackItem[];
}

export interface PackRemoveAnswer {
  status: 'removed' | 'not_ready';
  message: string;
  stateDir: PackStateDir;
  item: InstalledPackItem | null;
}

/** At least one of pack, items or cid is required; they may be combined. */
export interface PackInstallRequest {
  pack?: string;
  items?: string[];
  cid?: string;
  /** Write over a different version of an item this agent installed before. */
  replace?: boolean;
}

/* ── Parsing ───────────────────────────────────────────────────────── */

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Omitted by the encoder when the item asks for nothing at all. */
export function parsePackWants(raw: unknown): PackWants | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = record(raw);
  return { bins: strings(body.bins), os: strings(body.os), installHooks: body.install_hooks === true };
}

export function parsePackStateDir(raw: unknown): PackStateDir {
  const body = record(raw);
  return {
    dir: str(body.dir),
    skillsDir: str(body.skills_dir),
    source: str(body.source),
    home: str(body.home),
    exists: body.exists === true,
    note: str(body.note),
  };
}

const ITEM_STATUSES: ReadonlySet<string> = new Set<PackItemStatus>([
  'installed',
  'replaced',
  'already_installed',
  'refused',
  'failed',
]);

/** A row with an unknown status is read as failed: an outcome we cannot name is not a success. */
function parseResult(raw: unknown): PackInstallResult {
  const body = record(raw);
  const status = str(body.status);
  return {
    id: str(body.id),
    name: str(body.name),
    type: str(body.type),
    pack: str(body.pack),
    version: str(body.version),
    cid: str(body.cid),
    status: ITEM_STATUSES.has(status) ? (status as PackItemStatus) : 'failed',
    code: str(body.code),
    message: str(body.message),
    path: str(body.path),
    files: num(body.files),
    bytes: num(body.bytes),
    touches: str(body.touches),
    wants: parsePackWants(body.wants),
  };
}

function parseInstalledItem(raw: unknown): InstalledPackItem {
  const body = record(raw);
  return {
    id: str(body.id),
    name: str(body.name),
    type: str(body.type),
    pack: str(body.pack),
    version: str(body.version),
    title: str(body.title),
    description: str(body.description),
    cid: str(body.cid),
    sha256: str(body.sha256),
    installedAt: str(body.installed_at),
    paths: strings(body.paths),
    wants: parsePackWants(body.wants),
  };
}

/** Null for anything that is not an install answer (an error envelope, an older agent). */
export function parseInstallAnswer(raw: unknown): PackInstallAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = record(raw);
  const status = str(body.status);
  if (status !== 'ok' && status !== 'not_ready') return null;
  const results = Array.isArray(body.results) ? body.results.map(parseResult) : [];
  return {
    status,
    message: str(body.message),
    stateDir: parsePackStateDir(body.state_dir),
    requested: num(body.requested),
    installed: num(body.installed),
    replaced: num(body.replaced),
    alreadyInstalled: num(body.already_installed),
    refused: num(body.refused),
    failed: num(body.failed),
    results,
  };
}

export function parseInstalledAnswer(raw: unknown): InstalledPacksAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = record(raw);
  const status = str(body.status);
  if (status !== 'ok' && status !== 'not_ready') return null;
  return {
    status,
    message: str(body.message),
    stateDir: parsePackStateDir(body.state_dir),
    items: Array.isArray(body.items) ? body.items.map(parseInstalledItem) : [],
  };
}

export function parseRemoveAnswer(raw: unknown): PackRemoveAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = record(raw);
  const status = str(body.status);
  if (status !== 'removed' && status !== 'not_ready') return null;
  return {
    status,
    message: str(body.message),
    stateDir: parsePackStateDir(body.state_dir),
    item: body.item && typeof body.item === 'object' ? parseInstalledItem(body.item) : null,
  };
}

/* ── Requests ──────────────────────────────────────────────────────── */

/**
 * Read the body first, then judge the status: the not-ready answer arrives as
 * 503 with a body worth rendering, and only a body we cannot read as an answer
 * becomes an ApiRequestError carrying the daemon's own code and message.
 */
async function packsRequest<T>(url: string, init: RequestInit, timeoutMs: number, parse: (raw: unknown) => T | null): Promise<T> {
  const res = await fetchWithDeadline(url, withLoopbackTarget(url, init), { timeoutMs, target: 'agent' });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiRequestError(res.status, {
      code: codeForStatus(res.status),
      message: `Your agent sent an answer the portal could not read (status ${res.status}).`,
    });
  }

  const answer = parse(body);
  if (answer) return answer;

  const envelope = record(record(body).error);
  throw new ApiRequestError(res.status, {
    code: str(envelope.code) || codeForStatus(res.status),
    message: str(envelope.message) || `Your agent refused the request (status ${res.status}).`,
    details: envelope.details,
  });
}

/** Install a whole pack, named items, or one item by the CID the catalog pins for it. */
export function installPackItems(request: PackInstallRequest): Promise<PackInstallAnswer> {
  return packsRequest(
    PACKS_INSTALL_URL,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) },
    PACK_INSTALL_TIMEOUT_MS,
    parseInstallAnswer,
  );
}

/** What this agent has installed, where it came from and where it landed. */
export function getInstalledPackItems(): Promise<InstalledPacksAnswer> {
  return packsRequest(PACKS_INSTALLED_URL, { method: 'GET' }, PACKS_READ_TIMEOUT_MS, parseInstalledAnswer);
}

/** Remove one installed item by its item id. Deletes only the files the agent recorded. */
export function removeInstalledPackItem(id: string): Promise<PackRemoveAnswer> {
  return packsRequest(packsRemoveUrl(id), { method: 'DELETE' }, PACK_REMOVE_TIMEOUT_MS, parseRemoveAnswer);
}
