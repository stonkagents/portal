/**
 * Jupiter's Swap API, for buying and selling the Network token in the app.
 *
 *   GET  {base}/quote?inputMint=&outputMint=&amount=<raw>&slippageBps=<n>
 *        { inputMint, inAmount, outputMint, outAmount, otherAmountThreshold, swapMode,
 *          slippageBps, priceImpactPct (string), routePlan: [{ swapInfo: { label, ... }, percent }],
 *          contextSlot, ... }
 *   POST {base}/swap  { quoteResponse, userPublicKey, wrapAndUnwrapSol, dynamicComputeUnitLimit,
 *                       dynamicSlippage, prioritizationFeeLamports }
 *        { swapTransaction (base64 v0), lastValidBlockHeight, prioritizationFeeLamports,
 *          simulationError: null | { errorCode, error }, dynamicSlippageReport, ... }
 *
 * Free tier, no key, CORS open (shapes taken with curl on 2026-09-15; fixtures
 * under `__fixtures__/jupiter/`). Amounts are raw integers as strings and are
 * carried as bigint here; nothing is rounded before the wallet sees it. The
 * quote object is kept verbatim (`raw`) because the swap build wants it back
 * exactly as served. The parsers tolerate a missing field: an unusable answer
 * is null, never a guess.
 */

import { config } from '@/config';

const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** A raw integer amount as the API sends it (a string, sometimes a number). Null for anything else. */
function rawAmount(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

/** A decimal the API sends as a string or a number. */
function decimal(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

/** Thrown for anything but a clean answer. `code` is Jupiter's `errorCode` when it sent one. */
export class JupiterApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'JupiterApiError';
  }
}

export interface JupiterRouteStep {
  /** The venue, as Jupiter labels it: "Raydium CLMM", "Raydium CP", "Meteora DLMM", ... */
  label: string;
  ammKey: string | null;
  inputMint: string | null;
  outputMint: string | null;
  /** Share of the input this step carries, in percent. */
  percent: number;
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  /** Raw input units. */
  inAmount: bigint;
  /** Raw output units, before slippage. */
  outAmount: bigint;
  /** The worst output the swap accepts (ExactIn) or the most input it may spend (ExactOut), in raw units. */
  otherAmountThreshold: bigint;
  swapMode: string;
  slippageBps: number;
  /** In percent, as Jupiter reports it. */
  priceImpactPct: number;
  route: JupiterRouteStep[];
  contextSlot: number | null;
  /** The quote exactly as served, for the swap build. */
  raw: Record<string, unknown>;
}

export interface JupiterSwapBuild {
  /** Base64 of a v0 transaction, unsigned. */
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number | null;
  /** The slippage Jupiter settled on when `dynamicSlippage` was asked for. */
  dynamicSlippageBps: number | null;
  /** Jupiter simulated the transaction while building it; a failure is reported here, not thrown. */
  simulationError: { code: string | null; message: string } | null;
}

/** Shape a `GET /quote` answer. Null when it is not a usable quote. Exported for tests. */
export function parseJupiterQuote(body: unknown): JupiterQuote | null {
  const quote = obj(body);
  const inputMint = str(quote.inputMint);
  const outputMint = str(quote.outputMint);
  const inAmount = rawAmount(quote.inAmount);
  const outAmount = rawAmount(quote.outAmount);
  if (!inputMint || !outputMint || inAmount == null || outAmount == null) return null;
  const plan = Array.isArray(quote.routePlan) ? quote.routePlan : [];
  const route: JupiterRouteStep[] = plan.map(step => {
    const info = obj(obj(step).swapInfo);
    return {
      label: str(info.label) ?? 'unknown venue',
      ammKey: str(info.ammKey),
      inputMint: str(info.inputMint),
      outputMint: str(info.outputMint),
      percent: decimal(obj(step).percent) ?? 100,
    };
  });
  const slippage = decimal(quote.slippageBps);
  return {
    inputMint,
    outputMint,
    inAmount,
    outAmount,
    otherAmountThreshold: rawAmount(quote.otherAmountThreshold) ?? outAmount,
    swapMode: str(quote.swapMode) ?? 'ExactIn',
    slippageBps: slippage != null ? Math.round(slippage) : 0,
    priceImpactPct: decimal(quote.priceImpactPct) ?? 0,
    route,
    contextSlot: decimal(quote.contextSlot),
    raw: quote,
  };
}

/** Shape a `POST /swap` answer. Null without a transaction. Exported for tests. */
export function parseJupiterSwap(body: unknown): JupiterSwapBuild | null {
  const swap = obj(body);
  const swapTransaction = str(swap.swapTransaction);
  const lastValidBlockHeight = decimal(swap.lastValidBlockHeight);
  if (!swapTransaction || lastValidBlockHeight == null) return null;
  const simulation = swap.simulationError == null ? null : obj(swap.simulationError);
  const simulationMessage = simulation ? (str(simulation.error) ?? str(simulation.errorCode)) : null;
  return {
    swapTransaction,
    lastValidBlockHeight: Math.round(lastValidBlockHeight),
    prioritizationFeeLamports: decimal(swap.prioritizationFeeLamports),
    dynamicSlippageBps: decimal(obj(swap.dynamicSlippageReport).slippageBps),
    simulationError: simulationMessage ? { code: str(obj(simulation).errorCode), message: simulationMessage } : null,
  };
}

/** The venue labels along the route, deduplicated and in order: "Raydium CLMM", or "Raydium CP, Meteora DLMM". */
export function routeLabel(quote: Pick<JupiterQuote, 'route'>): string {
  const labels = [...new Set(quote.route.map(step => step.label))];
  return labels.length > 0 ? labels.join(', ') : 'unknown route';
}

const base = (): string => config.api.jupiterSwapUrl.replace(/\/+$/, '');

/** Jupiter's own error line from an error body, when it sent one. */
async function apiError(response: Response, fallback: string): Promise<JupiterApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* not JSON */
  }
  const record = obj(body);
  return new JupiterApiError(str(record.error) ?? `${fallback} (${response.status})`, response.status, str(record.errorCode));
}

/** A fetch failure (offline, DNS, CORS) becomes a `JupiterApiError` with status 0, so the classifier sees one shape. */
async function request(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    throw new JupiterApiError(`Could not reach Jupiter: ${err instanceof Error ? err.message : String(err)}`, 0, 'NETWORK');
  }
}

export type JupiterSwapMode = 'ExactIn' | 'ExactOut';

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  /** Raw units of the input mint (ExactIn, the default), or of the output mint (ExactOut). */
  amount: bigint;
  slippageBps: number;
  /** ExactOut fixes the output and lets Jupiter say what goes in; `otherAmountThreshold` is then the most it may spend. */
  swapMode?: JupiterSwapMode;
}

/** A quote for an exact input (or, with `swapMode: 'ExactOut'`, an exact output). Throws `JupiterApiError` for a refusal ("No routes found") or an outage. */
export async function fetchJupiterQuote(params: QuoteParams, signal?: AbortSignal): Promise<JupiterQuote> {
  const search = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount.toString(),
    slippageBps: String(Math.max(0, Math.round(params.slippageBps))),
    swapMode: params.swapMode ?? 'ExactIn',
  });
  const response = await request(`${base()}/quote?${search.toString()}`, { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw await apiError(response, 'Jupiter could not quote');
  const quote = parseJupiterQuote(await response.json());
  if (!quote) throw new JupiterApiError('Jupiter sent a quote this build cannot read.', response.status, 'BAD_QUOTE');
  return quote;
}

export interface SwapBuildParams {
  quote: JupiterQuote;
  /** Base58 address of the trader, who pays and signs. */
  userPublicKey: string;
  /** Cap on the priority fee Jupiter may add, in lamports. */
  maxPriorityFeeLamports?: number;
}

/** Default cap on the priority fee: 0.001 SOL. */
export const DEFAULT_MAX_PRIORITY_FEE_LAMPORTS = 1_000_000;

/** Ask Jupiter to build the swap transaction for the quote. Unsigned; the wallet signs it. */
export async function fetchJupiterSwap(params: SwapBuildParams, signal?: AbortSignal): Promise<JupiterSwapBuild> {
  const body = {
    quoteResponse: params.quote.raw,
    userPublicKey: params.userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    dynamicSlippage: true,
    prioritizationFeeLamports: {
      priorityLevelWithMaxLamports: {
        maxLamports: params.maxPriorityFeeLamports ?? DEFAULT_MAX_PRIORITY_FEE_LAMPORTS,
        priorityLevel: 'high',
      },
    },
  };
  const response = await request(`${base()}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw await apiError(response, 'Jupiter could not build the swap');
  const built = parseJupiterSwap(await response.json());
  if (!built) throw new JupiterApiError('Jupiter sent a swap this build cannot read.', response.status, 'BAD_SWAP');
  return built;
}
