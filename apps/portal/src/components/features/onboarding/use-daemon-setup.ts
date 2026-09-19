/**
 * Purpose: The Permissions step's data (RUN-1): polls the agent's setup status
 *          while the agent is connected and applies one fix at a time.
 *
 * Only a connected agent is asked (DaemonProvider.connected), so an unsupported
 * platform never opens a request. React Query dedupes the poll between the
 * home page hook and the step that renders the rows.
 *
 * Pre-endpoint behaviour: the setup surface does not exist on the daemon yet
 * (Ladani is building it). A 404 reads as `unsupported`: the step shows one
 * line pointing at the Update banner and does not block Live, because a
 * healthy daemon is still a running agent. A timeout or a non-JSON answer
 * reads as `unreachable` and does not block either; only a real answer with a
 * fixable check that is not ok blocks (setupBlocked). A report-only check that
 * is still settling (p2p, tracker) is shown, never a wall: the agent retries
 * those on its own and the visitor has no Grant to press.
 */
'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDaemon } from '@/providers/DaemonProvider';
import {
  allChecksOk,
  applySetupFix,
  getSetupStatus,
  SETUP_RESTART_REQUIRED_NOTE,
  setupBlocked,
  type SetupCheckId,
  type SetupStatus,
  type SetupStatusResult,
} from '@/lib/api/daemon-setup';

/** Shared with the Settings tabs (use-agent-settings.ts), which invalidate it after a fix. */
export const SETUP_QUERY_KEY = ['daemon', 'setup'] as const;
const POLL_MS = 5000;
/** Once everything is green there is little to watch; keep the rows honest at a slower cadence. */
const POLL_OK_MS = 30_000;

/**
 * - idle: not connected, nothing polled
 * - checking: connected, first answer pending
 * - ready: every check ok
 * - blocked: at least one fixable check missing or failed
 * - unsupported: 404, the agent predates the setup surface
 * - unreachable: connected but the setup call failed
 */
export type DaemonSetupState = 'idle' | 'checking' | 'ready' | 'blocked' | 'unsupported' | 'unreachable';

export interface DaemonSetup {
  state: DaemonSetupState;
  status: SetupStatus | null;
  /** The check id whose fix is in flight. */
  fixing: SetupCheckId | null;
  fixError: string | null;
  /** Non-error outcome worth showing, e.g. the fix is saved but needs an agent restart. */
  fixNote: string | null;
  applyFix: (id: SetupCheckId) => Promise<void>;
  refresh: () => Promise<void>;
}

export function stateOf(result: SetupStatusResult | undefined, connected: boolean): DaemonSetupState {
  if (!connected) return 'idle';
  if (!result) return 'checking';
  if (result.kind === 'unsupported') return 'unsupported';
  if (result.kind === 'unreachable') return 'unreachable';
  return setupBlocked(result.status) ? 'blocked' : 'ready';
}

export function useDaemonSetup(): DaemonSetup {
  const { connected } = useDaemon();
  const queryClient = useQueryClient();
  const [fixing, setFixing] = useState<SetupCheckId | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixNote, setFixNote] = useState<string | null>(null);

  const query = useQuery<SetupStatusResult>({
    queryKey: SETUP_QUERY_KEY,
    queryFn: getSetupStatus,
    enabled: connected,
    meta: { skipGlobalErrorHandler: true },
    refetchInterval: q => {
      if (!connected) return false;
      const { data } = q.state;
      if (data?.kind === 'ok' && allChecksOk(data.status)) return POLL_OK_MS;
      return POLL_MS;
    },
    refetchOnWindowFocus: true,
  });

  const result = connected ? query.data : undefined;
  const state = stateOf(result, connected);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SETUP_QUERY_KEY });
  }, [queryClient]);

  const applyFix = useCallback(
    async (id: SetupCheckId) => {
      setFixError(null);
      setFixNote(null);
      setFixing(id);
      try {
        const res = await applySetupFix(id);
        if (res.kind === 'error') setFixError(res.message);
        else if (res.kind === 'unsupported') setFixError('Your agent needs an update to apply this fix.');
        else if (res.kind === 'ok' && res.restartRequired) setFixNote(SETUP_RESTART_REQUIRED_NOTE);
      } finally {
        setFixing(null);
        await queryClient.invalidateQueries({ queryKey: SETUP_QUERY_KEY });
      }
    },
    [queryClient],
  );

  return {
    state,
    status: result?.kind === 'ok' ? result.status : null,
    fixing,
    fixError,
    fixNote,
    applyFix,
    refresh,
  };
}
