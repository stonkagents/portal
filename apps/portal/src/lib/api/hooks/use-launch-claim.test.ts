/**
 * Purpose: Tests for claimLaunch / useLaunchClaim — the POST that binds a launch
 *          to the running agent and collects the launch reward.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://localhost:7841' },
}));

import { claimLaunch, useLaunchClaim, LAUNCH_CLAIM_PATH } from './use-launch-claim';
import { ApiRequestError } from '@/lib/api/errors';

const MINT = 'MinT1111111111111111111111111111111111111111';

/** The daemon proxy returns the tracker's `{ data }` envelope as-is. */
function envelope(data: unknown, status = 200) {
  return jsonResponse({ data }, status);
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch as unknown as typeof fetch;
});

describe('claimLaunch', () => {
  it('posts the mint through the daemon portal proxy', async () => {
    mockFetch.mockResolvedValue(envelope({ launch: { mint: MINT }, credits_granted: 250, already_bound: false }));

    await claimLaunch(MINT);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/^http:\/\/localhost:7841\/.*\/portal\/launch\/claim$/);
    expect(url.endsWith(`/portal${LAUNCH_CLAIM_PATH}`)).toBe(true);
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ mint: MINT }) });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('reads credits_granted and the launch from the tracker envelope', async () => {
    mockFetch.mockResolvedValue(
      envelope({
        launch: { mint: MINT, name: 'Agent One', symbol: 'AGENT', image_url: 'https://img/1.png', quote_symbol: 'STONK' },
        credits_granted: 250,
        already_bound: false,
      }),
    );

    const result = await claimLaunch(MINT);

    expect(result.creditsGranted).toBe(250);
    expect(result.alreadyBound).toBe(false);
    expect(result.launch).toEqual({
      mint: MINT,
      name: 'Agent One',
      symbol: 'AGENT',
      imageUrl: 'https://img/1.png',
      quoteSymbol: 'STONK',
    });
  });

  it('accepts camelCase fields too', async () => {
    mockFetch.mockResolvedValue(
      envelope({ launch: { mint: MINT, symbol: 'AGENT' }, creditsGranted: 100, alreadyBound: true }),
    );

    const result = await claimLaunch(MINT);

    expect(result.creditsGranted).toBe(100);
    expect(result.alreadyBound).toBe(true);
    expect(result.launch?.mint).toBe(MINT);
  });

  it('reports an already-bound launch with no new credits', async () => {
    mockFetch.mockResolvedValue(envelope({ launch: { mint: MINT }, already_bound: true }));

    const result = await claimLaunch(MINT);

    expect(result.alreadyBound).toBe(true);
    expect(result.creditsGranted).toBe(0);
  });

  it('throws an ApiRequestError carrying the tracker error code', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: { code: 'ALREADY_BOUND', message: 'bound to another peer' } }, 409));

    await expect(claimLaunch(MINT)).rejects.toMatchObject({ code: 'ALREADY_BOUND', status: 409 });
    await expect(claimLaunch(MINT)).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('throws PARSE_ERROR on a non-JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(claimLaunch(MINT)).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  });

  it('throws PARSE_ERROR when the envelope is missing', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ launch: { mint: MINT }, credits_granted: 250 }));

    await expect(claimLaunch(MINT)).rejects.toMatchObject({ code: 'PARSE_ERROR' });
  });
});

describe('useLaunchClaim', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useLaunchClaim());
    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
  });

  it('moves to claimed and exposes the granted credits', async () => {
    mockFetch.mockResolvedValue(envelope({ launch: { mint: MINT }, credits_granted: 250 }));
    const { result } = renderHook(() => useLaunchClaim());

    await act(async () => {
      await result.current.claim(MINT);
    });

    expect(result.current.status).toBe('claimed');
    expect(result.current.result?.creditsGranted).toBe(250);
  });

  it('claims a given mint only once', async () => {
    mockFetch.mockResolvedValue(envelope({ launch: { mint: MINT }, credits_granted: 250 }));
    const { result } = renderHook(() => useLaunchClaim());

    await act(async () => {
      await result.current.claim(MINT);
      await result.current.claim(MINT);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('records the error and allows a retry after a failure', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAVAILABLE', message: 'tracker down' } }, 503));
    const { result } = renderHook(() => useLaunchClaim());

    await act(async () => {
      await result.current.claim(MINT);
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('tracker down');

    mockFetch.mockResolvedValueOnce(envelope({ launch: { mint: MINT }, credits_granted: 250 }));
    await act(async () => {
      await result.current.claim(MINT);
    });
    expect(result.current.status).toBe('claimed');
  });

  it('ignores an empty mint', async () => {
    const { result } = renderHook(() => useLaunchClaim());

    await act(async () => {
      await result.current.claim('');
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});

describe('useLaunchClaim retries the wallet-link race', () => {
  it('keeps trying on WALLET_NOT_LINKED and ends claimed once the daemon has linked (or bound on its own)', async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ error: { code: 'WALLET_NOT_LINKED', message: 'no wallet linked to this peer' } }, 409))
        .mockResolvedValueOnce(jsonResponse({ error: { code: 'WALLET_NOT_LINKED', message: 'no wallet linked to this peer' } }, 409))
        .mockResolvedValueOnce(envelope({ launch: { mint: MINT }, credits_granted: 0, already_bound: true }));
      const { result } = renderHook(() => useLaunchClaim());
      let pending: Promise<unknown>;
      await act(async () => {
        pending = result.current.claim(MINT);
        await Promise.resolve();
      });
      expect(result.current.status).toBe('claiming');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
        await pending;
      });
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.current.status).toBe('claimed');
      expect(result.current.error).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up on a different error at once', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: { code: 'WALLET_MISMATCH', message: 'another wallet launched this token' } }, 409));
    const { result } = renderHook(() => useLaunchClaim());
    await act(async () => {
      await result.current.claim(MINT);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('another wallet');
  });
});
