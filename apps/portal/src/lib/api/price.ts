/**
 * Display prices, and nothing else.
 *
 * The launch fee a creator actually pays is priced by the tracker and arrives in
 * `GET /api/launch/config` as `fee.lamports`. This module exists so the summary
 * can put a USD figure next to a quote amount and a SOL amount. It never decides
 * what a transaction transfers. The feed is cached for 60 seconds and, when it
 * is unreachable, degrades to `config.fees.fallbackSolUsd` rather than blocking.
 */
import { config } from '@/config';

/** How long one price is reused before the feed is asked again. */
export const PRICE_CACHE_MS = 60_000;

type PriceSource = 'live' | 'fallback';

export interface SolPrice {
  /** SOL price in USD. */
  usd: number;
  source: PriceSource;
  /** Epoch millis the value was produced. */
  fetchedAt: number;
}

export interface LaunchFeeQuote {
  /** The fee in USD, from `config.fees.launchFeeUsd`. */
  usd: number;
  /** The same fee in SOL at `solUsd`. */
  sol: number;
  /** The same fee in lamports, rounded up. */
  lamports: number;
  /** The SOL price the conversion used. */
  solUsd: number;
  source: PriceSource;
}

let cached: SolPrice | null = null;
let inFlight: Promise<SolPrice> | null = null;

/** Drop the cache. Tests and the "refresh price" affordance use this. */
export function resetSolUsdCache(): void {
  cached = null;
  inFlight = null;
}

/** The cached price without touching the network, or null when it is stale. */
export function peekSolUsd(now: number = Date.now()): SolPrice | null {
  if (cached && now - cached.fetchedAt < PRICE_CACHE_MS) return cached;
  return null;
}

function fallbackPrice(now: number): SolPrice {
  return { usd: config.fees.fallbackSolUsd, source: 'fallback', fetchedAt: now };
}

function priceUrl(): string {
  const base = config.api.solPriceUrl.replace(/\/+$/, '');
  return `${base}?ids=${config.solana.wrappedSolMint}`;
}

/** Pull `data[mint].usdPrice` out of the feed response, or null if it is not usable. */
function readUsdPrice(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const mint = config.solana.wrappedSolMint;

  const root = payload as Record<string, unknown>;
  const container = (typeof root.data === 'object' && root.data !== null ? root.data : root) as Record<string, unknown>;
  const entry = container[mint];
  if (typeof entry !== 'object' || entry === null) return null;

  const raw = (entry as Record<string, unknown>).usdPrice;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

async function fetchSolUsd(now: number): Promise<SolPrice> {
  try {
    const response = await fetch(priceUrl(), { headers: { Accept: 'application/json' } });
    if (!response.ok) return fallbackPrice(now);
    const usd = readUsdPrice(await response.json());
    return usd === null ? fallbackPrice(now) : { usd, source: 'live', fetchedAt: now };
  } catch {
    return fallbackPrice(now);
  }
}

/**
 * The SOL price in USD, cached for 60 seconds.
 *
 * Concurrent callers share one request. A failed or nonsense response resolves
 * to the configured fallback with `source: 'fallback'`; this never rejects.
 */
export async function getSolUsd(): Promise<SolPrice> {
  const now = Date.now();

  const fresh = peekSolUsd(now);
  if (fresh) return fresh;
  if (inFlight) return inFlight;

  inFlight = fetchSolUsd(now)
    .then(price => {
      cached = price;
      return price;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Convert a USD amount to lamports at the given SOL price, rounding up so we
 * never under-collect the fee.
 *
 * @throws {RangeError} when `usd` is negative or `solUsd` is not a positive number.
 */
export function usdToLamports(usd: number, solUsd: number): number {
  if (!Number.isFinite(usd) || usd < 0) throw new RangeError(`usdToLamports: usd must be a non-negative number, got ${String(usd)}`);
  if (!Number.isFinite(solUsd) || solUsd <= 0) {
    throw new RangeError(`usdToLamports: solUsd must be a positive number, got ${String(solUsd)}`);
  }
  return Math.ceil((usd / solUsd) * config.solana.lamportsPerSol);
}

/**
 * USD prices for many mints at once, for display only.
 *
 * Mints the feed does not know are simply absent from the result, so a caller
 * renders a dash rather than a wrong number. This never rejects.
 */
export async function getPricesUsd(mints: readonly string[]): Promise<Record<string, number>> {
  const unique = [...new Set(mints.filter(Boolean))];
  if (unique.length === 0) return {};

  const base = config.api.solPriceUrl.replace(/\/+$/, '');
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 50) chunks.push(unique.slice(i, i + 50));

  const results = await Promise.all(
    chunks.map(async chunk => {
      try {
        const response = await fetch(`${base}?ids=${chunk.join(',')}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) return {};
        const body: unknown = await response.json();
        const root = (body ?? {}) as Record<string, unknown>;
        const container = (typeof root.data === 'object' && root.data !== null ? root.data : root) as Record<string, unknown>;
        const out: Record<string, number> = {};
        for (const [mint, entry] of Object.entries(container)) {
          const raw = (entry as { usdPrice?: unknown } | null)?.usdPrice;
          const value = typeof raw === 'string' ? Number(raw) : raw;
          if (typeof value === 'number' && Number.isFinite(value) && value > 0) out[mint] = value;
        }
        return out;
      } catch {
        return {};
      }
    }),
  );

  return Object.assign({}, ...results) as Record<string, number>;
}

/**
 * Price our launch fee right now.
 *
 * @param usdOverride - Quote a different amount than `config.fees.launchFeeUsd`.
 */
export async function launchFeeQuote(usdOverride?: number): Promise<LaunchFeeQuote> {
  const price = await getSolUsd();
  const usd = usdOverride ?? config.fees.launchFeeUsd;
  const lamports = usdToLamports(usd, price.usd);

  return {
    usd,
    sol: lamports / config.solana.lamportsPerSol,
    lamports,
    solUsd: price.usd,
    source: price.source,
  };
}
