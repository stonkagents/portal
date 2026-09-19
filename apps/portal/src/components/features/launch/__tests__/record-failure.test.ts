import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LaunchesModule from '@/lib/api/launches';
import { LaunchApiError } from '@/lib/api/launches';

const fetchLaunchesByWallet = vi.fn();
const getLaunch = vi.fn();
vi.mock('@/lib/api/launches', async () => {
  const actual = await vi.importActual<typeof LaunchesModule>('@/lib/api/launches');
  return {
    LaunchApiError: actual.LaunchApiError,
    fetchLaunchesByWallet: (...args: unknown[]) => fetchLaunchesByWallet(...args),
    getLaunch: (...args: unknown[]) => getLaunch(...args),
  };
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyRecordFailure, findExistingLaunch } from '../record-failure';

/** The tracker's own answers, copied by `npm run contracts:sync`. */
const FIXTURES_DIR = join(__dirname, '..', '..', '..', '..', 'lib', 'api', '__fixtures__', 'tracker');

const WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('findExistingLaunch', () => {
  it("returns the wallet's newest launch, claimed or not", async () => {
    fetchLaunchesByWallet.mockResolvedValueOnce([
      { mint: 'MintOLD', name: 'First Agent', symbol: 'FIRST', peer_id: 'peer-1', agentBound: true },
      { mint: 'MintOLDER', name: 'Older', symbol: 'OLD' },
    ]);
    await expect(findExistingLaunch(WALLET)).resolves.toEqual({ mint: 'MintOLD', name: 'First Agent', symbol: 'FIRST' });
    expect(fetchLaunchesByWallet).toHaveBeenCalledWith(WALLET);
  });

  it('is null for a wallet with no launch', async () => {
    fetchLaunchesByWallet.mockResolvedValueOnce([]);
    await expect(findExistingLaunch(WALLET)).resolves.toBeNull();
  });

  it('is null, not a throw, when the tracker cannot answer', async () => {
    fetchLaunchesByWallet.mockRejectedValueOnce(new Error('tracker down'));
    await expect(findExistingLaunch(WALLET)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe('classifyRecordFailure', () => {
  it('names the existing agent on a 409 LAUNCH_EXISTS', async () => {
    getLaunch.mockResolvedValueOnce({ mint: 'MintOLD', name: 'First Agent', symbol: 'FIRST' });
    const failure = await classifyRecordFailure(new LaunchApiError('wallet already has a launch', 409, 'LAUNCH_EXISTS', 'MintOLD'), 1);
    expect(failure).toEqual({ kind: 'exists', mint: 'MintOLD', name: 'First Agent', symbol: 'FIRST' });
    expect(getLaunch).toHaveBeenCalledWith('MintOLD');
  });

  it('keeps the mint when the existing launch cannot be read', async () => {
    getLaunch.mockRejectedValueOnce(new Error('tracker down'));
    const failure = await classifyRecordFailure(new LaunchApiError('wallet already has a launch', 409, 'LAUNCH_EXISTS', 'MintOLD'), 1);
    expect(failure).toEqual({ kind: 'exists', mint: 'MintOLD', name: null, symbol: null });
  });

  it("carries the tracker's code and message for any other refusal", async () => {
    const failure = await classifyRecordFailure(new LaunchApiError('tx not found yet', 422, 'TX_NOT_FOUND'), 2);
    expect(failure).toEqual({
      kind: 'error',
      code: 'TX_NOT_FOUND',
      message: 'tx not found yet',
      transient: false,
      retryable: true,
      attempts: 2,
    });
    expect(getLaunch).not.toHaveBeenCalled();
  });

  it('treats a 409 without the LAUNCH_EXISTS code as a plain refusal', async () => {
    const failure = await classifyRecordFailure(new LaunchApiError('mint already recorded', 409, 'MINT_CONFLICT'), 1);
    expect(failure).toMatchObject({ kind: 'error', code: 'MINT_CONFLICT', transient: false });
  });

  it('reads a 422 QUOTE_NOT_ALLOWED (the tracker fixture) as a hard, non-retryable refusal', async () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, 'launch-record-quote-not-allowed-422.json'), 'utf8')) as {
      status: number;
      response: { error: { code: string; message: string } };
    };
    const err = new LaunchApiError(fixture.response.error.message, fixture.status, fixture.response.error.code);
    const failure = await classifyRecordFailure(err, 1);
    expect(failure).toMatchObject({ kind: 'error', code: 'QUOTE_NOT_ALLOWED', transient: false, retryable: false, attempts: 1 });
    expect(failure.kind === 'error' && failure.message).toContain('only $STONK launches are listed');
    expect(failure.kind === 'error' && failure.message).toContain(fixture.response.error.message);
  });

  it('marks a deadline the tracker missed (TIMEOUT) as transient and retryable', async () => {
    const failure = await classifyRecordFailure(new LaunchApiError('The tracker did not answer in 30 seconds', 504, 'TIMEOUT'), 1);
    expect(failure).toMatchObject({ kind: 'error', code: 'TIMEOUT', transient: true, retryable: true, attempts: 1 });
  });

  it('marks a request that never reached the tracker as transient', async () => {
    const failure = await classifyRecordFailure(new TypeError('Failed to fetch'), 3);
    expect(failure).toEqual({ kind: 'error', code: null, message: 'Failed to fetch', transient: true, retryable: true, attempts: 3 });
    await expect(classifyRecordFailure('boom', 1)).resolves.toMatchObject({ kind: 'error', message: 'boom', transient: true });
  });
});
