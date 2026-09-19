/**
 * Purpose: React Query hooks for social platform connections and disconnect
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/keys';
import { socialApi } from '@/lib/api/daemon-credits';
import { useDaemon } from '@/providers/DaemonProvider';

export function useSocialConnections() {
  const { connected } = useDaemon();
  return useQuery({
    queryKey: queryKeys.social.connections,
    queryFn: () => socialApi.getConnections(),
    enabled: connected,
  });
}
