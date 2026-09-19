/**
 * Story: Home two-step flow — bind the launch to the agent that just came online
 * Purpose: POST /api/launch/claim { mint } through the daemon portal proxy, which
 *          injects the peer's X-API-Key (never held in the browser). The tracker
 *          binds the launch to the calling peer and grants the launch reward.
 *
 * Goes through `daemonFetch` like every other portal mutation (`/token`, board
 * posts), so the proxy path lives in one place. The tracker answers
 * `{ data: { launch, credits_granted, already_bound } }`; field reading stays
 * tolerant to snake/camel case.
 */
'use client';

import { useCallback, useRef, useState } from 'react';
import { daemonFetch } from '@/lib/api/daemon-fetch';
import { ApiRequestError } from '@/lib/api/errors';

/** Relative to the daemon portal proxy root (`daemonFetch` prepends it). */
export const LAUNCH_CLAIM_PATH = '/launch/claim';

export interface ClaimedLaunch {
  mint: string;
  name: string;
  symbol: string;
  imageUrl: string;
  quoteSymbol: string | null;
}

export interface LaunchClaimResult {
  launch: ClaimedLaunch | null;
  /** AI credits the tracker granted for this launch. 0 when it was already bound. */
  creditsGranted: number;
  alreadyBound: boolean;
}

function str(source: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function num(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function toClaimedLaunch(row: unknown): ClaimedLaunch | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const mint = str(r, 'mint', 'token_mint', 'tokenMint', 'mintAddress');
  if (!mint) return null;
  return {
    mint,
    name: str(r, 'name', 'token_name', 'tokenName') ?? '',
    symbol: str(r, 'symbol', 'token_symbol', 'tokenSymbol', 'ticker') ?? '',
    imageUrl: str(r, 'image_url', 'imageUrl', 'token_image_url') ?? '',
    quoteSymbol: str(r, 'quote_symbol', 'quoteSymbol'),
  };
}

/**
 * Bind `mint` to the calling peer and collect the launch reward.
 *
 * @throws {ApiRequestError} with the tracker's code: `NOT_FOUND`, `ALREADY_BOUND`
 *   (another peer owns it), `WALLET_NOT_LINKED`, `WALLET_MISMATCH`.
 */
export async function claimLaunch(mint: string): Promise<LaunchClaimResult> {
  const data = await daemonFetch<unknown>(LAUNCH_CLAIM_PATH, {
    method: 'POST',
    body: JSON.stringify({ mint }),
  });

  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    launch: toClaimedLaunch(payload.launch ?? payload),
    creditsGranted: num(payload, 'credits_granted', 'creditsGranted'),
    alreadyBound: payload.already_bound === true || payload.alreadyBound === true,
  };
}

export type LaunchClaimStatus = 'idle' | 'claiming' | 'claimed' | 'error';

export interface UseLaunchClaimState {
  status: LaunchClaimStatus;
  result: LaunchClaimResult | null;
  error: string | null;
}

const INITIAL: UseLaunchClaimState = { status: 'idle', result: null, error: null };

/**
 * One-shot claim per mint. Repeat calls for a mint already in flight or already
 * claimed are ignored, so a re-render storm cannot double-post.
 */
/** The daemon links the wallet right after it comes up; a claim can land before that. */
export const WALLET_NOT_LINKED_CODE = 'WALLET_NOT_LINKED';
/** Retry cadence for that race: every 5 s for two minutes. Exported for tests. */
export const CLAIM_RETRY_DELAY_MS = 5_000;
export const CLAIM_RETRY_LIMIT = 24;

/** True for the transient "no wallet linked to this peer" answer. Exported for tests. */
export function isWalletNotLinked(err: unknown): boolean {
  if (err instanceof ApiRequestError && err.code === WALLET_NOT_LINKED_CODE) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return msg.includes('no wallet linked');
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function useLaunchClaim() {
  const [state, setState] = useState<UseLaunchClaimState>(INITIAL);
  const attempted = useRef<Set<string>>(new Set());

  const claim = useCallback(async (mint: string): Promise<LaunchClaimResult | null> => {
    if (!mint || attempted.current.has(mint)) return null;
    attempted.current.add(mint);
    setState({ status: 'claiming', result: null, error: null });

    try {
      let result: LaunchClaimResult | null = null;
      for (let attempt = 0; ; attempt++) {
        try {
          result = await claimLaunch(mint);
          break;
        } catch (err) {
          // The wallet link is seconds behind the daemon coming up; keep trying quietly
          // until it lands (the daemon may bind on its own meanwhile, which then answers
          // as already bound to this peer, a success).
          if (!isWalletNotLinked(err) || attempt >= CLAIM_RETRY_LIMIT) throw err;
          await wait(CLAIM_RETRY_DELAY_MS);
        }
      }
      setState({ status: 'claimed', result, error: null });
      return result;
    } catch (err) {
      /* Allow a retry after a failure — the launch is on chain either way. */
      attempted.current.delete(mint);
      const message = err instanceof Error ? err.message : 'Could not claim the launch';
      setState({ status: 'error', result: null, error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    attempted.current.clear();
    setState(INITIAL);
  }, []);

  return { ...state, claim, reset };
}
