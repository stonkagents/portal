/**
 * Purpose: React Query hook for backend-aggregated token metrics (tracker direct read)
 */
'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import type { TokenMetricsResponse } from '@/lib/types/backend';

interface UseTokenMetricsOptions {
  enablePolling?: boolean;
}

export function useTokenMetrics(
  peerId: string | null,
  contractAddr: string | null,
  options?: UseTokenMetricsOptions,
) {
  const enablePolling = options?.enablePolling ?? false;

  return useQuery({
    queryKey: queryKeys.tokens.metrics(peerId),
    queryFn: () => apiClient<TokenMetricsResponse>(`/api/peers/${peerId}/token/metrics`),
    enabled: !!peerId && !!contractAddr,
    staleTime: 2 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    // Gate 0 Finding #2 fix: Also refresh when complete=null or data is all-null (prevents stuck "Checking..." state)
    refetchInterval: (query) => {
      if (!enablePolling) return false;
      const { data } = query.state;
      if (!data) return false;

      // Auto-refresh during bonding curve phase
      if (data.complete === false) return 30_000;

      // Auto-refresh when complete is null (indexing window) or all key fields are null (backend issue/outage)
      const allNull = data.marketCapUsd == null && data.holders == null && data.solRaised == null;
      if (data.complete == null || allNull) return 30_000;

      // Stop auto-refresh when graduated (complete=true)
      return false;
    },
  });
}
