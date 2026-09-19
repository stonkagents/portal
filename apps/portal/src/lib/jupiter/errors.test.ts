/**
 * One line per way a swap can fail: the wallet's no, an empty wallet, a
 * moved price, a dead network, Jupiter down or refusing, and the rest.
 */
import { describe, expect, it } from 'vitest';
import { JupiterApiError } from '@/lib/api/jupiter';
import { classifySwapError, SwapPreflightError } from './errors';

describe('classifySwapError', () => {
  it('reads a rejection from any layer of the wallet error', () => {
    expect(classifySwapError({ code: 4001, message: 'User rejected the request.' }).kind).toBe('rejected');
    expect(classifySwapError(new Error('Failed to sign transaction', { cause: { message: 'User rejected the request' } })).kind).toBe(
      'rejected',
    );
    expect(classifySwapError(new Error('Transaction cancelled')).kind).toBe('rejected');
  });

  it("names the wallet's shortfall from the token program, the system program and Jupiter's simulation", () => {
    const custom1 = new Error(
      'Simulation failed. Message: Transaction simulation failed: Error processing Instruction 3: custom program error: 0x1',
    );
    expect(classifySwapError(custom1, 'STONK')).toEqual({
      kind: 'insufficient',
      message: 'Not enough STONK, or SOL for the fees, in this wallet.',
    });
    expect(classifySwapError(new Error('Transfer: insufficient lamports 100, need 5000')).kind).toBe('insufficient');
    expect(
      classifySwapError(new Error('Simulation failed: Attempt to debit an account but found no record of a prior credit.')).kind,
    ).toBe('insufficient');
    expect(classifySwapError(new Error('Transaction failed: {"InstructionError":[3,{"Custom":1}]}'.toLowerCase())).kind).toBe(
      'insufficient',
    );
  });

  it('reads slippage from Jupiter (6001 / 0x1771) and from the words', () => {
    expect(classifySwapError(new Error('Transaction failed: {"InstructionError":[4,{"Custom":6001}]}')).kind).toBe('slippage');
    expect(classifySwapError(new Error('custom program error: 0x1771')).kind).toBe('slippage');
    expect(classifySwapError(new Error('Slippage tolerance exceeded')).kind).toBe('slippage');
    // Custom 1 vs 6001 / 0x1 vs 0x1771 do not bleed into each other.
    expect(classifySwapError(new Error('custom program error: 0x1771')).kind).not.toBe('insufficient');
  });

  it('separates a refusal, an outage, rate limiting and a dead network at Jupiter', () => {
    expect(classifySwapError(new JupiterApiError('No routes found', 400, 'NO_ROUTES_FOUND'))).toEqual({
      kind: 'no-route',
      message: 'Jupiter found no route for that amount. Try a smaller one.',
    });
    expect(classifySwapError(new JupiterApiError('Jupiter could not quote (503)', 503)).kind).toBe('jupiter');
    expect(classifySwapError(new JupiterApiError('Too many requests', 429)).kind).toBe('jupiter');
    expect(classifySwapError(new JupiterApiError('Could not reach Jupiter: Failed to fetch', 0, 'NETWORK')).kind).toBe('network');
    expect(classifySwapError(new JupiterApiError('Invalid user public key', 422)).message).toBe(
      'Jupiter refused the swap: Invalid user public key',
    );
  });

  it('reads an expired blockhash, a dead RPC and a plain simulation failure', () => {
    expect(classifySwapError(new Error('block height exceeded')).kind).toBe('expired');
    expect(classifySwapError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(classifySwapError(new Error('Simulation failed. Message: Error: Program failed to complete.')).message).toBe(
      'Simulation failed: Program failed to complete.',
    );
  });

  it('passes a preflight sentence through and has a last resort', () => {
    expect(classifySwapError(new SwapPreflightError('Enter a STONK amount.', 'unknown'))).toEqual({
      kind: 'unknown',
      message: 'Enter a STONK amount.',
    });
    expect(classifySwapError(null)).toEqual({ kind: 'unknown', message: 'The swap failed. Nothing moved; try again.' });
    expect(classifySwapError(new Error('Something specific went wrong here')).message).toBe('Something specific went wrong here');
  });
});
