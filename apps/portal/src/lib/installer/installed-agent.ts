/**
 * Purpose: Is an agent already running on this computer, and is it the one this
 *          site needs? Asked once per Download click, after the browser has
 *          allowed local access (local-network-access.ts) and before the
 *          installer is handed out, so a user whose agent is installed and up to
 *          date is not sent the exe again. One request to the daemon's /health
 *          (status and version) with a short cap decides "installed"; a second
 *          to /api/v1/status says which build it is (tracker and environment).
 *
 * The decision, in order:
 *   - no answer: nothing installed (or blocked), download as always;
 *   - another environment's build: download, this site needs its own build;
 *   - same environment, version equal to or newer than the site release, or a
 *     version that cannot be compared (a "dev" build, no manifest): installed,
 *     nothing to download;
 *   - same environment, older: an update.
 */

import { DAEMON_API_V1, STATUS_TIMEOUT_MS, withLoopbackTarget } from '@/lib/api/daemon';
import { detectEnvMismatch, parseAgentEnvironment, type AgentEnv, type AgentEnvMismatch } from '@/lib/api/agent-environment';
import { getSiteRelease } from '@/lib/api/manifest';
import { config, type AppEnv } from '@/config';
import { compareVersions } from '@/lib/utils/version';

/** How long the agent gets to answer /health before it counts as not installed. */
export const AGENT_PROBE_TIMEOUT_MS = 3_000;

const DAEMON_ROOT = DAEMON_API_V1.replace(/\/api\/v1\/?$/, '');
export const AGENT_HEALTH_URL = `${DAEMON_ROOT}/health`;
export const AGENT_STATUS_URL = `${DAEMON_API_V1}/status`;

export interface InstalledAgent {
  /** The daemon's version string; "dev" on a build from source. */
  version: string;
  trackerUrl: string;
  environment: AgentEnv | '';
}

/** What the site is, for the environment check. */
export interface SiteIdentity {
  trackerUrl: string;
  env: AppEnv;
}

export type DownloadDecision =
  | { kind: 'download' }
  | { kind: 'mismatch'; mismatch: AgentEnvMismatch }
  | { kind: 'installed'; version: string }
  | { kind: 'update'; current: string; latest: string };

async function fetchJson(url: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...withLoopbackTarget(url, { cache: 'no-store' }), signal: controller.signal });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The agent on this computer, or null when nothing answers /health in time.
 * The status call may fail on its own (an older daemon, a slow tracker round
 * trip): the agent then counts as installed with an unknown environment, which
 * the environment check treats as a match.
 */
export async function probeInstalledAgent(): Promise<InstalledAgent | null> {
  const health = await fetchJson(AGENT_HEALTH_URL, AGENT_PROBE_TIMEOUT_MS);
  if (!health) return null;
  const status = await fetchJson(AGENT_STATUS_URL, STATUS_TIMEOUT_MS);
  const environment = parseAgentEnvironment(status);
  return {
    version: typeof health.version === 'string' ? health.version.trim() : '',
    trackerUrl: environment.trackerUrl,
    environment: environment.environment,
  };
}

/** The decision for an installed agent (or none) against the site's release version. */
export function decideDownload(agent: InstalledAgent | null, siteVersion: string | undefined, site: SiteIdentity): DownloadDecision {
  if (!agent) return { kind: 'download' };
  const mismatch = detectEnvMismatch({ trackerUrl: agent.trackerUrl, environment: agent.environment }, site);
  if (mismatch) return { kind: 'mismatch', mismatch };
  const order = compareVersions(agent.version, siteVersion);
  /* Unknown on either side: a working agent is never downloaded over because a compare failed. */
  if (order === null || order >= 0) return { kind: 'installed', version: agent.version };
  return { kind: 'update', current: agent.version, latest: siteVersion! };
}

export interface InstalledAgentCheckDeps {
  probe: () => Promise<InstalledAgent | null>;
  /** The site's own latest version; undefined when the manifest cannot be fetched. */
  siteVersion: () => Promise<string | undefined>;
  site: SiteIdentity;
}

/** The probe and the decision together; anything that throws counts as "download" so the gate never traps the user. */
export async function checkInstalledAgent(deps: InstalledAgentCheckDeps): Promise<DownloadDecision> {
  try {
    const agent = await deps.probe();
    if (!agent) return { kind: 'download' };
    let siteVersion: string | undefined;
    try {
      siteVersion = await deps.siteVersion();
    } catch {
      siteVersion = undefined;
    }
    return decideDownload(agent, siteVersion, deps.site);
  } catch {
    return { kind: 'download' };
  }
}

/** The browser defaults: the real daemon, this site's manifest and this site's identity. */
export function checkInstalledAgentInBrowser(): Promise<DownloadDecision> {
  return checkInstalledAgent({
    probe: probeInstalledAgent,
    siteVersion: async () => (await getSiteRelease())?.version,
    site: { trackerUrl: config.api.trackerUrl, env: config.env },
  });
}
