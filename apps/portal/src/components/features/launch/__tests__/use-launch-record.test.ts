import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LaunchesModule from '@/lib/api/launches';
import { LaunchApiError, type RecordLaunchPayload } from '@/lib/api/launches';
import { STONK_QUOTE } from '@/lib/launchlab/__fixtures__/launch-config';
import type { LaunchResult } from '../types';

const recordLaunch = vi.fn();
const getLaunch = vi.fn();
vi.mock('@/lib/api/launches', async () => {
  const actual = await vi.importActual<typeof LaunchesModule>('@/lib/api/launches');
  return {
    LaunchApiError: actual.LaunchApiError,
    recordLaunch: (...args: unknown[]) => recordLaunch(...args),
    getLaunch: (...args: unknown[]) => getLaunch(...args),
  };
});

import { useLaunchRecord } from '../use-launch-record';

const BODY: RecordLaunchPayload = {
  mint: 'MintAAA',
  poolId: 'PoolAAA',
  creatorWallet: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  quoteMint: STONK_QUOTE.quoteMint,
  name: 'Signal Hound',
  symbol: 'HOUND',
  imageUrl: 'https://gateway.example/ipfs/img',
  metadataUri: 'https://gateway.example/ipfs/meta',
  launchSignature: 'sig123',
  feeLamports: 4901732,
  transferFeeBps: 100,
};

const RESULT: LaunchResult = {
  mint: 'MintAAA',
  poolId: 'PoolAAA',
  txSignature: 'sig123',
  name: 'Signal Hound',
  symbol: 'HOUND',
  imageUrl: BODY.imageUrl,
  imageThumbUrl: null,
  metadataUri: BODY.metadataUri,
  quote: STONK_QUOTE,
  quoteSymbol: 'STONK',
  holderTaxBps: 100,
  devBuy: 0,
  feeLamports: 4901732,
  programId: 'Prog',
  recorded: false,
  recordError: { kind: 'error', code: 'TX_NOT_FOUND', message: 'tx not found yet', transient: false, retryable: true, attempts: 1 },
  mock: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  getLaunch.mockRejectedValue(new Error('not mocked'));
});

describe('useLaunchRecord', () => {
  it('records once and reports success', async () => {
    recordLaunch.mockResolvedValueOnce({ mint: 'MintAAA' });
    const { result } = renderHook(() => useLaunchRecord());
    let outcome;
    await act(async () => {
      outcome = await result.current.record(BODY);
    });
    expect(recordLaunch).toHaveBeenCalledWith(BODY);
    expect(outcome).toEqual({ recorded: true, recordError: null });
  });

  it('classifies a refusal instead of throwing, as attempt 1', async () => {
    recordLaunch.mockRejectedValueOnce(new LaunchApiError('tx not found yet', 422, 'TX_NOT_FOUND'));
    const { result } = renderHook(() => useLaunchRecord());
    let outcome;
    await act(async () => {
      outcome = await result.current.record(BODY);
    });
    expect(outcome).toEqual({
      recorded: false,
      recordError: {
        kind: 'error',
        code: 'TX_NOT_FOUND',
        message: 'tx not found yet',
        transient: false,
        retryable: true,
        attempts: 1,
      },
    });
  });

  it('retries with the identical body, counts the attempt, and flags the retry while it runs', async () => {
    recordLaunch.mockRejectedValueOnce(new LaunchApiError('tx not found yet', 422, 'TX_NOT_FOUND'));
    const { result } = renderHook(() => useLaunchRecord());
    await act(async () => {
      await result.current.record(BODY);
    });

    let release: () => void = () => undefined;
    recordLaunch.mockImplementationOnce(() => new Promise<void>(resolve => (release = resolve)));
    let pending: Promise<LaunchResult | null> = Promise.resolve(null);
    await act(async () => {
      pending = result.current.retry(RESULT);
      await Promise.resolve();
    });
    expect(result.current.retrying).toBe(true);

    let next = null as LaunchResult | null;
    await act(async () => {
      release();
      next = await pending;
    });
    expect(result.current.retrying).toBe(false);
    expect(recordLaunch).toHaveBeenCalledTimes(2);
    expect(recordLaunch.mock.calls[1][0]).toEqual(BODY);
    expect(next).toEqual({ ...RESULT, recorded: true, recordError: null });
  });

  it('returns the failure with the attempt count when the retry fails again', async () => {
    recordLaunch.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useLaunchRecord());
    await act(async () => {
      await result.current.record(BODY);
    });
    let next = null as LaunchResult | null;
    await act(async () => {
      next = await result.current.retry(RESULT);
    });
    expect(next?.recordError).toEqual({
      kind: 'error',
      code: null,
      message: 'Failed to fetch',
      transient: true,
      retryable: true,
      attempts: 2,
    });
    expect(next?.recorded).toBe(false);
  });

  it('has nothing to retry once recorded, or after a reset', async () => {
    recordLaunch.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useLaunchRecord());
    await act(async () => {
      await result.current.record(BODY);
    });
    await expect(result.current.retry({ ...RESULT, recorded: true, recordError: null })).resolves.toBeNull();

    act(() => result.current.reset());
    await expect(result.current.retry(RESULT)).resolves.toBeNull();
    expect(recordLaunch).toHaveBeenCalledTimes(1);
  });
});
