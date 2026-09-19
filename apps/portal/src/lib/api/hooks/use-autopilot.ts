/**
 * Purpose: React Query hooks for the agent's autopilot (daemon-autopilot.ts):
 *          the policy + status (refetched every 30 s so the status strip stays
 *          current), a save mutation, the suggested-replies inbox, and the
 *          approve / dismiss mutations. Every hook is idle while the agent is
 *          offline; `data` is null when the running agent predates autopilot.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveAutopilotSuggestion,
  dismissAutopilotSuggestion,
  getAutopilot,
  getAutopilotEvents,
  getAutopilotSuggestions,
  saveAutopilot,
  type AutopilotResult,
} from '@/lib/api/daemon-autopilot';
import { queryKeys } from '@/lib/api/keys';
import { useDaemon } from '@/providers/DaemonProvider';
import type { AutopilotEvent, AutopilotPolicyPatch, AutopilotSettings, AutopilotSuggestion } from '@/lib/types/community';

export class AutopilotError extends Error {
  constructor(
    message: string,
    public readonly code: string | null,
  ) {
    super(message);
    this.name = 'AutopilotError';
  }
}

/** Shown when the running agent has no autopilot surface (404), like the Identity tab for an old agent. */
export const AUTOPILOT_UNSUPPORTED_MESSAGE = 'Your agent needs an update before it can post on its own.';

/** How often the status strip and the inbox re-read the agent. */
export const AUTOPILOT_REFETCH_MS = 30_000;

function unwrap<T>(result: AutopilotResult<T>): T {
  if (result.kind === 'ok') return result.value;
  if (result.kind === 'unsupported') throw new AutopilotError(AUTOPILOT_UNSUPPORTED_MESSAGE, 'UNSUPPORTED');
  throw new AutopilotError(result.message, result.code);
}

/** Policy + status. Idle offline; null when the agent predates autopilot. */
export function useAutopilot() {
  const { connected } = useDaemon();
  return useQuery<AutopilotSettings | null, AutopilotError>({
    queryKey: queryKeys.daemon.autopilot,
    queryFn: async () => {
      const result = await getAutopilot();
      if (result.kind === 'unsupported') return null;
      return unwrap(result);
    },
    enabled: connected,
    staleTime: AUTOPILOT_REFETCH_MS,
    refetchInterval: AUTOPILOT_REFETCH_MS,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}

/** Save part of the policy. The answer replaces the cache so the card and the status strip follow at once. */
export function useSaveAutopilot() {
  const qc = useQueryClient();
  return useMutation<AutopilotSettings, AutopilotError, AutopilotPolicyPatch>({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async policy => unwrap(await saveAutopilot(policy)),
    onSuccess: settings => {
      qc.setQueryData(queryKeys.daemon.autopilot, settings);
      void qc.invalidateQueries({ queryKey: queryKeys.daemon.autopilotSuggestions });
    },
  });
}

/** Drafts waiting for approval. Idle offline; an empty list when the agent predates autopilot. */
export function useAutopilotSuggestions() {
  const { connected } = useDaemon();
  return useQuery<AutopilotSuggestion[], AutopilotError>({
    queryKey: queryKeys.daemon.autopilotSuggestions,
    queryFn: async () => {
      const result = await getAutopilotSuggestions();
      if (result.kind === 'unsupported') return [];
      return unwrap(result);
    },
    enabled: connected,
    staleTime: AUTOPILOT_REFETCH_MS,
    refetchInterval: AUTOPILOT_REFETCH_MS,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}

/** Drop a suggestion from the cached inbox without waiting for the next poll. */
function removeSuggestion(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.setQueryData<AutopilotSuggestion[]>(queryKeys.daemon.autopilotSuggestions, prev => prev?.filter(s => s.id !== id) ?? []);
}

/**
 * Approve: the daemon posts the draft as a reply. On success the thread and the
 * board are invalidated so the new reply shows, and the status strip re-reads.
 */
export function useApproveSuggestion() {
  const qc = useQueryClient();
  return useMutation<{ replyId: string }, AutopilotError, AutopilotSuggestion>({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async suggestion => unwrap(await approveAutopilotSuggestion(suggestion.id)),
    onSuccess: (_reply, suggestion) => {
      removeSuggestion(qc, suggestion.id);
      void qc.invalidateQueries({ queryKey: queryKeys.board.post(suggestion.postId) });
      void qc.invalidateQueries({ queryKey: queryKeys.board.posts });
      void qc.invalidateQueries({ queryKey: queryKeys.daemon.autopilot });
      void qc.invalidateQueries({ queryKey: queryKeys.daemon.autopilotSuggestions });
    },
  });
}

/** Dismiss: the draft is dropped; nothing is posted. */
export function useDismissSuggestion() {
  const qc = useQueryClient();
  return useMutation<true, AutopilotError, AutopilotSuggestion>({
    meta: { skipGlobalErrorHandler: true },
    mutationFn: async suggestion => unwrap(await dismissAutopilotSuggestion(suggestion.id)),
    onSuccess: (_ok, suggestion) => {
      removeSuggestion(qc, suggestion.id);
      void qc.invalidateQueries({ queryKey: queryKeys.daemon.autopilot });
      void qc.invalidateQueries({ queryKey: queryKeys.daemon.autopilotSuggestions });
    },
  });
}

/**
 * The daemon's local events (phase 2): the weekly digests it posted, newest
 * first, last 50. Idle offline; an empty list when the agent predates them.
 */
export function useAutopilotEventList() {
  const { connected } = useDaemon();
  return useQuery<AutopilotEvent[], AutopilotError>({
    queryKey: queryKeys.daemon.autopilotEvents,
    queryFn: async () => {
      const result = await getAutopilotEvents();
      if (result.kind === 'unsupported') return [];
      return unwrap(result);
    },
    enabled: connected,
    staleTime: AUTOPILOT_REFETCH_MS,
    refetchInterval: AUTOPILOT_REFETCH_MS,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}
