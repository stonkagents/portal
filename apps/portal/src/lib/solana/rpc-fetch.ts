/**
 * Purpose: RPC failover for every Connection the portal opens. The primary
 *          (NEXT_PUBLIC_SOLANA_RPC_URL) is tried first; when it errors, times
 *          out, answers 5xx/429, or returns the provider's "unable to complete
 *          request" style JSON-RPC error, the same request is replayed against
 *          the fallback (NEXT_PUBLIC_SOLANA_RPC_FALLBACK_URL, else the cluster's
 *          public RPC). Reads that are the launch flow's first step must not
 *          fail because one provider's node is unwell.
 */

/** JSON-RPC error codes providers return when their node, not the request, is at fault. */
const PROVIDER_FAULT_CODES = new Set([-32001, -32002, -32003, -32004, -32005, -32603]);
const PROVIDER_FAULT_TEXT = /unable to complete request|internal error|service unavailable|node is behind|timed? ?out/i;

export interface FailoverFetchOptions {
  primary: string;
  fallback: string | null;
  /** Per-attempt timeout in ms. */
  timeoutMs?: number;
  /** Called when a request moves to the fallback; one line for the console. */
  onFailover?: (reason: string) => void;
  fetchImpl?: typeof fetch;
}

/** True when a successful HTTP response still carries a provider-side failure. */
export async function responseLooksBroken(res: Response): Promise<{ broken: boolean; reason: string }> {
  if (res.status === 429 || res.status >= 500) return { broken: true, reason: `HTTP ${res.status}` };
  if (!res.ok) return { broken: false, reason: '' };
  let text: string;
  try {
    text = await res.clone().text();
  } catch {
    return { broken: false, reason: '' };
  }
  try {
    const body = JSON.parse(text) as unknown;
    const items = Array.isArray(body) ? body : [body];
    for (const item of items) {
      const err = (item as { error?: { code?: number; message?: string } } | null)?.error;
      if (!err) continue;
      if ((typeof err.code === 'number' && PROVIDER_FAULT_CODES.has(err.code)) || PROVIDER_FAULT_TEXT.test(err.message ?? '')) {
        return { broken: true, reason: `RPC ${err.code ?? ''} ${err.message ?? ''}`.trim() };
      }
    }
  } catch {
    return { broken: true, reason: 'non-JSON body' };
  }
  return { broken: false, reason: '' };
}

/**
 * A fetch for web3.js `Connection({ fetch })`: primary first, fallback on a
 * provider fault. Both attempts send the identical JSON-RPC body.
 */
export function createFailoverFetch(options: FailoverFetchOptions): typeof fetch {
  const { primary, fallback, timeoutMs = 12_000, onFailover, fetchImpl } = options;
  const doFetch: typeof fetch = (input, init) => (fetchImpl ?? fetch)(input, init);

  const attempt = async (url: string, init: RequestInit | undefined): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Honour the caller's signal too.
    const outer = init?.signal;
    const onAbort = () => controller.abort();
    outer?.addEventListener('abort', onAbort);
    try {
      return await doFetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    }
  };

  const failover: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    // Only the configured primary is failed over; anything else passes through.
    if (url !== primary || !fallback || fallback === primary) return doFetch(input, init);
    let reason: string;
    try {
      const res = await attempt(primary, init);
      const check = await responseLooksBroken(res);
      if (!check.broken) return res;
      ({ reason } = check);
    } catch (err) {
      if (init?.signal?.aborted) throw err;
      reason = err instanceof Error ? err.message : String(err);
    }
    onFailover?.(reason);
    return attempt(fallback, init);
  };
  return failover;
}

/** The cluster's public RPC, the fallback when the environment names none. */
export function publicRpcFor(cluster: 'devnet' | 'mainnet'): string {
  return cluster === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com';
}

/**
 * A chain read's failure in plain words for a panel: when both RPCs were
 * unreachable (or answered with a provider fault), say that instead of
 * passing on web3.js's "failed to get info for multiple accounts, RPC_ERROR,
 * Failed to fetch". Anything else keeps its own message.
 */
export function describeChainError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '');
  if (
    /failed to fetch|fetch failed|networkerror|load failed|RPC_ERROR|ECONNREFUSED|429|503/i.test(message) ||
    PROVIDER_FAULT_TEXT.test(message)
  ) {
    return 'the Solana RPC could not be reached. Retrying.';
  }
  return message || 'unknown error';
}
