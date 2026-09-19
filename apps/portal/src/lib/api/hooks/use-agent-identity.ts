/**
 * Purpose: React Query hooks for the agent's own identity (peer id + display
 *          name) read from and written to the daemon (Settings > Identity).
 *          Every surface that names "your agent" (navbar, profile, home,
 *          community compose) reads `useAgentIdentity` so a saved name shows
 *          at once, before the tracker has re-announced it.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAgentIdentity, saveAgentIdentity, type AgentIdentity, type IdentityResult } from '@/lib/api/daemon-identity';
import { queryKeys } from '@/lib/api/keys';
import { useDaemon } from '@/providers/DaemonProvider';

export class IdentitySaveError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = 'IdentitySaveError';
  }
}

/** Thrown when the running agent has no identity surface (404). */
export const IDENTITY_UNSUPPORTED_MESSAGE = 'Your agent needs an update before it can carry a display name.';

function unwrap(result: IdentityResult): AgentIdentity {
  if (result.kind === 'ok') return result.identity;
  if (result.kind === 'unsupported') throw new IdentitySaveError(IDENTITY_UNSUPPORTED_MESSAGE, 'UNSUPPORTED');
  throw new IdentitySaveError(result.message, result.code);
}

/**
 * The agent's identity. Idle while the agent is offline; `data` is null when
 * the running agent predates the identity endpoint.
 */
export function useAgentIdentity() {
  const { connected } = useDaemon();
  return useQuery<AgentIdentity | null, IdentitySaveError>({
    queryKey: queryKeys.daemon.identity,
    queryFn: async () => {
      const result = await getAgentIdentity();
      if (result.kind === 'unsupported') return null;
      return unwrap(result);
    },
    enabled: connected,
    staleTime: 30_000,
    retry: 1,
  });
}

/**
 * Save the display name. On success the identity, peer and profile caches are
 * invalidated so the navbar, the profile header and the peer list pick the
 * name up without a reload.
 */
export function useSaveAgentIdentity() {
  const qc = useQueryClient();
  return useMutation<AgentIdentity, IdentitySaveError, string>({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async displayName => unwrap(await saveAgentIdentity(displayName)),
    onSuccess: identity => {
      qc.setQueryData(queryKeys.daemon.identity, identity);
      qc.invalidateQueries({ queryKey: queryKeys.daemon.identity });
      qc.invalidateQueries({ queryKey: queryKeys.peers.all });
      qc.invalidateQueries({ queryKey: queryKeys.profile.me });
    },
  });
}
