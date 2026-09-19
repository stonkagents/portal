/**
 * Purpose: The one spelling of the local agent's address for user-facing copy.
 *          The agent listens on a different port per environment (dev 7861,
 *          staging 7851, production 7841) and the env names it as a loopback
 *          URL (NEXT_PUBLIC_DAEMON_URL), so copy that says "localhost:7841" is
 *          wrong on dev and staging. This reads the configured URL at call time
 *          and returns its host:port, e.g. "127.0.0.1:7861".
 */

import { appConfig } from '@/lib/config/app.config';

const DEFAULT_PORT: Record<string, string> = { 'http:': '80', 'https:': '443' };

/** "127.0.0.1:7861" style host:port of the configured agent, for display only. */
export function agentAddress(daemonUrl: string = appConfig.daemonUrl): string {
  try {
    const url = new URL(daemonUrl);
    const port = url.port || DEFAULT_PORT[url.protocol] || '';
    return port ? `${url.hostname}:${port}` : url.hostname;
  } catch {
    // Not a URL: strip any scheme and path and show what is left.
    return daemonUrl.replace(/^[a-z]+:\/\//i, '').replace(/[/?#].*$/, '');
  }
}
