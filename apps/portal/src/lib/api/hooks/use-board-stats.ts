/**
 * Purpose: React Query hook for network dashboard stats from /api/v1/tracker/stats
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { DashboardStats } from '@/lib/types/backend';

export function useBoardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiClient<DashboardStats>('/api/v1/tracker/stats'),
    meta: { skipGlobalErrorHandler: true },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
