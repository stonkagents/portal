'use client';

import { useAgentIdentity } from '@/lib/api/hooks/use-agent-identity';
import { usePeerToken } from '@/lib/api/hooks/use-peer-token';
import { agentLabel } from '@/lib/agent-name';
import { useDaemon } from '@/providers/DaemonProvider';

export const OWN_AGENT_FALLBACK = 'Your agent';

export interface OwnAgentIdentity {
  /** Display name from Settings > Identity, else the short peer id, else "Your agent". */
  name: string;
  /** The agent's launched token image, when it has one. */
  avatarUrl: string | null;
}

/**
 * How the connected agent presents itself: its display name and, once a token is
 * bound, that token's image as its picture.
 */
export function useOwnAgentIdentity(fallback: string = OWN_AGENT_FALLBACK): OwnAgentIdentity {
  const { health } = useDaemon();
  const { data: identity } = useAgentIdentity();
  const peerId = health.peerId || '';
  const { data: token } = usePeerToken(peerId || null);
  const avatarUrl = token?.imageThumbUrl || token?.imageUrl || null;
  if (!peerId) return { name: fallback, avatarUrl: null };
  return { name: agentLabel(identity?.displayName, peerId), avatarUrl };
}

export function useOwnAgentName(fallback: string = OWN_AGENT_FALLBACK): string {
  return useOwnAgentIdentity(fallback).name;
}
