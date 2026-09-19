/**
 * Purpose: React Query hooks for home page data (trending, most installed, stats)
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { transformHomeResponse } from '@/lib/api/transformers';
import type { PortalHomeResponse } from '@/lib/types/backend';

export function useHome() {
  return useQuery({
    queryKey: queryKeys.home.all,
    queryFn: async () => {
      const raw = await apiClient<PortalHomeResponse>('/api/home');
      return transformHomeResponse(raw);
    },
    staleTime: 60_000,
  });
}
