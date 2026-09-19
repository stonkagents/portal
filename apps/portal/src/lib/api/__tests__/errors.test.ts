/**
 * Purpose: Tests for ApiRequestError — structured API error with HTTP status
 */
import { describe, it, expect } from 'vitest';
import { ApiRequestError } from '../errors';

describe('ApiRequestError', () => {
  const body = { code: 'UNAUTHORIZED', message: 'API key required', details: { field: 'key' } };

  it('stores the HTTP status code', () => {
    const err = new ApiRequestError(401, body);
    expect(err.status).toBe(401);
  });

  it('stores the error code from the body', () => {
    const err = new ApiRequestError(401, body);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('uses body.message as the Error message', () => {
    const err = new ApiRequestError(401, body);
    expect(err.message).toBe('API key required');
  });

  it('stores optional details', () => {
    const err = new ApiRequestError(400, body);
    expect(err.details).toEqual({ field: 'key' });
  });

  it('defaults details to undefined when not provided', () => {
    const err = new ApiRequestError(500, { code: 'INTERNAL_ERROR', message: 'boom' });
    expect(err.details).toBeUndefined();
  });

  it('has name "ApiRequestError"', () => {
    const err = new ApiRequestError(500, { code: 'X', message: 'Y' });
    expect(err.name).toBe('ApiRequestError');
  });

  it('is an instance of Error', () => {
    const err = new ApiRequestError(500, { code: 'X', message: 'Y' });
    expect(err).toBeInstanceOf(Error);
  });
});
