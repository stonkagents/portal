/**
 * Purpose: Tests for error mapper — Agent-friendly messages from ApiRequestError codes
 */

import { describe, it, expect } from 'vitest';
import { mapErrorToUserMessage } from '@/lib/api/error-mapper';
import { ApiRequestError } from '@/lib/api/errors';

function makeApiError(status: number, code: string, message = 'test'): ApiRequestError {
  return new ApiRequestError(status, { code, message });
}

describe('mapErrorToUserMessage', () => {
  // ── Codes with branded copy ──────────────────────────

  it('maps UNAUTHORIZED to reconnect message', () => {
    const result = mapErrorToUserMessage(makeApiError(401, 'UNAUTHORIZED'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Session expired');
    expect(result!.description).toBe('Your Agent needs to reconnect. Hang tight.');
    expect(result!.variant).toBe('error');
  });

  it('maps RATE_LIMITED to slow-down message with warning variant', () => {
    const result = mapErrorToUserMessage(makeApiError(429, 'RATE_LIMITED'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Rate limited');
    expect(result!.description).toBe('Slow down, Agent! Try again shortly.');
    expect(result!.variant).toBe('warning');
  });

  it('maps INSUFFICIENT_CREDITS to top-up message', () => {
    const result = mapErrorToUserMessage(makeApiError(402, 'INSUFFICIENT_CREDITS'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Not enough credits');
    expect(result!.description).toBe('Not enough credits. Top up to keep going.');
    expect(result!.variant).toBe('error');
  });

  it('maps INTERNAL_ERROR to branded server error', () => {
    const result = mapErrorToUserMessage(makeApiError(500, 'INTERNAL_ERROR'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Server error');
    expect(result!.description).toBe("Something went wrong on our end. We're on it.");
    expect(result!.variant).toBe('error');
  });

  it('maps SERVICE_UNAVAILABLE to Network breather message', () => {
    const result = mapErrorToUserMessage(makeApiError(503, 'SERVICE_UNAVAILABLE'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Service unavailable');
    expect(result!.description).toBe('The Network is taking a breather. Try again shortly.');
    expect(result!.variant).toBe('error');
  });

  it('maps IP_BLOCKED to restriction message', () => {
    const result = mapErrorToUserMessage(makeApiError(403, 'IP_BLOCKED'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Network restricted');
    expect(result!.description).toBe('Your network has been temporarily restricted.');
    expect(result!.variant).toBe('error');
  });

  it('maps NOT_FOUND to generic not-found message (no context)', () => {
    const result = mapErrorToUserMessage(makeApiError(404, 'NOT_FOUND'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Not found');
    expect(result!.description).toBe("We couldn't find what you're looking for.");
    expect(result!.variant).toBe('error');
  });

  // Profile-specific error messages
  it('maps NOT_FOUND with profile context to Agent profile message', () => {
    const result = mapErrorToUserMessage(makeApiError(404, 'NOT_FOUND'), 'profile');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Profile not found');
    expect(result!.description).toBe(
      "We couldn't find your Agent profile. Your daemon might need to register first.",
    );
    expect(result!.variant).toBe('error');
  });

  it('maps FORBIDDEN to permission message', () => {
    const result = mapErrorToUserMessage(makeApiError(403, 'FORBIDDEN'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Access denied');
    expect(result!.description).toBe("Your Agent doesn't have permission for that.");
    expect(result!.variant).toBe('error');
  });

  // ── Codes that pass through backend message ───────────────

  it('maps VALIDATION_ERROR to backend message with validation title', () => {
    const err = makeApiError(400, 'VALIDATION_ERROR', 'Body must be at least 10 characters');
    const result = mapErrorToUserMessage(err);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Validation error');
    expect(result!.description).toBe('Body must be at least 10 characters');
    expect(result!.variant).toBe('error');
  });

  it('maps INVALID_REQUEST to backend message with request error title', () => {
    const err = makeApiError(400, 'INVALID_REQUEST', 'Malformed JSON body');
    const result = mapErrorToUserMessage(err);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Request error');
    expect(result!.description).toBe('Malformed JSON body');
    expect(result!.variant).toBe('error');
  });

  // ── Silent codes (client bugs — never show to user) ───────

  it('maps METHOD_NOT_ALLOWED to null (silent)', () => {
    const result = mapErrorToUserMessage(makeApiError(405, 'METHOD_NOT_ALLOWED'));
    expect(result).toBeNull();
  });

  it('maps UNSUPPORTED_MEDIA_TYPE to null (silent)', () => {
    const result = mapErrorToUserMessage(makeApiError(415, 'UNSUPPORTED_MEDIA_TYPE'));
    expect(result).toBeNull();
  });

  // ── Unknown ApiRequestError code → fallback ───────────────

  it('maps unknown ApiRequestError code to generic message with backend text', () => {
    const result = mapErrorToUserMessage(makeApiError(409, 'ALREADY_CONNECTED', 'Already connected'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Something went wrong');
    expect(result!.description).toBe('Already connected');
    expect(result!.variant).toBe('error');
  });

  // ── Non-API errors ────────────────────────────────────────

  it('maps TypeError (network) to connection lost message', () => {
    const result = mapErrorToUserMessage(new TypeError('Failed to fetch'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Agent not running');
    expect(result!.description).toBe("Can't reach your agent. Install or start it, then try again.");
    expect(result!.variant).toBe('error');
  });

  it('maps generic Error to fallback message', () => {
    const result = mapErrorToUserMessage(new Error('Something broke'));
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Something went wrong');
    expect(result!.description).toBe('Something broke');
    expect(result!.variant).toBe('error');
  });

  it('maps non-Error (string) to generic fallback', () => {
    const result = mapErrorToUserMessage('oops');
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Something went wrong');
    expect(result!.description).toBe('An unexpected error occurred');
    expect(result!.variant).toBe('error');
  });
});
