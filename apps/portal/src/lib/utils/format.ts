/**
 * Purpose: Pure formatting helpers for consistent display across the app
 */

/**
 * Truncate a AgentID (or any long ID) for display.
 * Format: first 16 chars + "..." + last 4 chars → "12D3KooWMvhwb9cd...SZbv"
 */
export function truncateAgentId(id: string | undefined | null, fallback = '-'): string {
  if (!id) return fallback;
  if (id.length <= 24) return id;
  return `${id.slice(0, 16)}...${id.slice(-4)}`;
}

/** Abbreviate a peer ID for display: first 6 + ... + last 5 (e.g. "12D3Ko...9EWLvg"). */
export function abbreviatePeerID(id: string | undefined | null, fallback = ''): string {
  if (!id) return fallback;
  if (id.length <= 13) return id;
  return `${id.slice(0, 6)}...${id.slice(-5)}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3m ago", "2h ago", "5d ago". Accepts an ISO string, epoch millis, or a Date. */
export function timeAgo(value: string | number | Date | null | undefined, now: number = Date.now()): string {
  if (value == null) return '-';
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return '-';
  const diff = Math.max(0, now - ms);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Full local date and time ("Sep 17, 2026, 2:05 PM"), for the title of a relative
 * label like "3m ago". Empty for nothing or an unparsable value.
 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value == null) return '';
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Raw token units as whole tokens: "1,500" or "0.25". Decimals of 0 print the raw number. */
export function formatRawUnits(raw: number, decimals: number): string {
  if (!Number.isFinite(raw)) return '0';
  const whole = decimals > 0 ? raw / 10 ** decimals : raw;
  return whole.toLocaleString(undefined, { maximumFractionDigits: Math.min(decimals, 6) });
}

/** Whole tokens typed by a user as raw units, rounded to an integer; NaN and negatives give 0. */
export function toRawUnits(whole: number, decimals: number): number {
  if (!Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round(whole * 10 ** Math.max(0, decimals));
}
