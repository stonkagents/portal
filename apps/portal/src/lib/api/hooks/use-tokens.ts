/**
 * Purpose: React Query hook for token gallery listing from tracker /api/tokens
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/keys';
import { TOKEN_LIST_LIMIT, fetchTokenList } from '@/lib/api/tokens-list';

export function useTokens() {
  return useQuery({
    queryKey: queryKeys.tokens.list(TOKEN_LIST_LIMIT),
    queryFn: () => fetchTokenList(TOKEN_LIST_LIMIT),
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
