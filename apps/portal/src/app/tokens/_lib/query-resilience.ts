/**
 * Retry and background-refetch settings every token-page query shares.
 *
 * A tracker rollout or a rate-limited RPC leaves a read failing for up to a
 * minute. Back off through it (three retries, exponential, capped), then keep
 * trying quietly every fifteen seconds while the query is in error, so the
 * last good data stays on screen with a "reconnecting" hint rather than a
 * banner on the first blip.
 */

const RETRY_COUNT = 3;
const RETRY_DELAY_CAP_MS = 8_000;
export const ERROR_REFETCH_MS = 15_000;

export const retryDelay = (attempt: number): number => Math.min(1_000 * 2 ** attempt, RETRY_DELAY_CAP_MS);

/**
 * Poll `normalMs` when healthy (false for none), and every 15 s while in error.
 * Shaped for react-query's `refetchInterval` function form.
 */
export function refetchInterval(normalMs: number | false) {
  return (query: { state: { status: string } }): number | false => (query.state.status === 'error' ? ERROR_REFETCH_MS : normalMs);
}

/** The shared options: spread into `useQuery`. */
export function resilient(normalMs: number | false = false) {
  return {
    retry: RETRY_COUNT,
    retryDelay,
    refetchInterval: refetchInterval(normalMs),
    refetchOnWindowFocus: false,
  };
}

/** True when a query is failing but still has data to show — the "reconnecting" state. */
export function isReconnecting(query: { isError: boolean; data: unknown; isFetching?: boolean }): boolean {
  return query.isError && query.data !== undefined;
}
