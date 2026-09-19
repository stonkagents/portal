/**
 * Purpose: The daemon status's environment fields (`tracker_url`, `environment`),
 *          how they are compared with this site's tracker and environment, and the
 *          notice copy for a mismatch. No em or en dashes in the copy.
 */
import { describe, it, expect } from 'vitest';
import {
  asAgentEnv,
  detectEnvMismatch,
  envMismatchMessage,
  envMismatchSummary,
  hostOf,
  parseAgentEnvironment,
  productTrackerEnv,
  siteAgentEnv,
  UNKNOWN_AGENT_ENVIRONMENT,
} from '../agent-environment';

const DEV_SITE = { trackerUrl: 'https://tracker.dev.stonkagents.com', env: 'dev' as const };
/** The same dev tracker on the new domain: the site flips there while installed agents keep the old host. */
const NEW_DEV_SITE = { trackerUrl: 'https://tracker.dev.stonkagents.com', env: 'dev' as const };

describe('parseAgentEnvironment', () => {
  it('reads tracker_url and environment from a status body', () => {
    expect(parseAgentEnvironment({ tracker_url: ' https://tracker.stg.stonkagents.com/api/v1 ', environment: 'stg' })).toEqual({
      trackerUrl: 'https://tracker.stg.stonkagents.com/api/v1',
      environment: 'stg',
    });
  });

  it('is unknown on an older daemon that sends neither, or on no body at all', () => {
    expect(parseAgentEnvironment({ daemon: { peer_id: 'p' } })).toEqual(UNKNOWN_AGENT_ENVIRONMENT);
    expect(parseAgentEnvironment(null)).toEqual(UNKNOWN_AGENT_ENVIRONMENT);
    expect(parseAgentEnvironment('nope')).toEqual(UNKNOWN_AGENT_ENVIRONMENT);
  });

  it('drops an environment it does not know and a tracker_url that is not a string', () => {
    expect(parseAgentEnvironment({ tracker_url: 42, environment: 'canary' })).toEqual(UNKNOWN_AGENT_ENVIRONMENT);
    expect(asAgentEnv(' PRD ')).toBe('prd');
    expect(asAgentEnv('production')).toBe('');
  });
});

describe('siteAgentEnv and hostOf', () => {
  it('maps the site label to the daemon spelling', () => {
    expect(siteAgentEnv('dev')).toBe('dev');
    expect(siteAgentEnv('staging')).toBe('stg');
    expect(siteAgentEnv('production')).toBe('prd');
  });

  it('reduces a URL to its lowercased host and treats anything else as none', () => {
    expect(hostOf('https://Tracker.STG.stonkagents.com/api/v1')).toBe('tracker.stg.stonkagents.com');
    expect(hostOf('http://localhost:7842')).toBe('localhost:7842');
    expect(hostOf('')).toBe('');
    expect(hostOf('not a url')).toBe('');
  });

  it('names the environment of a product tracker host on either domain and nothing else', () => {
    expect(productTrackerEnv('tracker.dev.stonkagents.com')).toBe('dev');
    expect(productTrackerEnv('TRACKER.STG.stonkagents.com')).toBe('stg');
    expect(productTrackerEnv('tracker.stonkagents.com')).toBe('prd');
    expect(productTrackerEnv('tracker.stonkagents.com')).toBe('prd');
    expect(productTrackerEnv('tracker.dev.stonkagents.com.attacker.example')).toBeNull();
    expect(productTrackerEnv('localhost:7842')).toBeNull();
    expect(productTrackerEnv('')).toBeNull();
  });
});

describe('detectEnvMismatch', () => {
  it('matches when the tracker hosts agree, whatever the paths and case', () => {
    expect(detectEnvMismatch({ trackerUrl: 'https://TRACKER.dev.stonkagents.com/api/v1', environment: 'dev' }, DEV_SITE)).toBeNull();
  });

  it('matches the same environment on the other product domain (the site moved, the agent did not)', () => {
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.dev.stonkagents.com', environment: 'dev' }, NEW_DEV_SITE)).toBeNull();
    expect(detectEnvMismatch({ trackerUrl: 'https://TRACKER.dev.stonkagents.com/api/v1', environment: '' }, NEW_DEV_SITE)).toBeNull();
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.dev.stonkagents.com', environment: 'dev' }, DEV_SITE)).toBeNull();
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.stonkagents.com', environment: '' }, { trackerUrl: 'https://tracker.stonkagents.com', env: 'production' })).toBeNull();
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.stg.stonkagents.com', environment: 'stg' }, NEW_DEV_SITE)).toMatchObject({
      agentEnv: 'stg',
      agentTrackerHost: 'tracker.stg.stonkagents.com',
      siteEnv: 'dev',
    });
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.dev.example.com', environment: '' }, NEW_DEV_SITE)).toMatchObject({ agentEnv: 'dev' });
  });

  it('mismatches on a different tracker host, naming the agent build and host', () => {
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.stg.stonkagents.com', environment: 'stg' }, DEV_SITE)).toEqual({
      agentEnv: 'stg',
      agentTrackerHost: 'tracker.stg.stonkagents.com',
      siteEnv: 'dev',
    });
  });

  it('reads the build from the host when the daemon names no environment', () => {
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.stg.stonkagents.com', environment: '' }, DEV_SITE)).toMatchObject({ agentEnv: 'stg' });
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.stonkagents.com', environment: '' }, DEV_SITE)).toMatchObject({
      agentEnv: 'prd',
      agentTrackerHost: 'tracker.stonkagents.com',
    });
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.example.com', environment: '' }, DEV_SITE)).toMatchObject({
      agentEnv: null,
      agentTrackerHost: 'tracker.example.com',
    });
  });

  it('the host decides even when the environment label agrees', () => {
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.stg.stonkagents.com', environment: 'dev' }, DEV_SITE)).toMatchObject({
      agentTrackerHost: 'tracker.stg.stonkagents.com',
    });
  });

  it('falls back to the environment label when either tracker host is unknown', () => {
    expect(detectEnvMismatch({ trackerUrl: '', environment: 'stg' }, DEV_SITE)).toEqual({ agentEnv: 'stg', agentTrackerHost: '', siteEnv: 'dev' });
    expect(detectEnvMismatch({ trackerUrl: '', environment: 'dev' }, DEV_SITE)).toBeNull();
    expect(detectEnvMismatch({ trackerUrl: 'https://tracker.stg.stonkagents.com', environment: 'prd' }, { trackerUrl: '', env: 'staging' })).toMatchObject({
      agentEnv: 'prd',
      siteEnv: 'stg',
    });
  });

  it('assumes an older daemon that names neither matches', () => {
    expect(detectEnvMismatch(UNKNOWN_AGENT_ENVIRONMENT, DEV_SITE)).toBeNull();
    expect(detectEnvMismatch(UNKNOWN_AGENT_ENVIRONMENT, { trackerUrl: '', env: 'production' })).toBeNull();
  });
});

describe('envMismatchMessage', () => {
  it('names the installed build, its tracker, this site and the build to install', () => {
    expect(envMismatchMessage({ agentEnv: 'stg', agentTrackerHost: 'tracker.stg.stonkagents.com', siteEnv: 'dev' })).toBe(
      'Your installed agent is the Staging build, connected to tracker.stg.stonkagents.com. This site is Dev. Install the Dev build to use it here.',
    );
  });

  it('copes without a host or without a known build', () => {
    expect(envMismatchMessage({ agentEnv: 'prd', agentTrackerHost: '', siteEnv: 'stg' })).toBe(
      'Your installed agent is the Production build. This site is Staging. Install the Staging build to use it here.',
    );
    expect(envMismatchMessage({ agentEnv: null, agentTrackerHost: 'tracker.stonkagents.com', siteEnv: 'dev' })).toBe(
      'Your installed agent is another build, connected to tracker.stonkagents.com. This site is Dev. Install the Dev build to use it here.',
    );
  });

  it('keeps the copy free of em and en dashes', () => {
    const m = { agentEnv: 'stg' as const, agentTrackerHost: 'tracker.stg.stonkagents.com', siteEnv: 'dev' as const };
    expect(envMismatchMessage(m)).not.toMatch(/[–—]/);
    expect(envMismatchSummary(m)).toBe('Wrong agent build: install the Dev build to use it here.');
  });
});
