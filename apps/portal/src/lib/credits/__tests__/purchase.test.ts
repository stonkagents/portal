/**
 * Purpose: Tests for buildCreditPurchaseTx and classifyPurchaseError
 */
import { describe, it, expect, vi } from 'vitest';

// Mock @solana/web3.js — SystemProgram.transfer doesn't work in jsdom
vi.mock('@solana/web3.js', () => {
  class MockPublicKey {
    private key: string;
    constructor(key: string) {
      this.key = key;
    }
    toBase58() {
      return this.key;
    }
    equals(other: MockPublicKey) {
      return this.key === other.key;
    }
  }

  class MockTransaction {
    instructions: unknown[] = [];
    add(ix: unknown) {
      this.instructions.push(ix);
      return this;
    }
  }

  return {
    PublicKey: MockPublicKey,
    Transaction: MockTransaction,
    SystemProgram: {
      transfer: (params: { fromPubkey: unknown; toPubkey: unknown; lamports: number }) => ({
        programId: new MockPublicKey('11111111111111111111111111111111'),
        fromPubkey: params.fromPubkey,
        toPubkey: params.toPubkey,
        lamports: params.lamports,
      }),
    },
    LAMPORTS_PER_SOL: 1_000_000_000,
  };
});

const { buildCreditPurchaseTx, classifyPurchaseError } = await import('../purchase');
const { PublicKey } = await import('@solana/web3.js');

describe('buildCreditPurchaseTx', () => {
  const userPubkey = new PublicKey('11111111111111111111111111111112');

  it('creates a transaction with one instruction', () => {
    const tx = buildCreditPurchaseTx(userPubkey, 0.45);
    expect(tx.instructions).toHaveLength(1);
  });

  it('creates a SystemProgram transfer instruction', () => {
    const tx = buildCreditPurchaseTx(userPubkey, 0.1);
    const ix = tx.instructions[0] as { programId: { toBase58: () => string } };
    expect(ix.programId.toBase58()).toBe('11111111111111111111111111111111');
  });

  it('calculates correct lamports', () => {
    const tx = buildCreditPurchaseTx(userPubkey, 0.1);
    const ix = tx.instructions[0] as unknown as { lamports: number };
    expect(ix.lamports).toBe(100_000_000);
  });
});

describe('classifyPurchaseError', () => {
  it('recognizes user rejection', () => {
    const err = new Error('User rejected the request');
    expect(classifyPurchaseError(err)).toContain('rejected');
  });

  it('recognizes insufficient funds', () => {
    const err = new Error('insufficient lamports');
    expect(classifyPurchaseError(err)).toContain('Insufficient');
  });

  it('recognizes network errors', () => {
    const err = new Error('network timeout');
    expect(classifyPurchaseError(err)).toContain('Network');
  });

  it('recognizes expired transactions', () => {
    const err = new Error('blockhash not found');
    expect(classifyPurchaseError(err)).toContain('expired');
  });

  it('returns generic message for unknown short errors', () => {
    const err = new Error('x');
    expect(classifyPurchaseError(err)).toContain('failed');
  });

  it('returns original message for descriptive errors', () => {
    const err = new Error('Something specific went wrong here');
    expect(classifyPurchaseError(err)).toBe('Something specific went wrong here');
  });

  it('handles non-Error values', () => {
    expect(classifyPurchaseError('string error')).toContain('failed');
    expect(classifyPurchaseError(null)).toContain('failed');
  });
});
