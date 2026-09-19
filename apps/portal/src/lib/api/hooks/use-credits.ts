/**
 * Purpose: React Query hooks for credit balance, transactions, and spend tokens
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/keys';
import { creditApi } from '@/lib/api/daemon-credits';
import { useDaemon } from '@/providers/DaemonProvider';

export function useCredits() {
  const { connected } = useDaemon();
  return useQuery({
    queryKey: queryKeys.credits.balance,
    queryFn: () => creditApi.getBalance(),
    enabled: connected,
  });
}

export function useTransactions(limit = 20, offset = 0) {
  const { connected } = useDaemon();
  return useQuery({
    queryKey: [...queryKeys.credits.transactions, limit, offset] as const,
    queryFn: () => creditApi.getTransactions(limit, offset),
    enabled: connected,
  });
}
