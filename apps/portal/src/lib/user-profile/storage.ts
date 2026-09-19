/**
 * Purpose: localStorage helpers for UserProfile — read, write, update, clear.
 *          Single key `stonkagents:user` stores the entire profile as JSON.
 */

import type { UserProfile } from './types';
import type { LaunchedToken } from '@/components/features/token-wizard';

const STORAGE_KEY = 'stonkagents:user';

function createDefault(): UserProfile {
  const now = new Date().toISOString();
  return {
    firstSeen: now,
    visitCount: 1,
    hasInstalledDaemon: false,
    launchedToken: null,
    launchWalletAddress: null,
    connectedSocials: [],
    tokenLaunchDismissed: false,
    lastSeen: now,
  };
}

/** Read profile from localStorage. Returns null if none exists or parse fails. */
export function getProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

/** Write full profile to localStorage. */
function setProfile(profile: UserProfile): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

/** Get existing profile or create a new one on first visit. */
export function getOrCreateProfile(): UserProfile {
  const existing = getProfile();
  if (existing) return existing;
  const fresh = createDefault();
  setProfile(fresh);
  return fresh;
}

/** Partially update the profile (merges with existing). */
export function updateProfile(patch: Partial<UserProfile>): UserProfile {
  const current = getOrCreateProfile();
  const updated = { ...current, ...patch, lastSeen: new Date().toISOString() };
  setProfile(updated);
  return updated;
}

/** Record that the daemon was successfully installed/detected. */
export function recordDaemonInstall(): UserProfile {
  return updateProfile({ hasInstalledDaemon: true });
}

/** Record a launched token with wallet address. */
export function recordTokenLaunch(token: LaunchedToken, walletAddress: string | null): UserProfile {
  return updateProfile({ launchedToken: token, launchWalletAddress: walletAddress });
}

/** Clear ALL StonkAgents localStorage keys, dev/debug nuclear option. */
export function clearAllStoredData(): void {
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('stonkagents:')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  sessionStorage.clear();
}

export { STORAGE_KEY };
