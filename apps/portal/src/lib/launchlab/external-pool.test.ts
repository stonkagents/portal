/**
 * @vitest-environment node
 *
 * Trading against a pool under another platform's config ($AGENT on stonk.fun):
 * the LaunchLab program comes from the cluster, the pool from the mint pair or
 * the environment, and the platform config from the pool account — never from
 * our LAUNCHPAD_PLATFORM_ID. Runs under node: jsdom's Uint8Array breaks the
 * curve check behind PDA derivation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pool } from '@/app/tokens/_components/__tests__/fixtures';

const getPoolState = vi.fn();
vi.mock('./pool-state', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./pool-state');
  return { ...actual, getPoolState: (p: unknown) => getPoolState(p) };
});

import { SDK_POOL_MISSING, deriveExternalPoolId, getExternalPoolState, isForeignPlatform, launchlabProgramId, poolMissingMessage } from './external-pool';
import { platformNameOf } from './pool-state';

const MAINNET_LAUNCHLAB = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
/** The same devnet program the tracker's launch config names (LAUNCHLAB_PROGRAM_ID, bootstrap_launchpad.go). */
const DEVNET_LAUNCHLAB = 'DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6';
/** A real address (the pool fixture's mint); the built-in default $AGENT mint is a display placeholder, not a key. */
const MINT = pool.mint;
const WSOL = 'So11111111111111111111111111111111111111112';

describe('launchlabProgramId', () => {
  it("is the SDK's program for the cluster", async () => {
    expect(await launchlabProgramId('mainnet')).toBe(MAINNET_LAUNCHLAB);
    expect(await launchlabProgramId('devnet')).toBe(DEVNET_LAUNCHLAB);
  });
});

describe('deriveExternalPoolId', () => {
  it('is the LaunchLab pool PDA of the mint pair, deterministic', async () => {
    const a = await deriveExternalPoolId(MINT, WSOL);
    const b = await deriveExternalPoolId(MINT, WSOL);
    expect(a).toBe(b);
    expect(a).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(await deriveExternalPoolId(MINT, pool.quoteMint)).not.toBe(a);
  });
});

describe('getExternalPoolState', () => {
  // Braces: a hook that returns the mock hands vitest a "cleanup" that calls the mock after the test.
  beforeEach(() => {
    getPoolState.mockReset().mockResolvedValue(pool);
  });

  it("reads the pool on the cluster's program, deriving the pool when none is given", async () => {
    await getExternalPoolState({ mint: MINT, quoteMint: WSOL });
    expect(getPoolState).toHaveBeenCalledWith({ programId: DEVNET_LAUNCHLAB, mint: MINT, quoteMint: WSOL, poolId: undefined });
  });

  it('names the environment variable when the mint is not an address', async () => {
    await expect(getExternalPoolState({ mint: 'tRqrTWVmyZD7pqgu8jkBJodLyCKYJhC7Wbgi1MnT9gSr', quoteMint: WSOL })).rejects.toThrow(
      /NEXT_PUBLIC_AGENT_MINT/,
    );
    expect(getPoolState).not.toHaveBeenCalled();
  });

  it('passes a configured pool id straight through', async () => {
    await getExternalPoolState({ mint: MINT, quoteMint: WSOL, poolId: 'PoolFromEnv' });
    expect(getPoolState).toHaveBeenCalledWith(expect.objectContaining({ poolId: 'PoolFromEnv' }));
  });

  it("names the pool address, how it was found, the cluster and the env values when the SDK finds no pool account", async () => {
    const derived = await deriveExternalPoolId(MINT, WSOL);
    getPoolState.mockRejectedValue(new Error(`${SDK_POOL_MISSING}: ${derived}`));
    await expect(getExternalPoolState({ mint: MINT, quoteMint: WSOL })).rejects.toThrow(
      `No LaunchLab pool at ${derived} on devnet (derived from the mint and the quote ${WSOL}) for the mint ${MINT}. Set NEXT_PUBLIC_AGENT_MINT, NEXT_PUBLIC_AGENT_POOL and NEXT_PUBLIC_AGENT_QUOTE_MINT to the live pool.`,
    );
    getPoolState.mockRejectedValue(new Error(`${SDK_POOL_MISSING}: PoolFromEnv`));
    await expect(getExternalPoolState({ mint: MINT, quoteMint: WSOL, poolId: 'PoolFromEnv' })).rejects.toThrow(
      /No LaunchLab pool at PoolFromEnv on devnet \(named by NEXT_PUBLIC_AGENT_POOL\)/,
    );
    expect(poolMissingMessage('P', { mint: 'M', quoteMint: 'Q', poolId: null }, 'mainnet')).toContain('on mainnet (derived from the mint and the quote Q)');
  });

  it('passes any other read failure through untouched', async () => {
    getPoolState.mockRejectedValue(new Error('429 Too Many Requests'));
    await expect(getExternalPoolState({ mint: MINT, quoteMint: WSOL })).rejects.toThrow('429 Too Many Requests');
  });

  it('hands back whatever the pool account says, platform included', async () => {
    getPoolState.mockResolvedValue({ ...pool, platformId: 'StonkFunPlatform', platformName: 'stonk.fun' });
    const state = await getExternalPoolState({ mint: MINT, quoteMint: WSOL });
    expect(state.platformId).toBe('StonkFunPlatform');
    expect(state.platformName).toBe('stonk.fun');
  });
});

describe('isForeignPlatform', () => {
  it('compares the pool platform to ours, and is unknown until both are known', () => {
    expect(isForeignPlatform({ ...pool, platformId: 'Theirs' }, 'Ours')).toBe(true);
    expect(isForeignPlatform({ ...pool, platformId: 'Ours' }, 'Ours')).toBe(false);
    expect(isForeignPlatform(null, 'Ours')).toBeNull();
    expect(isForeignPlatform(pool, null)).toBeNull();
  });
});

describe('platformNameOf', () => {
  it('reads the NUL-padded name field of a platform config', () => {
    const bytes = [...new TextEncoder().encode('stonk.fun'), 0, 0, 0, 0];
    expect(platformNameOf(bytes)).toBe('stonk.fun');
    expect(platformNameOf([0, 0, 0])).toBeNull();
    expect(platformNameOf(null)).toBeNull();
    expect(platformNameOf([])).toBeNull();
  });
});
