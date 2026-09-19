/**
 * Purpose: React Query client singleton with defaults for stale time, retries, and refetch behavior
 */

import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { globalErrorRef, isGlobalToastError } from '@/lib/api/global-error-handler';

function handleGlobalError(source: 'query' | 'mutation', error: unknown, meta?: Record<string, unknown>) {
  if (meta?.skipGlobalErrorHandler) return;
  // Background/passive queries should stay silent by default.
  // Only explicit opt-in queries can show global snackbars.
  if (source === 'query' && meta?.allowGlobalErrorHandler !== true) return;
  if (!isGlobalToastError(error)) return;
  globalErrorRef.current?.(error);
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => handleGlobalError('query', error, query.meta),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => handleGlobalError('mutation', error, mutation.meta),
    }),
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}
