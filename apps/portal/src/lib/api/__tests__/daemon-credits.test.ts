/**
 * Purpose: Tests for daemon-credits.ts — creditsFetch core + all 4 API namespaces
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiRequestError } from '../errors';

vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://localhost:7841' },
}));

import { creditApi, socialApi, purchaseApi, accountApi } from '../daemon-credits';

// ─── Response helpers ────────────────────────────────────────────

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve({ data }) } as Response;
}

function errorResponse(status: number, body: unknown) {
  return { ok: false, status, json: () => Promise.resolve(body) } as Response;
}

function nonJsonResponse(status: number) {
  return { ok: false, status, json: () => Promise.reject(new Error('not JSON')) } as Response;
}

// ─── creditsFetch core behaviour ─────────────────────────────────

describe('creditsFetch (via creditApi)', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  it('prepends daemonUrl directly (no /portal prefix)', async () => {
    mockFetch.mockResolvedValue(okResponse({ free_balance: 50, paid_balance: 0, total: 50 }));
    await creditApi.getBalance();
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:7841/api/v1/credits/balance');
  });

  it('does not double the /api/v1 suffix when NEXT_PUBLIC_DAEMON_URL already carries it (stg)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/config/app.config', () => ({
      appConfig: { daemonUrl: 'http://localhost:7841/api/v1' },
    }));
    const { creditApi: suffixed } = await import('../daemon-credits');
    mockFetch.mockResolvedValue(okResponse({ free_balance: 50, paid_balance: 0, total: 50 }));
    await suffixed.getBalance();
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:7841/api/v1/credits/balance');
    vi.doUnmock('@/lib/config/app.config');
    vi.resetModules();
  });

  it('unwraps { data: T } envelope on success', async () => {
    const balance = { free_balance: 50, paid_balance: 0, total: 50, lifetime_purchased: 0, lifetime_social_granted: 0 };
    mockFetch.mockResolvedValue(okResponse(balance));
    const result = await creditApi.getBalance();
    expect(result).toEqual(balance);
  });

  it('throws ApiRequestError on non-2xx with error envelope', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(402, {
        error: { code: 'INSUFFICIENT_CREDITS', message: 'Not enough credits' },
      }),
    );
    const err = (await creditApi.getBalance().catch((e: unknown) => e)) as ApiRequestError;
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(402);
    expect(err.code).toBe('INSUFFICIENT_CREDITS');
    expect(err.message).toBe('Not enough credits');
  });

  it('throws ApiRequestError with UNKNOWN code when error envelope is missing', async () => {
    mockFetch.mockResolvedValue(errorResponse(500, { message: 'bad' }));
    const err = (await creditApi.getBalance().catch((e: unknown) => e)) as ApiRequestError;
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.code).toBe('UNKNOWN');
    expect(err.status).toBe(500);
  });

  it('throws ApiRequestError with PARSE_ERROR on non-JSON response', async () => {
    mockFetch.mockResolvedValue(nonJsonResponse(502));
    const err = (await creditApi.getBalance().catch((e: unknown) => e)) as ApiRequestError;
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('PARSE_ERROR');
  });

  it('preserves error details when present', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(400, {
        error: { code: 'VALIDATION_ERROR', message: 'Bad input', details: { field: 'amount' } },
      }),
    );
    const err = (await creditApi.getBalance().catch((e: unknown) => e)) as ApiRequestError;
    expect(err.details).toEqual({ field: 'amount' });
  });

  it('sets Content-Type: application/json when body is present', async () => {
    mockFetch.mockResolvedValue(okResponse({ token: 'abc', expires_at: '2026-01-01' }));
    await creditApi.issueSpendToken(5, 'chat');
    const { headers } = mockFetch.mock.calls[0][1];
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('does NOT set Content-Type when body is absent (GET)', async () => {
    mockFetch.mockResolvedValue(okResponse({ free_balance: 50 }));
    await creditApi.getBalance();
    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs?.headers).not.toHaveProperty('Content-Type');
  });

  it('does NOT set Content-Type when body is absent (DELETE)', async () => {
    mockFetch.mockResolvedValue(okResponse({ status: 'ok' }));
    await socialApi.disconnect('twitter');
    const { headers } = mockFetch.mock.calls[0][1];
    expect(headers).not.toHaveProperty('Content-Type');
  });
});

// ─── creditApi namespace ─────────────────────────────────────────

describe('creditApi', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  it('getBalance calls /credits/balance', async () => {
    mockFetch.mockResolvedValue(okResponse({}));
    await creditApi.getBalance();
    expect(mockFetch.mock.calls[0][0]).toContain('/credits/balance');
  });

  it('getTransactions passes limit and offset as query params', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await creditApi.getTransactions(10, 5);
    expect(mockFetch.mock.calls[0][0]).toContain('/credits/transactions?limit=10&offset=5');
  });

  it('getTransactions uses default limit=20 offset=0', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    await creditApi.getTransactions();
    expect(mockFetch.mock.calls[0][0]).toContain('/credits/transactions?limit=20&offset=0');
  });

  it('issueSpendToken sends POST with amount and purpose', async () => {
    mockFetch.mockResolvedValue(okResponse({ token: 'jwt', expires_at: '2026-01-01' }));
    await creditApi.issueSpendToken(5, 'chat');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/credits/spend-token');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ amount: 5, purpose: 'chat' });
  });
});

// ─── socialApi namespace ─────────────────────────────────────────

describe('socialApi', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  it('getConnections calls /social/connections', async () => {
    mockFetch.mockResolvedValue(okResponse({ connections: [] }));
    await socialApi.getConnections();
    expect(mockFetch.mock.calls[0][0]).toContain('/social/connections');
  });

  it('disconnect sends DELETE with URL-encoded platform', async () => {
    mockFetch.mockResolvedValue(okResponse({ status: 'ok' }));
    await socialApi.disconnect('twitter/x');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/social/twitter%2Fx');
    expect(opts.method).toBe('DELETE');
  });

  it('disconnect encodes special characters in platform name', async () => {
    mockFetch.mockResolvedValue(okResponse({ status: 'ok' }));
    await socialApi.disconnect('platform with spaces');
    expect(mockFetch.mock.calls[0][0]).toContain('/social/platform%20with%20spaces');
  });
});

// ─── purchaseApi namespace ───────────────────────────────────────

describe('purchaseApi', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  it('createIntent sends POST with amount_lamports', async () => {
    mockFetch.mockResolvedValue(
      okResponse({
        intent_id: 'int_1',
        treasury_address: 'abc',
        amount_lamports: 1000000,
        credit_amount: 100,
        memo: 'stonkagents:int_1',
        expires_at: '2026-01-01',
      }),
    );
    await purchaseApi.createIntent(1000000);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/purchase/intent');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ amount_lamports: 1000000 });
  });

  it('verify sends POST with intent_id and tx_signature', async () => {
    mockFetch.mockResolvedValue(
      okResponse({ credits_granted: 100, new_balance: { free: 50, paid: 100 } }),
    );
    await purchaseApi.verify('int_1', 'sig_abc');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/purchase/verify');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ intent_id: 'int_1', tx_signature: 'sig_abc' });
  });
});

// ─── accountApi namespace ────────────────────────────────────────

describe('accountApi', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  it('recover sends POST with old_peer_id and social_verifications', async () => {
    mockFetch.mockResolvedValue(
      okResponse({ recovered: true, paid_credits_transferred: 500 }),
    );
    await accountApi.recover('peer_old', ['twitter_proof', 'github_proof']);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/account/recover');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({
      old_peer_id: 'peer_old',
      social_verifications: ['twitter_proof', 'github_proof'],
    });
  });
});
