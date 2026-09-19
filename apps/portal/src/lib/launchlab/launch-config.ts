/**
 * The launch configuration, straight from the tracker.
 *
 * `GET /api/launch/config?quoteMint=<mint>` is the single source of truth for
 * everything the launch engine puts on chain: the LaunchLab program, our
 * platform config, the treasury the launch fee is paid to, the live fee in
 * lamports, the Token-2022 transfer tax, the quote list, the selected quote's
 * LaunchLab config id, the raise the curve graduates at, and the curve shape.
 *
 * Nothing in `@/config` may substitute for any of it. A devnet tracker answers
 * with devnet program ids and devnet quote configs; a mainnet tracker answers
 * with mainnet ones. The portal build is identical either way.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { config, trackerEndpoint } from '@/config';
import type { QuoteCategory } from '@/lib/types/agent-token';

/** One quote asset a token can be launched against. */
export interface LaunchQuote {
  quoteMint: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Base58 id of the SPL Token or Token-2022 program that owns the quote mint. */
  tokenProgram: string;
  category: QuoteCategory;
  /** Raydium's quote config for this mint. Required to build a launch. */
  launchlabConfigId: string;
  /** Smallest raise Raydium accepts for this quote, in raw units. */
  minFundRaisingRaw: string;
  enabled: boolean;
  sortOrder: number;
}

/** Our launch fee, priced in SOL at request time. */
export interface LaunchFeeInfo {
  usd: number;
  /** What the launch transaction transfers to `treasury`. */
  lamports: number;
  solUsd: number;
  pricedAt: string;
  /** True when the SOL price behind `lamports` is older than the tracker allows. */
  stale: boolean;
}

/** The raise the bonding curve graduates at, in the selected quote. */
export interface LaunchRaise {
  /** Raw quote units, as a decimal string. Passed to the program verbatim. */
  raw: string;
  /** The same amount in whole tokens, for display. */
  units: number;
  minimumRaw: string;
  /** Human sentence explaining how the size was chosen. */
  basis: string;
}

/** The bonding curve every Agent token launches on. */
export interface LaunchCurve {
  configId: string;
  curveType: string;
  migrateType: string;
  baseDecimals: number;
  /** Total supply in raw base units, as a decimal string. */
  supply: string;
  /** Raw base units sold on the curve. */
  totalSellA: string;
  totalLockedAmount: string;
  cliffPeriod: string;
  unlockPeriod: string;
  cpmmCreatorFeeOn: number;
}

/** The whole `GET /api/launch/config` payload. */
export interface LaunchConfig {
  /** The cluster the tracker's program ids and quote configs live on: 'devnet' | 'mainnet' | 'mainnet-beta' | .... */
  cluster?: string;
  programId: string;
  platformId: string;
  treasury: string;
  /** Token-2022 transfer tax baked into every launched mint, in basis points. */
  transferFeeBps: number;
  fee: LaunchFeeInfo;
  /** The mint every launch on this platform raises in: $STONK. */
  defaultQuoteMint?: string;
  /** The quotes this platform launches against: exactly one, $STONK. */
  quotes: LaunchQuote[];
  /** The quote this response was resolved for. */
  quote: LaunchQuote;
  raise: LaunchRaise;
  curve: LaunchCurve;
}

export const LAUNCH_CONFIG_PATH = '/api/launch/config';

/** How long a launch config is reused. The fee inside it is priced live, so keep it short. */
export const LAUNCH_CONFIG_STALE_MS = 30_000;

/** The tracker's answer to a config request for any quote but $STONK. */
export const QUOTE_NOT_ALLOWED_CODE = 'QUOTE_NOT_ALLOWED';

export class LaunchConfigError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    /** The tracker's error code, when it answered with one. */
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'LaunchConfigError';
  }

  /** True for a refusal that a retry cannot change (the tracker answered 4xx). */
  get final(): boolean {
    return this.status !== undefined && this.status >= 400 && this.status < 500;
  }
}

function launchConfigUrl(quoteMint?: string): string {
  const base = trackerEndpoint(LAUNCH_CONFIG_PATH);
  return quoteMint ? `${base}?quoteMint=${encodeURIComponent(quoteMint)}` : base;
}

/**
 * Fetch the launch configuration for one quote.
 *
 * @param quoteMint - Quote to resolve `quote`, `raise` and `curve` for. Omit for
 *   the tracker's default quote ($STONK).
 * @throws {LaunchConfigError} when the tracker is unreachable or answers badly.
 */
export async function getLaunchConfig(quoteMint?: string, signal?: AbortSignal): Promise<LaunchConfig> {
  if (!config.api.trackerUrl) {
    // The env hint is for whoever built this bundle, not for the creator reading the form.
    console.error('[launch-config] No tracker is configured. Set NEXT_PUBLIC_TRACKER_URL (or NEXT_PUBLIC_API_BASE_URL).');
    throw new LaunchConfigError('The launchpad is not configured on this build.');
  }

  let response: Response;
  try {
    response = await fetch(launchConfigUrl(quoteMint), { headers: { Accept: 'application/json' }, signal });
  } catch (err) {
    throw new LaunchConfigError(`Could not reach the launchpad: ${err instanceof Error ? err.message : 'network error'}`);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    if (error?.code === QUOTE_NOT_ALLOWED_CODE) {
      throw new LaunchConfigError(
        `Only $STONK launches are allowed on this launchpad (${QUOTE_NOT_ALLOWED_CODE}): ${error.message ?? 'the quote asked for is not $STONK'}.`,
        response.status,
        error.code,
      );
    }
    throw new LaunchConfigError(`The launchpad is not answering (${response.status}).`, response.status, error?.code);
  }

  const payload = (body as { data?: unknown } | null)?.data ?? body;
  return assertLaunchConfig(payload);
}

/** Narrow an unknown payload to a usable launch config, or say what is missing. */
export function assertLaunchConfig(payload: unknown): LaunchConfig {
  if (typeof payload !== 'object' || payload === null) {
    throw new LaunchConfigError('The launchpad returned no configuration.');
  }
  const dto = payload as Partial<LaunchConfig>;

  const missing: string[] = [];
  if (!dto.programId) missing.push('programId');
  if (!dto.platformId) missing.push('platformId');
  if (!dto.treasury) missing.push('treasury');
  if (!dto.quote?.launchlabConfigId) missing.push('quote.launchlabConfigId');
  if (!dto.curve?.supply) missing.push('curve.supply');
  if (!dto.raise?.raw) missing.push('raise.raw');
  if (missing.length > 0) {
    throw new LaunchConfigError(`The launchpad configuration is incomplete: ${missing.join(', ')}.`);
  }

  return {
    ...(dto as LaunchConfig),
    transferFeeBps: dto.transferFeeBps ?? config.fees.holderTaxBps,
    quotes: Array.isArray(dto.quotes) && dto.quotes.length > 0 ? dto.quotes : [dto.quote as LaunchQuote],
  };
}

/** Query key for the launch config, so a quote change refetches and nothing else does. */
export const launchConfigKey = (quoteMint?: string) => ['launch', 'config', quoteMint ?? 'default'] as const;

/**
 * The launch configuration as React state.
 *
 * @param quoteMint - Quote to price. Changing it refetches; the previous answer
 *   stays on screen meanwhile (`isPlaceholderData` says so), so the picker never
 *   flickers. Do not build a transaction from placeholder data: its raise and
 *   config id belong to the previous quote.
 * @param options.live - True while a launch form is open: the config is re-read
 *   every LAUNCH_CONFIG_STALE_MS and on window focus so the raise tracks the market.
 */
export function useLaunchConfig(quoteMint?: string, options: { live?: boolean } = {}) {
  const live = options.live === true;
  return useQuery({
    queryKey: launchConfigKey(quoteMint),
    queryFn: ({ signal }) => getLaunchConfig(quoteMint, signal),
    staleTime: LAUNCH_CONFIG_STALE_MS,
    // One more try for an outage; none for a refusal the tracker meant (4xx, e.g. QUOTE_NOT_ALLOWED).
    retry: (count, err) => count < 1 && !(err instanceof LaunchConfigError && err.final),
    // A form that is open keeps its raise and fee current as SOL and the quote move; readers elsewhere do not poll.
    refetchInterval: live ? LAUNCH_CONFIG_STALE_MS : false,
    refetchOnWindowFocus: live,
    placeholderData: keepPreviousData,
  });
}

/** One spelling per cluster: 'mainnet-beta' and 'mainnet' are the same place, and so are the chain ids. */
export function normalizeCluster(value: string | null | undefined): string | null {
  if (!value) return null;
  const word = value
    .toLowerCase()
    .replace(/^solana:/, '')
    .trim();
  if (word === 'mainnet-beta' || word === 'mainnet') return 'mainnet';
  return word || null;
}

/** Launch fee in whole SOL, for display next to the USD figure. */
export function launchFeeSol(fee: LaunchFeeInfo): number {
  return fee.lamports / config.solana.lamportsPerSol;
}

/** The raise as whole quote tokens, preferring the tracker's own rounding. */
export function raiseUnits(raise: LaunchRaise, quote: LaunchQuote): number {
  if (Number.isFinite(raise.units) && raise.units > 0) return raise.units;
  const raw = Number(raise.raw);
  return Number.isFinite(raw) ? raw / 10 ** quote.decimals : 0;
}
