/**
 * Purpose: React Query hooks behind the Settings tabs that read and write the
 *          agent's own config through its setup surface (daemon-setup.ts):
 *          the current check for one id, a mutation that applies a fix with
 *          its body, and the installer peer key. Every hook is idle while the
 *          agent is offline; the tabs render the agent notice instead.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  applySetupFix,
  getInstallerPeerKey,
  type InstallerPeerKey,
  type SetupCheck,
  type SetupCheckId,
  type SetupFixParams,
} from '@/lib/api/daemon-setup';
import { SETUP_QUERY_KEY, useDaemonSetup, type DaemonSetupState } from '@/components/features/onboarding/use-daemon-setup';
import { useDaemon } from '@/providers/DaemonProvider';

export class SetupFixError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = 'SetupFixError';
  }
}

/** Thrown when the running agent has no setup surface (404). */
export const SETUP_UNSUPPORTED_MESSAGE = 'Your agent needs an update before this can be changed here.';

export interface SetupCheckView {
  /** The check as the daemon last reported it; null until the first answer or when the daemon omitted it. */
  check: SetupCheck | null;
  state: DaemonSetupState;
  /** True while the agent is connected and the first status answer is pending. */
  loading: boolean;
  /** The running agent predates the setup surface. */
  unsupported: boolean;
}

/** One check out of the agent's setup status. Shares the poll with the onboarding step. */
export function useSetupCheck(id: SetupCheckId): SetupCheckView {
  const { state, status } = useDaemonSetup();
  return {
    check: status?.checks.find(c => c.id === id) ?? null,
    state,
    loading: state === 'checking',
    unsupported: state === 'unsupported',
  };
}

export interface SetupFixInput {
  id: SetupCheckId;
  params?: SetupFixParams;
}

export interface SetupFixOutcome {
  check: SetupCheck | null;
  /** 202: written to the agent's config, live after a restart. */
  restartRequired: boolean;
}

/**
 * Apply one fix with its body. Resolves with the re-evaluated check; a refusal
 * rejects with the daemon's message so the caller can toast it. The setup
 * status is refetched either way so the bound controls show what the agent has.
 */
export function useSetupFix() {
  const qc = useQueryClient();
  return useMutation<SetupFixOutcome, SetupFixError, SetupFixInput>({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async ({ id, params }) => {
      const res = await applySetupFix(id, params);
      if (res.kind === 'unsupported') throw new SetupFixError(SETUP_UNSUPPORTED_MESSAGE, 'UNSUPPORTED');
      if (res.kind === 'error') throw new SetupFixError(res.message, res.code);
      return { check: res.check, restartRequired: res.restartRequired };
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: SETUP_QUERY_KEY });
    },
  });
}

export const PEER_KEY_QUERY_KEY = ['daemon', 'peer-key'] as const;

/**
 * The tracker API key the agent registered with. `data` is null while the
 * agent has not registered yet or has no installer surface; the tab says so.
 */
export function useInstallerPeerKey() {
  const { connected } = useDaemon();
  return useQuery<InstallerPeerKey | null, Error>({
    queryKey: PEER_KEY_QUERY_KEY,
    queryFn: async () => {
      const res = await getInstallerPeerKey();
      if (res.kind === 'ok') return res.key;
      if (res.kind === 'error') throw new Error(res.message);
      return null;
    },
    enabled: connected,
    staleTime: 60_000,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}
