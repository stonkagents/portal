/**
 * Purpose: React Query hook for GET /api/peers/{id}/token — "my token" by peer ID.
 *          Used by home page to sync launchedToken from API when daemon is connected.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';
import type { PeerToken } from '@/lib/types/backend';
import type { LaunchedToken } from '@/components/features/token-wizard';

function peerTokenToLaunchedToken(t: PeerToken): LaunchedToken {
  return {
    name: t.token_name,
    ticker: t.token_ticker,
    imageDataUrl: null,
    contractAddr: t.token_contract_address,
    ...(t.token_image_url?.trim() ? { imageUrl: t.token_image_url } : {}),
  };
}

export function usePeerToken(peerId: string | null) {
  const query = useQuery({
    queryKey: queryKeys.peers.token(peerId ?? ''),
    queryFn: async (): Promise<LaunchedToken | null> => {
      if (!peerId) return null;
      try {
        const data = await apiClient<PeerToken>(`/api/peers/${peerId}/token`);
        return peerTokenToLaunchedToken(data);
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
          return null;
        }
        throw err;
      }
    },
    enabled: !!peerId && peerId.length > 0,
    staleTime: 60_000,
    retry: 1,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isFetched: query.isFetched,
    isError: query.isError,
  };
}
