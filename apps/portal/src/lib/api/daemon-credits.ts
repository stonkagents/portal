/**
 * Purpose: API client for credits, social, purchase, and recovery.
 *          Routes go through daemon directly (no /portal prefix):
 *          daemon /api/v1 + path → daemon → tracker /api/v1/tracker/* with X-API-Key.
 *          NEXT_PUBLIC_DAEMON_URL is set with and without the /api/v1 suffix across
 *          env files, so the base comes from DAEMON_API_V1 which normalises both.
 *          Separate from daemon-fetch.ts (portal proxy) — domain boundary maps
 *          to daemon route groups: community vs financial (server.go:299-304).
 */

import { DAEMON_API_V1, withLoopbackTarget } from '@/lib/api/daemon';
import { ApiRequestError } from '@/lib/api/errors';

// ─── Core fetch ────────────────────────────

async function creditsFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${DAEMON_API_V1}${path}`;
  const res = await fetch(url, {
    ...withLoopbackTarget(url, options),
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiRequestError(res.status, {
      code: 'PARSE_ERROR',
      message: `Server returned non-JSON response (status ${res.status})`,
    });
  }

  if (!res.ok) {
    const body = json as { error?: { code?: string; message?: string; details?: unknown } };
    throw new ApiRequestError(res.status, {
      code: body.error?.code ?? 'UNKNOWN',
      message: body.error?.message ?? `Request failed: ${res.status}`,
      details: body.error?.details,
    });
  }

  return (json as { data: T }).data;
}

// ─── Response types (match backend DTOs) ─────────────────────────

export interface BalanceResponse {
  free_balance: number;
  paid_balance: number;
  total: number;
  free_expires_at?: string;
  lifetime_purchased: number;
  lifetime_social_granted: number;
  /** Detailed-mode (gpt-5.4) trial calls remaining for new free-tier users. */
  detailed_trial_remaining: number;
  detailed_trial_expires_at?: string;
}

export interface SpendTokenResponse {
  token: string;
  expires_at: string;
}

export interface TransactionResponse {
  id: string;
  amount: number;
  balance_type: string;
  reason: string;
  created_at: string;
}

export interface SocialConnectionResponse {
  connections: {
    platform: string;
    platform_user_id: string;
    verified_at: string;
    bonus_granted: number;
  }[];
}

export interface PurchaseIntentResponse {
  intent_id: string;
  treasury_address: string;
  amount_lamports: number;
  credit_amount: number;
  memo: string;
  expires_at: string;
}

export interface PurchaseVerifyResponse {
  credits_granted: number;
  new_balance: { free: number; paid: number };
}

export interface RecoverResponse {
  recovered: boolean;
  paid_credits_transferred: number;
}

// ─── API namespaces ──────────────────────────────────────────────

export const creditApi = {
  getBalance: () => creditsFetch<BalanceResponse>('/credits/balance'),

  getTransactions: (limit = 20, offset = 0) =>
    creditsFetch<TransactionResponse[]>(
      `/credits/transactions?limit=${limit}&offset=${offset}`,
    ),

  issueSpendToken: (amount: number, purpose: string) =>
    creditsFetch<SpendTokenResponse>('/credits/spend-token', {
      method: 'POST',
      body: JSON.stringify({ amount, purpose }),
    }),
};

export const socialApi = {
  getConnections: () =>
    creditsFetch<SocialConnectionResponse>('/social/connections'),

  disconnect: (platform: string) =>
    creditsFetch<{ status: string }>(`/social/${encodeURIComponent(platform)}`, {
      method: 'DELETE',
    }),
};

export const purchaseApi = {
  createIntent: (amountLamports: number) =>
    creditsFetch<PurchaseIntentResponse>('/purchase/intent', {
      method: 'POST',
      body: JSON.stringify({ amount_lamports: amountLamports }),
    }),

  verify: (intentId: string, txSignature: string) =>
    creditsFetch<PurchaseVerifyResponse>('/purchase/verify', {
      method: 'POST',
      body: JSON.stringify({ intent_id: intentId, tx_signature: txSignature }),
    }),
};

export const accountApi = {
  recover: (oldPeerID: string, socialVerifications: string[]) =>
    creditsFetch<RecoverResponse>('/account/recover', {
      method: 'POST',
      body: JSON.stringify({
        old_peer_id: oldPeerID,
        social_verifications: socialVerifications,
      }),
    }),
};
