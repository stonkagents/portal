'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchGatewayLink } from '@/lib/api/daemon-gateway';
import { useDaemon } from '@/providers/DaemonProvider';

/** The OpenClaw gateway link while the agent is connected; refreshed every 30 s. */
export function useGatewayLink() {
  const { connected } = useDaemon();
  return useQuery({
    queryKey: ['daemon', 'gateway-link'],
    queryFn: fetchGatewayLink,
    enabled: connected,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
}
