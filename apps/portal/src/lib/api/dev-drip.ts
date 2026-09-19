/**
 * Purpose: Ask the tracker for test SOL and test $STONK (dev deployment, devnet only).
 *
 * Contract (tracker, routes_dev_drip.go):
 *   POST {NEXT_PUBLIC_TRACKER_URL}/api/dev/drip
 *   body { wallet }
 *   200 → { signature, sol, stonk, explorer, sentSol, sentStonk }
 *         signature is '' and both flags false when the wallet already held enough of both.
 *   429 → { error: { code: 'ALREADY_DRIPPED' | 'IP_LIMITED', message }, nextAt }
 *   503 → { error: { code: 'drip_empty', message } }     the drip wallet needs a refill
 *   502 → { error: { code: 'CHAIN_ERROR', message } }    devnet RPC trouble, try later
 *   4xx → { error: { code: 'VALIDATION_ERROR' | ..., message } }
 *   404 → the route is not registered: the tracker has no DEV_DRIP_SECRET_KEY. The
 *         launch config says so up front (`devDripEnabled: false`), so a caller that
 *         reads it never gets here; one that does must stay quiet (status 404).
 *
 * Never fakes success: a 200 whose body is not the drip shape is the edge answering
 * for the tracker, and nothing was sent.
 */

import { trackerEndpoint } from '@/config';
import { trackerErrorMessage } from './feedback';

export const DEV_DRIP_PATH = '/api/dev/drip';

export interface DevDripResult {
  /** Transaction id; empty when nothing needed sending. */
  signature: string;
  /** Amounts actually sent, whole units (0 when that leg was skipped). */
  sol: number;
  stonk: number;
  /** Explorer link for the transaction; empty when nothing was sent. */
  explorer: string;
  sentSol: boolean;
  sentStonk: boolean;
}

export type DevDripErrorCode =
  | 'ALREADY_DRIPPED'
  | 'IP_LIMITED'
  | 'drip_empty'
  | 'CHAIN_ERROR'
  | 'VALIDATION_ERROR'
  | 'NETWORK'
  | 'UNKNOWN';

export class DevDripError extends Error {
  readonly code: DevDripErrorCode;
  readonly status: number | null;
  /** RFC 3339 instant the wallet or address may try again (429 only). */
  readonly nextAt: string | null;
  constructor(message: string, code: DevDripErrorCode, status: number | null = null, nextAt: string | null = null) {
    super(message);
    this.name = 'DevDripError';
    this.code = code;
    this.status = status;
    this.nextAt = nextAt;
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set(['ALREADY_DRIPPED', 'IP_LIMITED', 'drip_empty', 'CHAIN_ERROR', 'VALIDATION_ERROR']);

function errorCode(body: unknown): DevDripErrorCode {
  const err = (body as { error?: { code?: unknown } } | null)?.error;
  const code = err?.code;
  return typeof code === 'string' && KNOWN_CODES.has(code) ? (code as DevDripErrorCode) : 'UNKNOWN';
}

function isDripResult(body: unknown): body is DevDripResult {
  const b = body as Partial<DevDripResult> | null;
  return (
    !!b &&
    typeof b.signature === 'string' &&
    typeof b.sol === 'number' &&
    typeof b.stonk === 'number' &&
    typeof b.explorer === 'string' &&
    typeof b.sentSol === 'boolean' &&
    typeof b.sentStonk === 'boolean'
  );
}

/**
 * @throws {DevDripError} when the tracker refused (see `code`), was unreachable, or
 *   answered with anything other than the drip shape.
 */
export async function requestDevDrip(wallet: string): Promise<DevDripResult> {
  let res: Response;
  try {
    res = await fetch(trackerEndpoint(DEV_DRIP_PATH), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ wallet }),
    });
  } catch {
    throw new DevDripError('The Network did not answer. Check your connection and try again.', 'NETWORK');
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const nextAt = (body as { nextAt?: unknown } | null)?.nextAt;
    throw new DevDripError(
      trackerErrorMessage(body, res.status),
      errorCode(body),
      res.status,
      typeof nextAt === 'string' ? nextAt : null,
    );
  }
  if (!isDripResult(body)) {
    throw new DevDripError('The drip never reached the Network.', 'UNKNOWN', res.status);
  }
  return body;
}
