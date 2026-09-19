/**
 * Story: Home two-step flow — Step 1 Launchpad, Step 2 Run your agent
 * Purpose: Per-wallet record of the token a creator launched, so the home page can
 *          resume Step 2 on the next visit without waiting on the tracker.
 *          Key: `stonkagents:launch:<wallet>`.
 */

export const LAUNCH_STORAGE_PREFIX = 'stonkagents:launch:';

export interface StoredLaunch {
  /** Base58 mint address of the launched token. */
  mint: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  /** The pinned 128 px copy of imageUrl, when the launch made one. */
  imageThumbUrl?: string;
  /** Mint of the quote asset the token trades against. */
  quoteMint?: string;
  /** Symbol of that quote asset (e.g. STONK), when the launch flow knew it. */
  quoteSymbol?: string;
  poolId?: string;
  launchedAt?: string;
  /** True once POST /api/launch/claim bound the launch to this peer. */
  bound?: boolean;
  /** AI credits the tracker granted when the launch was bound. */
  creditsGranted?: number;
  /**
   * True for a record without a LaunchLab pool/quote — written before the
   * launchpad (or copied forward by the storage migration). Never trusted on
   * its own; the home page re-verifies it with the tracker every time.
   */
  legacy?: boolean;
}

/** A record that predates LaunchLab: no pool and no quote mint. */
export function isLegacyStoredLaunch(launch: Pick<StoredLaunch, 'poolId' | 'quoteMint'>): boolean {
  return !launch.poolId || !launch.quoteMint;
}

export function launchStorageKey(wallet: string): string {
  return `${LAUNCH_STORAGE_PREFIX}${wallet}`;
}

function isStoredLaunch(value: unknown): value is StoredLaunch {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.mint === 'string' && v.mint.length > 0 && typeof v.symbol === 'string';
}

/** The launch this browser recorded for `wallet`, or null when there is none. */
export function readStoredLaunch(wallet: string | null | undefined): StoredLaunch | null {
  if (!wallet || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(launchStorageKey(wallet));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredLaunch(parsed)) return null;
    return isLegacyStoredLaunch(parsed) ? { ...parsed, legacy: true } : parsed;
  } catch {
    return null;
  }
}

/** Record a launch for `wallet`. A blocked or full store must never break the flow. */
export function writeStoredLaunch(wallet: string | null | undefined, launch: StoredLaunch): void {
  if (!wallet || typeof localStorage === 'undefined' || !launch.mint) return;
  try {
    localStorage.setItem(launchStorageKey(wallet), JSON.stringify(launch));
  } catch {
    /* A launch that already landed on chain must not fail on storage. */
  }
}

/** Flag the stored launch as bound to a peer and remember the reward. */
export function markStoredLaunchBound(wallet: string | null | undefined, mint: string, creditsGranted: number): void {
  const current = readStoredLaunch(wallet);
  if (!current || current.mint !== mint) return;
  writeStoredLaunch(wallet, { ...current, bound: true, creditsGranted });
}

export function clearStoredLaunch(wallet: string | null | undefined): void {
  if (!wallet || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(launchStorageKey(wallet));
  } catch {
    /* Nothing to do — the next write overwrites it anyway. */
  }
}
