/**
 * Purpose: Once-per-wallet-per-day memory for the devnet drip, in this browser only.
 *          Key `dev-drip:<wallet>` holds the UTC day (YYYY-MM-DD) the drip was asked for.
 *          The tracker enforces the real 24 h cooldown; this only spares it a call.
 */

export const DEV_DRIP_STORAGE_PREFIX = 'dev-drip:';

export function devDripStorageKey(wallet: string): string {
  return `${DEV_DRIP_STORAGE_PREFIX}${wallet}`;
}

/** UTC calendar day, e.g. '2026-09-14'. */
export function dripDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function hasDrippedToday(wallet: string, now: Date = new Date()): boolean {
  try {
    return localStorage.getItem(devDripStorageKey(wallet)) === dripDay(now);
  } catch {
    return false;
  }
}

export function markDrippedToday(wallet: string, now: Date = new Date()): void {
  try {
    localStorage.setItem(devDripStorageKey(wallet), dripDay(now));
  } catch {
    /* private mode or blocked storage: the tracker still enforces the cooldown */
  }
}
