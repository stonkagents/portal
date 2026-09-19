/**
 * Purpose: Tests for credit tier configuration and SOL price calculation
 */
import { describe, it, expect } from 'vitest';
import { CREDIT_TIERS, MIN_CUSTOM_CREDITS, calculateCustomSol, solToLamports } from '../tiers';

/**
 * Tracker anchors the credit→lamport conversion at 20000 lamports/credit
 * (agent/tracker migration 008_credit_lamports_rate, 0.00002 SOL/credit).
 * The Starter tier is priced exactly at that base rate; Pro/Ultra glide down from it.
 */
const TRACKER_LAMPORTS_PER_CREDIT = 20000;

describe('CREDIT_TIERS', () => {
  it('has exactly 3 tiers', () => {
    expect(CREDIT_TIERS).toHaveLength(3);
  });

  it('has starter at 1000 credits priced at the tracker base rate', () => {
    const starter = CREDIT_TIERS.find(t => t.id === 'starter');
    expect(starter).toBeDefined();
    expect(starter!.credits).toBe(1000);
    expect(solToLamports(starter!.solPrice) / starter!.credits).toBe(TRACKER_LAMPORTS_PER_CREDIT);
    expect(starter!.discount).toBe(0);
  });

  it('has pro marked as popular', () => {
    const pro = CREDIT_TIERS.find(t => t.id === 'pro');
    expect(pro).toBeDefined();
    expect(pro!.popular).toBe(true);
  });

  it('has ultra at 20000 credits with the deepest discount', () => {
    const ultra = CREDIT_TIERS.find(t => t.id === 'ultra');
    const pro = CREDIT_TIERS.find(t => t.id === 'pro');
    expect(ultra).toBeDefined();
    expect(ultra!.credits).toBe(20000);
    expect(ultra!.discount).toBeGreaterThan(pro!.discount ?? 0);
    // Custom purchases start just above the largest tier
    expect(MIN_CUSTOM_CREDITS).toBe(ultra!.credits + 1);
  });
});

describe('calculateCustomSol', () => {
  it('calculates SOL from credits using ultra rate', () => {
    const ultra = CREDIT_TIERS.find(t => t.id === 'ultra')!;
    const result = calculateCustomSol(1000);
    // Ultra rate: 0.30 SOL / 20000 credits = 0.000015 SOL/credit → 1000 * 0.000015 = 0.015
    expect(result).toBeCloseTo(0.015, 6);
    expect(result).toBeCloseTo(1000 * (ultra.solPrice / ultra.credits), 9);
  });

  it('returns 0 for 0 credits', () => {
    expect(calculateCustomSol(0)).toBe(0);
  });

  it('returns 0 for negative credits', () => {
    expect(calculateCustomSol(-100)).toBe(0);
  });
});

describe('solToLamports', () => {
  it('converts SOL to lamports', () => {
    expect(solToLamports(1)).toBe(1_000_000_000);
  });

  it('converts fractional SOL', () => {
    expect(solToLamports(0.1)).toBe(100_000_000);
  });
});
