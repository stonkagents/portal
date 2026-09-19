/**
 * Purpose: React Query hook for daemon node stats (speeds, peers, uptime)
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { daemonApi } from '@/lib/api/daemon';
import { queryKeys } from '@/lib/api/keys';
import { useDaemon } from '@/providers/DaemonProvider';

export function useNodeStats() {
  const { connected } = useDaemon();

  return useQuery({
    queryKey: queryKeys.daemon.nodeStats,
    queryFn: () => daemonApi.nodeStats(),
    meta: { skipGlobalErrorHandler: true },
    enabled: connected,
    refetchInterval: connected ? 10_000 : false,
    /** Drop cached data immediately when query is disabled (daemon disconnects) — prevents stale speeds showing */
    gcTime: connected ? undefined : 0,
  });
}
