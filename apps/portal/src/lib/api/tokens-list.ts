/**
 * Shared token gallery list fetch for React Query deduplication (gallery + detail by contract).
 */
import { apiClientPaginated } from '@/lib/api/client';
import type { PeerTokenListing } from '@/lib/types/backend';

export const TOKEN_LIST_LIMIT = 100;

export async function fetchTokenList(limit: number = TOKEN_LIST_LIMIT): Promise<PeerTokenListing[]> {
  const res = await apiClientPaginated<PeerTokenListing[]>(`/api/tokens?limit=${limit}`);
  return res.data;
}
