/**
 * Purpose: React Query hook for top seeders leaderboard from tracker
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { LeaderboardEntry } from '@/lib/types/backend';

export function useTopSeeders() {
  return useQuery({
    queryKey: ['leaderboard', 'seeders'],
    queryFn: () => apiClient<LeaderboardEntry[]>('/api/v1/tracker/leaderboard/seeders?limit=5'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
