/**
 * Story: Home two-step flow — keep the peer's token identity on the tracker
 * Purpose: POST the launched token to `/api/v1/portal/token` through the daemon
 *          proxy (the daemon adds the peer's X-API-Key). Non-blocking: a failure
 *          never breaks the flow, the per-wallet launch record already has the data.
 *          Replaces the old `src/lib/token-launch/persist-token.ts`.
 */

import { daemonFetch } from '@/lib/api/daemon-fetch';
import { ApiRequestError } from '@/lib/api/errors';

export interface PersistableToken {
  name: string;
  ticker: string;
  contractAddr: string;
  imageUrl?: string;
}

/** Tell the daemon (and through it the tracker) which token this peer runs. Idempotent. */
export async function persistLaunchedToken(token: PersistableToken): Promise<void> {
  try {
    await daemonFetch<unknown>('/token', {
      method: 'POST',
      body: JSON.stringify({
        token_contract_address: token.contractAddr,
        token_ticker: token.ticker,
        token_name: token.name,
        token_image_url: token.imageUrl ?? '',
      }),
    });
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === 'ALREADY_EXISTS') return;
    throw err;
  }
}
