/**
 * Purpose: Tests for global error handler — classifier and toast bridge
 */
import { describe, it, expect, vi } from 'vitest';
import { ApiRequestError } from '../errors';
import { isGlobalToastError, globalErrorRef } from '../global-error-handler';

describe('isGlobalToastError', () => {
  it('returns true for network TypeError', () => {
    expect(isGlobalToastError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('returns true for 500 INTERNAL_ERROR', () => {
    const err = new ApiRequestError(500, { code: 'INTERNAL_ERROR', message: 'fail' });
    expect(isGlobalToastError(err)).toBe(true);
  });

  it('returns true for 503 SERVICE_UNAVAILABLE', () => {
    const err = new ApiRequestError(503, { code: 'SERVICE_UNAVAILABLE', message: 'fail' });
    expect(isGlobalToastError(err)).toBe(true);
  });

  it('returns true for 429 RATE_LIMITED', () => {
    const err = new ApiRequestError(429, { code: 'RATE_LIMITED', message: 'fail' });
    expect(isGlobalToastError(err)).toBe(true);
  });

  it('returns true for 400 INVALID_REQUEST', () => {
    const err = new ApiRequestError(400, { code: 'INVALID_REQUEST', message: 'fail' });
    expect(isGlobalToastError(err)).toBe(true);
  });

  it('returns false for 400 VALIDATION_ERROR', () => {
    const err = new ApiRequestError(400, { code: 'VALIDATION_ERROR', message: 'fail' });
    expect(isGlobalToastError(err)).toBe(false);
  });

  it('returns false for 401 UNAUTHORIZED', () => {
    const err = new ApiRequestError(401, { code: 'UNAUTHORIZED', message: 'fail' });
    expect(isGlobalToastError(err)).toBe(false);
  });

  it('returns false for 402 INSUFFICIENT_CREDITS', () => {
    const err = new ApiRequestError(402, { code: 'INSUFFICIENT_CREDITS', message: 'fail' });
    expect(isGlobalToastError(err)).toBe(false);
  });

  it('returns false for 403 FORBIDDEN', () => {
    const err = new ApiRequestError(403, { code: 'FORBIDDEN', message: 'fail' });
    expect(isGlobalToastError(err)).toBe(false);
  });

  it('returns true for unknown non-ApiRequestError', () => {
    expect(isGlobalToastError(new Error('something broke'))).toBe(true);
  });
});

describe('globalErrorRef', () => {
  it('is null by default', () => {
    expect(globalErrorRef.current).toBeNull();
  });

  it('can be set and called', () => {
    const spy = vi.fn();
    globalErrorRef.current = spy;
    globalErrorRef.current(new Error('test'));
    expect(spy).toHaveBeenCalledOnce();
    globalErrorRef.current = null;
  });
});
