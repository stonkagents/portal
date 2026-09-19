/**
 * Purpose: Server-side gallery search with debounce — replaces client-side filtering
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/keys';
import { transformGalleryResponse } from '@/lib/api/transformers/gallery';
import { useDebouncedValue } from '@/lib/utils/use-debounced-value';
import type { PortalGalleryResponse } from '@/lib/types/backend';

const SEARCH_DEBOUNCE_MS = 300;

export function useGallerySearch(query: string, typeFilter?: string) {
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const activeType = typeFilter && typeFilter !== 'All' ? typeFilter : '';

  return useQuery({
    queryKey: queryKeys.gallery.search(debouncedQuery, activeType),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set('q', debouncedQuery);
      if (activeType) params.set('type', activeType);
      const qs = params.toString();
      const path = qs ? `/api/gallery/search?${qs}` : '/api/gallery/search';
      const raw = await apiClient<PortalGalleryResponse>(path);
      return transformGalleryResponse(raw);
    },
    staleTime: 30_000,
  });
}
