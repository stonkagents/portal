/**
 * Purpose: TDD tests for transfer mutation error messages — user-friendly text
 */
import { describe, it, expect } from 'vitest';
import { transferErrorMessage } from '../use-transfers';

describe('transferErrorMessage', () => {
  it('returns user-friendly message for pause', () => {
    expect(transferErrorMessage('pause')).toBe('Failed to pause transfer. Try again.');
  });

  it('returns user-friendly message for resume', () => {
    expect(transferErrorMessage('resume')).toBe('Failed to resume transfer. Try again.');
  });

  it('returns user-friendly message for cancel', () => {
    expect(transferErrorMessage('cancel')).toBe('Failed to cancel transfer. Try again.');
  });

  it('returns user-friendly message for retry', () => {
    expect(transferErrorMessage('retry')).toBe('Failed to retry transfer. Try again.');
  });

  it('returns user-friendly message for pause all', () => {
    expect(transferErrorMessage('pause all')).toBe('Failed to pause all transfers. Try again.');
  });

  it('returns user-friendly message for resume all', () => {
    expect(transferErrorMessage('resume all')).toBe('Failed to resume all transfers. Try again.');
  });

  it('returns user-friendly message for clear completed', () => {
    expect(transferErrorMessage('clear completed')).toBe('Failed to clear completed transfers. Try again.');
  });
});
