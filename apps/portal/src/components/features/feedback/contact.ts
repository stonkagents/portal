/**
 * Purpose: Contact classification for the feedback dialog (FB-1).
 *
 * "@handle or email" is unactionable: "@bob" alone never says which platform
 * bob lives on. This reads what the reporter typed and decides what it is: an
 * email or a phone number is self-describing, a bare handle is not and needs
 * a platform pick before a reply is possible.
 *
 * Contact stays optional end to end: an empty box is always fine, and an
 * unreadable one only warns. Feedback we cannot reply to beats feedback we
 * never got.
 */

import type { FeedbackContactVia } from '@/lib/api/feedback';

export type ContactPlatform = FeedbackContactVia;

/** The platforms a bare handle could belong to (email and phone self-describe). */
export const HANDLE_PLATFORMS = [
  { key: 'telegram', label: 'Telegram' },
  { key: 'twitter', label: 'X' },
  { key: 'discord', label: 'Discord' },
] as const satisfies readonly { key: ContactPlatform; label: string }[];

export type ContactClass =
  | { kind: 'empty' }
  | { kind: 'email' }
  | { kind: 'phone' }
  /** A plausible handle; usable once a platform is picked. */
  | { kind: 'handle' }
  /** Non-empty but unreadable; `hint` is the inline nudge, never a blocker. */
  | { kind: 'invalid'; hint: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS_RE = /^\+?[\d\s().-]+$/;
const HANDLE_RE = /^[a-z0-9_.-]{2,32}$/i;

export function classifyContact(raw: string): ContactClass {
  const v = raw.trim();
  if (!v) return { kind: 'empty' };

  /* An @ past position 0 is an email attempt; "@bob" has its @ at 0 and is a handle. */
  if (v.indexOf('@', 1) > 0) {
    if (EMAIL_RE.test(v)) return { kind: 'email' };
    return { kind: 'invalid', hint: 'That looks like an email. Finish the part after the @ (it needs a dot).' };
  }

  if (v.startsWith('+') || PHONE_CHARS_RE.test(v)) {
    const digits = v.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) return { kind: 'phone' };
    return { kind: 'invalid', hint: 'That looks like a phone number. It needs 7 to 15 digits.' };
  }

  const body = v.startsWith('@') ? v.slice(1) : v;
  if (HANDLE_RE.test(body)) return { kind: 'handle' };

  return { kind: 'invalid', hint: 'That does not read as a contact. Try an email, a +phone number, or an @handle.' };
}
