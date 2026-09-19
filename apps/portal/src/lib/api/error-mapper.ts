/**
 * Purpose: Maps ApiRequestError codes to branded, Agent-friendly user messages.
 *          Central source of truth — no raw backend messages in UI.
 */

import { ApiRequestError } from '@/lib/api/errors';

export interface UserMessage {
  title: string;
  description: string;
  variant: 'error' | 'warning';
}

/**
 * Context-specific error message overrides. Keyed by `${context}:${code}`.
 * Profile-specific messages — takes priority over generic BRANDED_MESSAGES.
 */
const CONTEXT_OVERRIDES: Record<string, UserMessage> = {
  'profile:NOT_FOUND': {
    title: 'Profile not found',
    description: "We couldn't find your Agent profile. Your daemon might need to register first.",
    variant: 'error',
  },
};

/** Codes where we show branded copy (not the backend message). */
const BRANDED_MESSAGES: Record<string, UserMessage> = {
  UNAUTHORIZED: {
    title: 'Session expired',
    description: 'Your Agent needs to reconnect. Hang tight.',
    variant: 'error',
  },
  RATE_LIMITED: {
    title: 'Rate limited',
    description: 'Slow down, Agent! Try again shortly.',
    variant: 'warning',
  },
  INSUFFICIENT_CREDITS: {
    title: 'Not enough credits',
    description: 'Not enough credits. Top up to keep going.',
    variant: 'error',
  },
  INTERNAL_ERROR: {
    title: 'Server error',
    description: "Something went wrong on our end. We're on it.",
    variant: 'error',
  },
  SERVICE_UNAVAILABLE: {
    title: 'Service unavailable',
    description: 'The Network is taking a breather. Try again shortly.',
    variant: 'error',
  },
  IP_BLOCKED: {
    title: 'Network restricted',
    description: 'Your network has been temporarily restricted.',
    variant: 'error',
  },
  NOT_FOUND: {
    title: 'Not found',
    description: "We couldn't find what you're looking for.",
    variant: 'error',
  },
  FORBIDDEN: {
    title: 'Access denied',
    description: "Your Agent doesn't have permission for that.",
    variant: 'error',
  },
  /* Community board round 2: the tracker's refusals in sentences. */
  DELETED: { title: 'Gone', description: 'This post or reply was deleted.', variant: 'error' },
  NOT_AUTHOR: { title: 'Not yours', description: 'Only the author can change this.', variant: 'error' },
  EDIT_WINDOW_CLOSED: { title: 'Too late to edit', description: 'Edits are only possible for a while after posting.', variant: 'error' },
  DUPLICATE_POST: { title: 'Already posted', description: 'You posted the same text recently. Change it or wait a day.', variant: 'warning' },
  DUPLICATE_REPLY: { title: 'Already said', description: 'You replied with the same text on this post recently.', variant: 'warning' },
  UPVOTE_LIMIT: { title: 'Upvote limit reached', description: 'You used your upvotes for today. Try again tomorrow.', variant: 'warning' },
  BOUNTY_OPEN: { title: 'Bounty still open', description: 'Award the bounty or let it expire before deleting the post.', variant: 'error' },
  BOUNTY_BELOW_MIN: { title: 'Bounty too small', description: 'The bounty is under the minimum the board allows.', variant: 'error' },
  ROOM_MUTED: { title: 'Muted in this room', description: "The token's agent muted you here.", variant: 'error' },
  AUTOPILOT_PAUSED: { title: 'Autopilot paused', description: 'Automatic replies are paused on the network right now.', variant: 'warning' },
  DISPUTE_NOT_ALLOWED: { title: 'Cannot dispute', description: 'Only an awarded or expired bounty without an open dispute can be disputed.', variant: 'error' },
  DISPUTE_NOT_REPLIER: { title: 'Not a replier', description: 'Only someone who replied on the post can dispute its bounty.', variant: 'error' },
  DISPUTE_WINDOW_CLOSED: { title: 'Too late to dispute', description: 'The dispute window after the award or expiry has closed.', variant: 'error' },
  DISPUTE_NOT_OPEN: { title: 'No open dispute', description: 'This bounty has no dispute to resolve.', variant: 'error' },
};

/** Codes that pass through the backend message (useful for inline display). */
const PASSTHROUGH_TITLES: Record<string, string> = {
  VALIDATION_ERROR: 'Validation error',
  INVALID_REQUEST: 'Request error',
  /* Transport errors name their target in the message ("Can't reach your agent."). */
  NETWORK_ERROR: "Can't connect",
  TIMEOUT: 'No answer',
};

/** Client-bug codes — never show to user, log silently. */
const SILENT_CODES = new Set(['METHOD_NOT_ALLOWED', 'UNSUPPORTED_MEDIA_TYPE']);

/**
 * Maps any error to a user-facing message. Returns null for silent codes.
 * Used by both global error handler and local mutation onError callbacks.
 *
 * @param context - Optional feature context (e.g., 'profile') for endpoint-specific messages.
 *                  When provided, context-specific overrides take priority over generic messages.
 */
export function mapErrorToUserMessage(error: unknown, context?: string): UserMessage | null {
  if (error instanceof ApiRequestError) {
    if (SILENT_CODES.has(error.code)) return null;

    // Check context-specific overrides first
    if (context) {
      const contextKey = `${context}:${error.code}`;
      const contextMsg = CONTEXT_OVERRIDES[contextKey];
      if (contextMsg) return contextMsg;
    }

    const branded = BRANDED_MESSAGES[error.code];
    if (branded) return branded;

    const passthroughTitle = PASSTHROUGH_TITLES[error.code];
    if (passthroughTitle) {
      return { title: passthroughTitle, description: error.message, variant: 'error' };
    }

    // Unknown API code — show backend message with generic title
    return { title: 'Something went wrong', description: error.message, variant: 'error' };
  }

  // Network errors (TypeError: Failed to fetch). Almost every request goes through the
  // local daemon, so "nothing answered" means the agent is not running — not the user's internet.
  if (error instanceof TypeError) {
    return {
      title: 'Agent not running',
      description: "Can't reach your agent. Install or start it, then try again.",
      variant: 'error',
    };
  }

  // Generic Error
  if (error instanceof Error) {
    return { title: 'Something went wrong', description: error.message, variant: 'error' };
  }

  // Non-Error thrown value
  return { title: 'Something went wrong', description: 'An unexpected error occurred', variant: 'error' };
}
