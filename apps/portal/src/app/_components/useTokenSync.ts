/**
 * Purpose: Wraps useTokenMetrics with peerId/connected/launchedToken guards.
 *          Self-healing: if backend GET returns 404, re-POST via daemon proxy.
 *          ONLY re-POST on 404. NEVER on 5xx (prevents write storms during outages).
 */

import { useEffect } from 'react';
import { useTokenMetrics } from '@/lib/api/hooks/use-token-metrics';
import { apiClient } from '@/lib/api/client';
import { ApiRequestError } from '@/lib/api/errors';
import { persistLaunchedToken } from '@/lib/api/hooks/use-launch-persist';
import type { LaunchedToken } from '@/components/features/token-wizard';

export function useTokenSync(
  peerId: string,
  connected: boolean,
  launchedToken: LaunchedToken | null,
) {
  const tokenMetrics = useTokenMetrics(
    peerId || null,
    launchedToken?.contractAddr ?? null,
  );

  // Self-healing: if localStorage has token but backend returns 404, re-POST
  useEffect(() => {
    if (!peerId || !connected || !launchedToken) return;

    apiClient(`/api/peers/${peerId}/token`)
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
          persistLaunchedToken(launchedToken).catch(() => {});
        }
        // 5xx, network errors, non-ApiRequestError: do nothing — retries on next page load
      });
  }, [peerId, connected, launchedToken]);

  return { tokenMetrics };
}
