/**
 * Purpose: React Query hook for the background command tools job
 *          (daemon-command-tools.ts): the status, polled every 5 s while the
 *          job runs and every 60 s otherwise, plus a retry mutation. Idle
 *          while the agent is offline; `data` is null when the agent has no
 *          such job (2.5.x, macOS).
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCommandToolsStatus, retryCommandTools, type CommandToolsStatus } from '@/lib/api/daemon-command-tools';
import { queryKeys } from '@/lib/api/keys';
import { useGatewayLink } from '@/lib/api/hooks/use-gateway-link';
import { useDaemon } from '@/providers/DaemonProvider';

export const COMMAND_TOOLS_POLL_RUNNING_MS = 5_000;
export const COMMAND_TOOLS_POLL_IDLE_MS = 60_000;
/** How long after `finished_at` the "ready" notice stays visible. */
export const COMMAND_TOOLS_READY_VISIBLE_MS = 60_000;

/** The chip is worth showing: running, failed, or ready within the last minute. */
export function commandToolsVisible(status: CommandToolsStatus | null | undefined, now = Date.now()): boolean {
  if (!status || !status.supported) return false;
  if (status.state === 'running' || status.state === 'failed') return true;
  if (status.state === 'ready' && status.finishedAt) {
    const finished = Date.parse(status.finishedAt);
    return Number.isFinite(finished) && now - finished < COMMAND_TOOLS_READY_VISIBLE_MS;
  }
  return false;
}

/** Why a tool-dependent feature waits: the job is still setting up, or it failed. */
export type CommandToolsPending = 'running' | 'failed';

/**
 * Whether a feature that needs the command tools (agent chat, the Open OpenClaw
 * link, the autonomy controls) should wait, and why. Null when there is nothing
 * to wait for: the job is done, the agent has no such job (2.5.x, macOS), or
 * the job never ran but the gateway answers anyway (`gatewayRunning`, from the
 * daemon's gateway link), which means the tools are there. `not_started` is
 * otherwise "still being set up": right after the install the scheduled task
 * has not written its first status yet.
 */
export function commandToolsPending(
  status: CommandToolsStatus | null | undefined,
  gatewayRunning = false,
): CommandToolsPending | null {
  if (!status || !status.supported) return null;
  if (status.state === 'failed') return 'failed';
  if (status.state === 'running') return 'running';
  if (status.state === 'not_started' && !gatewayRunning && !status.gatewayRunning) return 'running';
  return null;
}

/**
 * Gateway-dependent controls (the Open OpenClaw link) stay enabled unless the
 * job is known and not done: an older agent or macOS has no job to wait for.
 */
export function commandToolsBlocking(status: CommandToolsStatus | null | undefined, gatewayRunning = false): boolean {
  return commandToolsPending(status, gatewayRunning) !== null;
}

export function useCommandTools() {
  const { connected } = useDaemon();
  const query = useQuery<CommandToolsStatus | null>({
    queryKey: queryKeys.daemon.commandTools,
    queryFn: getCommandToolsStatus,
    enabled: connected,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
    refetchInterval: q => {
      const state = q.state.data?.state;
      if (state === 'running') return COMMAND_TOOLS_POLL_RUNNING_MS;
      // A fresh "ready" hides itself after a minute; poll a little faster so it does.
      if (commandToolsVisible(q.state.data)) return COMMAND_TOOLS_POLL_RUNNING_MS * 3;
      return COMMAND_TOOLS_POLL_IDLE_MS;
    },
  });
  return query;
}

/**
 * The status plus whether a tool-dependent feature should wait: null once the
 * job is done or the agent has no such job. The gateway link breaks the tie for
 * a job that never ran (the tools are there when the gateway answers).
 */
export function useCommandToolsPending(): { status: CommandToolsStatus | null | undefined; pending: CommandToolsPending | null } {
  const { data: status } = useCommandTools();
  const { data: gateway } = useGatewayLink();
  return { status, pending: commandToolsPending(status, gateway?.running === true) };
}

/** Starts the job again; the status query is refreshed on success and on failure. */
export function useRetryCommandTools() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await retryCommandTools();
      if (result.kind === 'error') throw new Error(result.message);
      return result.attempt;
    },
    onSuccess: () => {
      // The controller wrote a "running" placeholder; show it without waiting for the poll.
      queryClient.setQueryData<CommandToolsStatus | null>(queryKeys.daemon.commandTools, prev =>
        prev
          ? { ...prev, state: 'running', phase: 'Starting the command tools setup', detail: '', error: null, finishedAt: null }
          : prev,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.daemon.commandTools });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.daemon.commandTools });
    },
  });
}
