/**
 * "Where the fees went": each row is a figure read from the chain or the
 * ledger, with an honest note when nothing readable exists yet.
 */
import { describe, expect, it } from 'vitest';
import { pool, launched } from '../_components/__tests__/fixtures';
import { feeSplit, feesWentRows, impliedVolumeQuote } from './fees';

const split = feeSplit(launched, pool);
const base = {
  split,
  tokenSymbol: 'HOUND',
  mint: launched.mint,
  quoteSymbol: 'STONK',
  pool,
  withheldInAccounts: 1_250.5,
  withheldOnMint: 0,
};

describe('feesWentRows', () => {
  it('reads holders from the withheld fee, raydium from the pool, and leaves protocol honest', () => {
    const rows = feesWentRows(base);
    expect(rows.map(r => r.id)).toEqual(['holders', 'protocol', 'raydium']);
    expect(rows[0]).toMatchObject({ bps: 100, amount: { value: 1_250.5, unit: 'HOUND' }, link: { kind: 'token', id: launched.mint } });
    expect(rows[0].note).toContain('paid out in $STONK by the keeper');
    expect(rows[1]).toMatchObject({ bps: 100, amount: null, link: { kind: 'address', id: pool.platformFeeWallet } });
    expect(rows[1].note).toContain('The ledger starts with the keeper');
    expect(rows[2]).toMatchObject({ bps: 25, amount: { value: 0.75, unit: 'STONK' }, link: { kind: 'address', id: pool.poolId } });
    expect(rows[2].note).toContain('implies ≈ 300 STONK traded');
  });

  it('is null and says so before the mint and the pool have answered', () => {
    const rows = feesWentRows({ ...base, pool: undefined, poolId: 'PoolX', withheldInAccounts: null, withheldOnMint: null });
    expect(rows[0].amount).toBeNull();
    expect(rows[0].note).toBe('Reading the mint.');
    expect(rows[1].link).toEqual({ kind: 'address', id: 'PoolX', label: 'pool' });
    expect(rows[2]).toMatchObject({ amount: null, note: 'Reading the pool.', link: { id: 'PoolX' } });
  });

  it("marks a floor when only the largest accounts were read and adds the mint's own withheld", () => {
    const rows = feesWentRows({ ...base, withheldInAccounts: 100, withheldOnMint: 5, withheldFloor: true });
    expect(rows[0].amount).toEqual({ value: 105, unit: 'HOUND', floor: true });
  });

  it('prefers the pool accrual for the protocol, then the ledger', () => {
    const accrued = feesWentRows({ ...base, pool: { ...pool, platformFeeQuote: 3 } });
    expect(accrued[1].amount).toEqual({ value: 3, unit: 'STONK' });
    expect(accrued[1].note).toContain('Accrued in the pool, unclaimed');

    const ledger = {
      entries: [],
      totalsUsd: { platform_fee_claim: 9, holder_distribution: 12 },
      counts: { platform_fee_claim: 1, holder_distribution: 2 },
      partial: false,
    };
    const claimed = feesWentRows({ ...base, ledger });
    expect(claimed[1].amount).toEqual({ value: 9, unit: 'USD' });
    expect(claimed[1].note).toContain('Claimed 1×');
    expect(claimed[0].note).toBe('Paid out 2× so far ($12); the rest is withheld by the mint until the next payout.');
  });

  it('derives the implied volume from the Raydium accrual only', () => {
    expect(impliedVolumeQuote(pool)).toBe(300);
    expect(impliedVolumeQuote({ ...pool, protocolFeeQuote: 0 })).toBeNull();
    expect(impliedVolumeQuote(undefined)).toBeNull();
    expect(feesWentRows({ ...base, pool: { ...pool, protocolFeeQuote: 0 } })[2].note).toBe('Nothing accrued yet.');
  });
});
