/**
 * @vitest-environment node
 *
 * The trade builders hand the SDK the pool exactly as it was read: its
 * program, its pool and config accounts, and the fee rate of the platform
 * config the pool names — so a pool under stonk.fun's platform ($AGENT) is
 * built against that platform, never against our LAUNCHPAD_PLATFORM_ID.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BN from 'bn.js';
import type * as Web3 from '@solana/web3.js';
import { pool } from '@/app/tokens/_components/__tests__/fixtures';

const buyToken = vi.fn();
const sellToken = vi.fn();
vi.mock('@raydium-io/raydium-sdk-v2', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@raydium-io/raydium-sdk-v2');
  return {
    ...actual,
    Raydium: { load: vi.fn(async () => ({ launchpad: { buyToken, sellToken } })) },
  };
});
vi.mock('@/lib/solana/connection', async () => {
  const web3 = await vi.importActual<typeof Web3>('@solana/web3.js');
  return { getSolanaConnection: async () => ({}), loadWeb3: async () => web3 };
});

import { buildBuy, buildSell } from './trading';

const WALLET = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const platformFeeRate = new BN(10_000);
const stonkfunPool = {
  ...pool,
  quoteMint: 'So11111111111111111111111111111111111111112',
  platformId: 'StonkFunPlatform111111111111111111111111111',
  platformName: 'stonk.fun',
  raw: { poolInfo: { tag: 'pool' }, configInfo: { tag: 'config' }, platformInfo: { feeRate: platformFeeRate, creatorFeeRate: new BN(0) }, curveType: 0 },
};

describe('buildBuy / buildSell against a foreign platform', () => {
  beforeEach(() => {
    buyToken.mockReset().mockResolvedValue({ transaction: { kind: 'buy' } });
    sellToken.mockReset().mockResolvedValue({ transaction: { kind: 'sell' } });
  });

  it("builds the buy with the pool's own accounts and its platform's fee rate", async () => {
    const tx = await buildBuy({ pool: stonkfunPool, wallet: WALLET, amount: 0.5, slippageBps: 150 });
    expect(tx).toEqual({ kind: 'buy' });
    const args = buyToken.mock.calls[0]![0];
    expect(args.programId.toBase58()).toBe(pool.programId);
    expect(args.mintA.toBase58()).toBe(pool.mint);
    expect(args.mintB.toBase58()).toBe(stonkfunPool.quoteMint);
    expect(args.poolInfo).toBe(stonkfunPool.raw.poolInfo);
    expect(args.configInfo).toBe(stonkfunPool.raw.configInfo);
    expect(args.platformFeeRate).toBe(platformFeeRate);
    expect(args.buyAmount.toString()).toBe('500000000');
    expect(args.slippage.toString()).toBe('150');
    expect(args.feePayer.toBase58()).toBe(WALLET);
    // Nothing of ours: no platform id is passed, the SDK reads it off poolInfo.platformId.
    expect(args).not.toHaveProperty('platformId');
  });

  it("builds the sell the same way, and leaves the rate to the SDK when the platform account wasn't read", async () => {
    await buildSell({ pool: stonkfunPool, wallet: WALLET, amount: 1_000 });
    let args = sellToken.mock.calls[0]![0];
    expect(args.platformFeeRate).toBe(platformFeeRate);
    expect(args.sellAmount.toString()).toBe('1000000000');
    expect(args.slippage.toString()).toBe('100');

    await buildSell({ pool: { ...stonkfunPool, raw: { ...stonkfunPool.raw, platformInfo: null } }, wallet: WALLET, amount: 1 });
    args = sellToken.mock.calls[1]![0];
    expect(args.platformFeeRate).toBeUndefined();
  });
});
