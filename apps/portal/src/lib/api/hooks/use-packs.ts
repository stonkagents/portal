/**
 * Purpose: React Query hook for curated packs — fetches GET /api/packs from tracker
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { transformPacks } from '@/lib/api/transformers/gallery';
import type { PortalPack } from '@/lib/types/backend';

export function usePacks() {
  return useQuery({
    queryKey: queryKeys.gallery.packs,
    queryFn: async () => {
      const raw = await apiClient<PortalPack[]>('/api/packs');
      return transformPacks(raw);
    },
  });
}
