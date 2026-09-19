/**
 * Purpose: React Query hooks for gallery/knowledge hub data fetching
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { transformGalleryResponse } from '@/lib/api/transformers';
import type { PortalGalleryResponse } from '@/lib/types/backend';

export function useGallery() {
  return useQuery({
    queryKey: queryKeys.gallery.stats,
    queryFn: async () => {
      const raw = await apiClient<PortalGalleryResponse>('/api/gallery/search');
      return transformGalleryResponse(raw);
    },
  });
}
