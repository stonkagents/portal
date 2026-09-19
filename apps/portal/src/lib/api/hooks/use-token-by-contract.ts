/**
 * Token detail page: resolve a single token by contract address.
 * Fetches paginated list and finds by token_contract_address (no backend GET-by-contract required).
 */
'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/keys';
import { TOKEN_LIST_LIMIT, fetchTokenList } from '@/lib/api/tokens-list';
import type { PeerTokenListing } from '@/lib/types/backend';

export function useTokenByContract(contract: string | null, options?: { enablePolling?: boolean }) {
  const enablePolling = options?.enablePolling ?? false;
  const select = useCallback(
    (data: PeerTokenListing[]): PeerTokenListing | null =>
      contract ? (data.find((t) => t.token_contract_address === contract) ?? null) : null,
    [contract],
  );
  return useQuery({
    queryKey: queryKeys.tokens.list(TOKEN_LIST_LIMIT),
    queryFn: () => fetchTokenList(TOKEN_LIST_LIMIT),
    select,
    enabled: !!contract && contract.length > 0,
    staleTime: 60_000,
    retry: 1,
    refetchInterval: enablePolling ? 30_000 : false,
  });
}
