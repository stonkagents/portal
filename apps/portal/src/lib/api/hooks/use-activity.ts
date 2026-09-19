/**
 * Purpose: React Query hook for activity feed — fetches /api/activity/recent, transforms to frontend shape
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import type { PortalActivityEntry } from '@/lib/types/backend';

/** Frontend activity item shape consumed by SwarmActivityFeed */
export interface ActivityItem {
  id: string;
  text: string;
  time: string;
  color: 'green' | 'blue' | 'yellow' | 'purple';
}

/** Transform backend activity entries to frontend shape */
function transformActivity(entries: PortalActivityEntry[]): ActivityItem[] {
  return entries.map((e, i) => ({
    id: `${e.type}-${e.occurred_at}-${i}`,
    text: e.title,
    time: e.time_ago,
    color: (e.color as ActivityItem['color']) || 'green',
  }));
}

export function useActivity() {
  return useQuery({
    queryKey: queryKeys.activity.recent,
    queryFn: async () => {
      const raw = await apiClient<PortalActivityEntry[]>('/api/activity/recent?limit=20');
      return transformActivity(raw);
    },
    refetchInterval: 15_000,
  });
}
