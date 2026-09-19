/**
 * Purpose: Which environment the installed agent belongs to. The daemon's
 *          GET /api/v1/status carries `tracker_url` (the tracker it talks to)
 *          and `environment` (dev | stg | prd); older daemons send neither.
 *          A staging agent answering a dev site is healthy but useless here:
 *          its API key names a peer on another tracker, so every proxied read
 *          and write would land on the wrong board. The provider treats such
 *          an agent as not connected and the notices say which build to get.
 */

import type { AppEnv } from '@/config';
import { PRODUCT_DOMAINS } from '@/lib/product-domains';

/** The daemon's spelling of the environment (STONKAGENTS_ENV). */
export type AgentEnv = 'dev' | 'stg' | 'prd';

/** What the status answer said about the agent's environment; '' where the daemon predates the fields. */
export interface AgentEnvironment {
  trackerUrl: string;
  environment: AgentEnv | '';
}

export const UNKNOWN_AGENT_ENVIRONMENT: AgentEnvironment = { trackerUrl: '', environment: '' };

export const AGENT_ENV_LABELS: Readonly<Record<AgentEnv, string>> = { dev: 'Dev', stg: 'Staging', prd: 'Production' };

/** 'dev' | 'stg' | 'prd' from any value; '' for anything else. */
export function asAgentEnv(value: unknown): AgentEnv | '' {
  const word = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return word === 'dev' || word === 'stg' || word === 'prd' ? word : '';
}

/** The environment fields of a status answer; unknown when the body is not an object or the fields are absent. */
export function parseAgentEnvironment(raw: unknown): AgentEnvironment {
  if (!raw || typeof raw !== 'object') return UNKNOWN_AGENT_ENVIRONMENT;
  const body = raw as { tracker_url?: unknown; environment?: unknown };
  return {
    trackerUrl: typeof body.tracker_url === 'string' ? body.tracker_url.trim() : '',
    environment: asAgentEnv(body.environment),
  };
}

/** The site's deployment label in the daemon's spelling. */
export function siteAgentEnv(env: AppEnv): AgentEnv {
  if (env === 'staging') return 'stg';
  if (env === 'production') return 'prd';
  return 'dev';
}

/** Host (name and port) of a URL, lowercased; '' when the string is no URL. */
export function hostOf(url: string): string {
  const raw = url.trim();
  if (!raw) return '';
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * The environment of tracker.<env>.<product domain> (dev, stg or prd):
 * tracker.dev.stonkagents.com is the dev tracker, tracker.stonkagents.com the
 * production one. Null for any other host.
 */
export function productTrackerEnv(host: string): AgentEnv | null {
  const name = host.toLowerCase();
  for (const domain of PRODUCT_DOMAINS) {
    if (name === `tracker.${domain}`) return 'prd';
    if (name === `tracker.dev.${domain}`) return 'dev';
    if (name === `tracker.stg.${domain}`) return 'stg';
  }
  return null;
}

/** The environment a tracker host belongs to, read from its name; null when the name says nothing. */
function envFromTrackerHost(host: string): AgentEnv | null {
  const product = productTrackerEnv(host);
  if (product) return product;
  if (/(^|\.)stg\./.test(host)) return 'stg';
  if (/(^|\.)dev\./.test(host)) return 'dev';
  return null;
}

export interface AgentEnvMismatch {
  /** The agent's environment; null when the daemon named a tracker host but no environment and the host says nothing. */
  agentEnv: AgentEnv | null;
  /** The tracker host the agent talks to; '' when the daemon only named an environment. */
  agentTrackerHost: string;
  /** This site's environment. */
  siteEnv: AgentEnv;
}

/**
 * Whether the installed agent belongs to another environment. The tracker host
 * decides when the daemon names one and the site knows its own; otherwise the environment label decides; with neither on the daemon's side the
 * agent is assumed to match (an older build).
 */
export function detectEnvMismatch(agent: AgentEnvironment, site: { trackerUrl: string; env: AppEnv }): AgentEnvMismatch | null {
  const siteEnv = siteAgentEnv(site.env);
  const agentHost = hostOf(agent.trackerUrl);
  const siteHost = hostOf(site.trackerUrl);
  if (agentHost && siteHost) {
    if (agentHost === siteHost) return null;
    const agentProductEnv = productTrackerEnv(agentHost);
    if (agentProductEnv && agentProductEnv === productTrackerEnv(siteHost)) return null;
    return { agentEnv: agent.environment || envFromTrackerHost(agentHost), agentTrackerHost: agentHost, siteEnv };
  }
  if (agent.environment && agent.environment !== siteEnv) {
    return { agentEnv: agent.environment, agentTrackerHost: agentHost, siteEnv };
  }
  return null;
}

/** The notice in full: which build is installed, where it points, which build this site needs. */
export function envMismatchMessage(m: AgentEnvMismatch): string {
  const site = AGENT_ENV_LABELS[m.siteEnv];
  const installed = m.agentEnv ? `the ${AGENT_ENV_LABELS[m.agentEnv]} build` : 'another build';
  const pointsAt = m.agentTrackerHost ? `, connected to ${m.agentTrackerHost}` : '';
  return `Your installed agent is ${installed}${pointsAt}. This site is ${site}. Install the ${site} build to use it here.`;
}

/** The short form for a tooltip or a navbar badge. */
export function envMismatchSummary(m: AgentEnvMismatch): string {
  return `Wrong agent build: install the ${AGENT_ENV_LABELS[m.siteEnv]} build to use it here.`;
}
