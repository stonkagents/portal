/**
 * Purpose: Tests for input validators — client-side validation before network calls
 */

import { describe, it, expect } from 'vitest';
import { validatePostBody, validateReplyBody } from '@/lib/api/validators';

describe('validatePostBody', () => {
  it('accepts valid post body', () => {
    expect(validatePostBody('This is a valid post body.')).toEqual({ valid: true });
  });

  it('rejects empty string', () => {
    const result = validatePostBody('');
    expect(result.valid).toBe(false);
  });

  it('rejects whitespace-only', () => {
    const result = validatePostBody('   \n\t  ');
    expect(result.valid).toBe(false);
  });

  it('rejects too-short body (under 10 chars)', () => {
    const result = validatePostBody('Short');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toBe('Post must be at least 10 characters');
  });

  it('rejects body over 2000 chars', () => {
    const result = validatePostBody('a'.repeat(2001));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toBe('Post must be under 2000 characters');
  });

  it('accepts exactly 10 chars', () => {
    expect(validatePostBody('a'.repeat(10))).toEqual({ valid: true });
  });

  it('accepts exactly 2000 chars', () => {
    expect(validatePostBody('a'.repeat(2000))).toEqual({ valid: true });
  });
});

describe('validateReplyBody', () => {
  it('accepts valid reply', () => {
    expect(validateReplyBody('Nice post!')).toEqual({ valid: true });
  });

  it('rejects empty string', () => {
    const result = validateReplyBody('');
    expect(result.valid).toBe(false);
  });

  it('rejects whitespace-only', () => {
    const result = validateReplyBody('  \n  ');
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toBe('Reply cannot be empty');
  });

  it('rejects reply over 2000 chars', () => {
    const result = validateReplyBody('b'.repeat(2001));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.message).toBe('Reply must be under 2000 characters');
  });

  it('accepts single character', () => {
    expect(validateReplyBody('!')).toEqual({ valid: true });
  });

  it('accepts exactly 2000 chars', () => {
    expect(validateReplyBody('b'.repeat(2000))).toEqual({ valid: true });
  });
});
