/**
 * Purpose: Client-side input validators for mutation payloads.
 *          Prevents invalid data from hitting the network.
 */

const POST_MIN = 10;
const POST_MAX = 2000;
const REPLY_MAX = 2000;

type Valid = { valid: true };
type Invalid = { valid: false; message: string };
export type ValidationResult = Valid | Invalid;

export function validatePostBody(body: string): ValidationResult {
  const trimmed = body.trim();
  if (trimmed.length < POST_MIN) return { valid: false, message: 'Post must be at least 10 characters' };
  if (trimmed.length > POST_MAX) return { valid: false, message: 'Post must be under 2000 characters' };
  return { valid: true };
}

export function validateReplyBody(body: string): ValidationResult {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { valid: false, message: 'Reply cannot be empty' };
  if (trimmed.length > REPLY_MAX) return { valid: false, message: 'Reply must be under 2000 characters' };
  return { valid: true };
}
