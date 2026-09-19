/**
 * Purpose: Global error handler for React Query — classifies errors for toast display
 *          and provides module-level ref bridge between QueryCache and toast context.
 */

import { ApiRequestError } from '@/lib/api/errors';

/** Error codes that should NOT trigger a global toast (handled locally or via future UI). */
const LOCAL_ONLY_CODES = new Set(['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'INSUFFICIENT_CREDITS', 'IP_BLOCKED']);

/**
 * Determines if an error should trigger a global toast notification.
 * Returns true for transient/infrastructure errors, false for business errors
 * that have dedicated local UI handling.
 */
export function isGlobalToastError(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return !LOCAL_ONLY_CODES.has(error.code);
  }
  // Network errors (TypeError: Failed to fetch) and unknown errors → toast
  return true;
}

/** Module-level ref for bridging QueryCache onError to React toast context. */
export const globalErrorRef: { current: ((error: unknown) => void) | null } = {
  current: null,
};
