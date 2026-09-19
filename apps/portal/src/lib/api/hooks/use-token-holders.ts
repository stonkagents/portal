/**
 * Token holder count from Solana RPC (fallback when tracker metrics.holders is null).
 * Uses getTokenLargestAccounts; count is at most 20 (top 20 accounts).
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/keys';
import { getSolanaConnection, loadWeb3 } from '@/lib/solana/connection';

async function fetchHolderCount(mint: string): Promise<number> {
  const [connection, { PublicKey }] = await Promise.all([getSolanaConnection(), loadWeb3()]);
  const pk = new PublicKey(mint);
  const result = await connection.getTokenLargestAccounts(pk);
  return result.value?.length ?? 0;
}

interface UseTokenHoldersOptions {
  enabled?: boolean;
}

export function useTokenHolders(mint: string | null, options?: UseTokenHoldersOptions) {
  const enabled = options?.enabled ?? true;
  return useQuery({
    queryKey: [...queryKeys.tokens.detail(mint ?? ''), 'holders'] as const,
    queryFn: () => fetchHolderCount(mint!),
    enabled: !!mint && enabled,
    staleTime: 60_000,
  });
}
