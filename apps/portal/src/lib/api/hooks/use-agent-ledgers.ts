/**
 * The Network token's burn ledger, as the tracker serves it.
 *
 * Modelled on Ember's `/api/solana/burnplan`. A 404 is the honest "not built
 * yet" state, distinct from an outage, so the panel can say so and switch
 * over the day the route ships without a portal change.
 *
 *   GET {tracker}/api/v1/agent-token/burnplan
 *     { mint, total, planTotal, burned, remaining, burns, next: { at, amount } | null,
 *       recent: [{ at, amount, sig }] }            amounts in whole $AGENT
 *
 * `total` is the whole supply the mint was created with; `planTotal` is what
 * the plan burns, and is the target the ring runs toward. Older trackers omit
 * `planTotal`, so it is null when absent, never read off `total`.
 *
 * `mint` names the mint the ledger is for. A build configured for another
 * mint must not lay this ledger over its own chain reads (`ledgerForMint`
 * turns that into an error state), or the ring shows one token's supply
 * against another token's burns.
 *
 * Accepts the tracker's `{ data: ... }` envelope or the bare object.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { trackerEndpoint } from '@/config';

export const BURN_PLAN_PATH = '/api/v1/agent-token/burnplan';

/** One executed burn: when, how much, and the transaction. */
export interface BurnEntry {
  /** ISO 8601. */
  at: string;
  /** Whole $AGENT. */
  amount: number;
  /** Transaction signature. */
  sig: string;
}

export interface BurnPlan {
  /** The mint the ledger is for, when the tracker names it; null from an older tracker. */
  mint: string | null;
  /** Whole $AGENT the mint was created with (the whole supply, not the plan). */
  total: number;
  /** Whole $AGENT the plan burns in total, when the tracker states it. */
  planTotal: number | null;
  /** Whole $AGENT burned so far. */
  burned: number;
  /** Whole $AGENT still to burn. */
  remaining: number;
  /** Burns executed so far. */
  burns: number;
  /** The next scheduled burn, or null when none is scheduled. */
  next: { at: string; amount: number } | null;
  /** The cadence behind `next`, or null without a configured interval. `startAt` is null when
   *  the first indexed burn anchors the schedule; `amount` is 0 when unknown. */
  schedule?: { intervalSeconds: number; startAt: string | null; amount: number } | null;
  /** The latest burns, newest first. */
  recent: BurnEntry[];
}

/** Thrown for anything but a clean answer or a 404. */
export class LedgerApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'LedgerApiError';
  }
}

const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

type Raw = Record<string, unknown>;

/** Unwrap the tracker's `{ data }` envelope when present. */
function payload(body: unknown): Raw | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Raw;
  if ('data' in obj && obj.data && typeof obj.data === 'object') return obj.data as Raw;
  return obj;
}

/** Shape a burn-plan answer, dropping anything malformed. Exported for tests. */
export function parseBurnPlan(body: unknown): BurnPlan {
  const raw = payload(body) ?? {};
  const next = raw.next && typeof raw.next === 'object' ? (raw.next as Raw) : null;
  const recent = (Array.isArray(raw.recent) ? (raw.recent as Raw[]) : [])
    .filter(entry => entry && typeof entry === 'object' && str(entry.sig))
    .map(entry => ({ at: str(entry.at), amount: num(entry.amount), sig: str(entry.sig) }));
  const planTotal = typeof raw.planTotal === 'number' && Number.isFinite(raw.planTotal) && raw.planTotal > 0 ? raw.planTotal : null;
  const sched = raw.schedule && typeof raw.schedule === 'object' ? (raw.schedule as Raw) : null;
  const schedule =
    sched && num(sched.intervalSeconds) > 0
      ? { intervalSeconds: num(sched.intervalSeconds), startAt: str(sched.startAt) || null, amount: num(sched.amount) }
      : null;
  return {
    mint: str(raw.mint) || null,
    total: num(raw.total),
    planTotal,
    burned: num(raw.burned),
    remaining: num(raw.remaining, Math.max(0, (planTotal ?? num(raw.total)) - num(raw.burned))),
    burns: num(raw.burns, recent.length),
    next: next && str(next.at) ? { at: str(next.at), amount: num(next.amount) } : null,
    schedule,
    recent,
  };
}

/**
 * GET one ledger. Resolves to null on a 404 (the endpoint is not built yet);
 * throws `LedgerApiError` for any other failure.
 */
async function getLedger<T>(path: string, parse: (body: unknown) => T, signal?: AbortSignal): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(trackerEndpoint(path), { headers: { Accept: 'application/json' }, signal });
  } catch (err) {
    /* A refused connection is the tracker being unreachable, said so; never a raw "Failed to fetch". */
    if (signal?.aborted) throw err;
    throw new LedgerApiError('the tracker could not be reached.', 0);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new LedgerApiError(`The ledger at ${path} returned ${response.status}.`, response.status);
  const body: unknown = await response.json().catch(() => null);
  if (body == null) throw new LedgerApiError(`The ledger at ${path} returned nothing.`, response.status);
  return parse(body);
}

/** The burn plan, or null when the tracker does not serve one yet. */
export const fetchBurnPlan = (signal?: AbortSignal) => getLedger(BURN_PLAN_PATH, parseBurnPlan, signal);

/**
 * What a ledger read is in, for the UI to switch on. `not-built` is the
 * tracker answering 404: the keeper has not shipped, which is a state to
 * show, not an error to retry.
 */
export type LedgerState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not-built' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; data: T };

const burnPlanKey = ['agent-token', 'burnplan'] as const;

/** How often a served ledger is re-read while a page is open. */
const LEDGER_POLL_MS = 60_000;

/** Retry an outage twice; never a 4xx, which is an answer. */
const ledgerRetry = (count: number, error: unknown): boolean => !(error instanceof LedgerApiError && error.status < 500) && count < 2;
const ledgerRetryDelay = (attempt: number): number => Math.min(500 * 2 ** attempt, 4_000);

function toState<T>(
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    data: T | null | undefined;
    fetchStatus: string;
    status: string;
  },
  enabled: boolean,
): LedgerState<T> {
  if (!enabled) return { status: 'idle' };
  if (query.isLoading) return { status: 'loading' };
  if (query.isError) return { status: 'error', error: query.error instanceof Error ? query.error : new Error(String(query.error)) };
  if (query.data === null) return { status: 'not-built' };
  if (query.data === undefined) return { status: 'loading' };
  return { status: 'ready', data: query.data };
}

/** Thrown (as a ledger error state) when the tracker's ledger is for another mint than this build reads. */
export class LedgerMintMismatchError extends Error {
  constructor(
    public readonly ledgerMint: string,
    public readonly mint: string,
  ) {
    super(
      `The tracker's burn ledger is for ${ledgerMint}, not the ${mint} this site reads. Set NEXT_PUBLIC_AGENT_MINT and the tracker's AGENT_TOKEN_MINT to the same mint.`,
    );
    this.name = 'LedgerMintMismatchError';
  }
}

/**
 * A served plan only counts for the mint this build reads: a ledger the
 * tracker names for another mint becomes an error state, so its burns are
 * never laid over this mint's supply. A plan without a mint (older tracker)
 * passes as is. Pure; exported for tests.
 */
export function ledgerForMint(state: LedgerState<BurnPlan>, mint: string | null | undefined): LedgerState<BurnPlan> {
  if (state.status !== 'ready' || !mint || !state.data.mint || state.data.mint === mint) return state;
  return { status: 'error', error: new LedgerMintMismatchError(state.data.mint, mint) };
}

/** The burn plan as UI state. A 404 becomes `not-built` and is not retried as an error. */
export function useBurnPlan(enabled = true): LedgerState<BurnPlan> {
  const query = useQuery({
    queryKey: burnPlanKey,
    queryFn: ({ signal }) => fetchBurnPlan(signal),
    enabled,
    staleTime: LEDGER_POLL_MS,
    retry: ledgerRetry,
    retryDelay: ledgerRetryDelay,
    refetchInterval: query => (query.state.data ? LEDGER_POLL_MS : false),
    refetchOnWindowFocus: false,
  });
  return toState(query, enabled);
}
