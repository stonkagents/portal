/**
 * The OpenClaw gateway link the agent hands out (GET /api/v1/setup/gateway,
 * daemon 2.4.2 and later, loopback only). `dashboardUrl` carries the shared
 * gateway token in the fragment, so the gateway's own UI opens signed in.
 */
import { DAEMON_API_V1, withLoopbackTarget } from '@/lib/api/daemon';

export const GATEWAY_LINK_URL = `${DAEMON_API_V1}/setup/gateway`;

export interface GatewayLink {
  url: string;
  dashboardUrl: string;
  running: boolean;
}

/** Null when the agent is older than 2.4.2 or unreachable. Exported for tests. */
export function parseGatewayLink(raw: unknown): GatewayLink | null {
  const data = (raw as { data?: unknown } | null)?.data ?? raw;
  if (!data || typeof data !== 'object') return null;
  const body = data as { url?: unknown; dashboardUrl?: unknown; running?: unknown };
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) return null;
  const dashboardUrl = typeof body.dashboardUrl === 'string' && body.dashboardUrl.trim() ? body.dashboardUrl.trim() : `${url.replace(/\/+$/, '')}/`;
  return { url, dashboardUrl, running: body.running === true };
}

export async function fetchGatewayLink(): Promise<GatewayLink | null> {
  try {
    const res = await fetch(GATEWAY_LINK_URL, { ...withLoopbackTarget(GATEWAY_LINK_URL), headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return parseGatewayLink(await res.json());
  } catch {
    return null;
  }
}
