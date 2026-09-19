/**
 * Purpose: React Query hooks for transfer management — wired to real daemon endpoints
 */
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/keys';
import { safeFetch, withLoopbackTarget, DAEMON_API_V1 } from '@/lib/api/daemon';
import { useDaemon } from '@/providers/DaemonProvider';
import { mergeTransfers } from '@/lib/api/transformers';
import type { TransfersResponse } from '@/lib/types/transfer';
import type {
  DaemonDownload,
  DaemonUploadDetail,
  DaemonHistoryRecord,
  DaemonLibraryFile,
  DaemonStorageSummary,
} from '@/lib/types/backend';

type DownloadsStatusPayload = {
  downloads: DaemonDownload[];
  recent?: DaemonHistoryRecord[];
  stats?: { total_upload: number; total_download: number; upload_speed_bps: number; download_speed_bps: number };
};

async function fetchMergedTransfers() {
  const [dlRes, ulRes, libRes] = await Promise.all([
    safeFetch<DownloadsStatusPayload>(`${DAEMON_API_V1}/downloads/status`),
    safeFetch<{ uploads: DaemonUploadDetail[]; active: number; queued: number }>(`${DAEMON_API_V1}/uploads/status`),
    safeFetch<{ storage: DaemonStorageSummary }>(`${DAEMON_API_V1}/library?limit=1`).catch(() => null),
  ]);
  return mergeTransfers(dlRes?.downloads ?? [], ulRes, dlRes?.stats, dlRes?.recent, libRes?.storage?.file_count ?? null);
}

/** User-friendly error message for transfer mutation failures */
export function transferErrorMessage(action: string): string {
  const actionMap: Record<string, string> = {
    pause: 'pause transfer',
    resume: 'resume transfer',
    cancel: 'cancel transfer',
    retry: 'retry transfer',
    seed: 'start seeding',
    'pause all': 'pause all transfers',
    'resume all': 'resume all transfers',
    'clear completed': 'clear completed transfers',
  };
  const label = actionMap[action] ?? action;
  return `Failed to ${label}. Try again.`;
}

/** POST to a daemon path with the loopback target (PERF-2); the daemon must allow private-network preflights. */
function daemonPost(path: string): Promise<Response> {
  const url = `${DAEMON_API_V1}${path}`;
  return fetch(url, withLoopbackTarget(url, { method: 'POST' }));
}

/* PERF-3: every transfer query is gated on the daemon being connected, like use-node-stats.
   Cached data is dropped the moment it disconnects so stale speeds never show. */
export function useTransfers() {
  const { connected } = useDaemon();
  return useQuery({
    queryKey: queryKeys.transfers.all,
    meta: { skipGlobalErrorHandler: true },
    queryFn: fetchMergedTransfers,
    enabled: connected,
    refetchInterval: connected ? 5_000 : false,
    gcTime: connected ? undefined : 0,
  });
}

/** Shares cache with useTransfers (same queryKey + queryFn) so gallery + transfers poll once */
export function useTransferStats() {
  const { connected } = useDaemon();
  return useQuery({
    queryKey: queryKeys.transfers.all,
    meta: { skipGlobalErrorHandler: true },
    queryFn: fetchMergedTransfers,
    select: (data: TransfersResponse) => data.stats,
    enabled: connected,
    refetchInterval: connected ? 5_000 : false,
    gcTime: connected ? undefined : 0,
  });
}

/** POST /api/v1/downloads/{cid}/pause */
export function usePauseTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cid: string) => {
      const res = await daemonPost(`/downloads/${encodeURIComponent(cid)}/pause`);
      if (!res.ok) throw new Error(transferErrorMessage('pause'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transfers.all }),
  });
}

/** POST /api/v1/downloads/{cid}/resume */
export function useResumeTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cid: string) => {
      const res = await daemonPost(`/downloads/${encodeURIComponent(cid)}/resume`);
      if (!res.ok) throw new Error(transferErrorMessage('resume'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transfers.all }),
  });
}

/** POST /api/v1/downloads/{cid}/cancel */
export function useCancelTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cid: string) => {
      const res = await daemonPost(`/downloads/${encodeURIComponent(cid)}/cancel`);
      if (!res.ok) throw new Error(transferErrorMessage('cancel'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transfers.all }),
  });
}

/** POST /api/v1/downloads/{cid}/retry */
export function useRetryTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cid: string) => {
      const res = await daemonPost(`/downloads/${encodeURIComponent(cid)}/retry`);
      if (!res.ok) throw new Error(transferErrorMessage('retry'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transfers.all }),
  });
}

/** POST /api/v1/downloads/pause-all */
export function usePauseAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await daemonPost(`/downloads/pause-all`);
      if (!res.ok) throw new Error(transferErrorMessage('pause all'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transfers.all }),
  });
}

/** POST /api/v1/downloads/resume-all */
export function useResumeAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await daemonPost(`/downloads/resume-all`);
      if (!res.ok) throw new Error(transferErrorMessage('resume all'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transfers.all }),
  });
}

/** POST /api/v1/downloads/clear */
export function useClearCompleted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await daemonPost(`/downloads/clear`);
      if (!res.ok) throw new Error(transferErrorMessage('clear completed'));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.transfers.all }),
  });
}

/** GET /api/v1/transfers/history — paginated history from daemon SQLite */
export function useTransferHistory(limit = 50, enabled = true) {
  const { connected } = useDaemon();
  const active = enabled && connected;
  return useQuery({
    queryKey: [...queryKeys.transfers.history, limit],
    meta: { skipGlobalErrorHandler: true },
    queryFn: async () => {
      const data = await safeFetch<{
        transfers: DaemonHistoryRecord[];
        meta: { total: number; limit: number; offset: number };
      }>(`${DAEMON_API_V1}/transfers/history?limit=${limit}`);
      return {
        records: data?.transfers ?? [],
        total: data?.meta?.total ?? 0,
      };
    },
    enabled: active,
    refetchInterval: active ? 30_000 : false,
    gcTime: active ? undefined : 0,
  });
}

/** GET /api/v1/library — shared files + storage summary from daemon */
export function useLibrary(enabled = true) {
  const { connected } = useDaemon();
  const active = enabled && connected;
  return useQuery({
    queryKey: queryKeys.transfers.library,
    meta: { skipGlobalErrorHandler: true },
    queryFn: async () => {
      const data = await safeFetch<{
        files: DaemonLibraryFile[];
        storage: DaemonStorageSummary;
        meta: { total: number; limit: number; offset: number };
      }>(`${DAEMON_API_V1}/library`);
      return {
        files: data?.files ?? [],
        storage: data?.storage ?? { used_bytes: 0, file_count: 0 },
        total: data?.meta?.total ?? 0,
      };
    },
    enabled: active,
    refetchInterval: active ? 10_000 : false,
    gcTime: active ? undefined : 0,
  });
}
