/**
 * Purpose: Tests for UserProfile localStorage helpers
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getProfile,
  getOrCreateProfile,
  updateProfile,
  recordDaemonInstall,
  recordTokenLaunch,
  clearAllStoredData,
  STORAGE_KEY,
} from '../storage';
import type { UserProfile } from '../types';

beforeEach(() => {
  localStorage.clear();
});

describe('getProfile', () => {
  it('returns null when no profile exists', () => {
    expect(getProfile()).toBeNull();
  });

  it('returns parsed profile when stored', () => {
    const profile: UserProfile = {
      firstSeen: '2026-01-01T00:00:00.000Z',
      visitCount: 3,
      hasInstalledDaemon: true,
      launchedToken: null,
      launchWalletAddress: null,
      connectedSocials: [],
      tokenLaunchDismissed: false,
      lastSeen: '2026-01-03T00:00:00.000Z',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    expect(getProfile()).toEqual(profile);
  });

  it('returns null on corrupt JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{bad json');
    expect(getProfile()).toBeNull();
  });
});

describe('getOrCreateProfile', () => {
  it('creates a fresh profile on first call', () => {
    const profile = getOrCreateProfile();
    expect(profile.visitCount).toBe(1);
    expect(profile.hasInstalledDaemon).toBe(false);
    expect(profile.launchedToken).toBeNull();
    expect(profile.connectedSocials).toEqual([]);
    expect(profile.firstSeen).toBeTruthy();
    expect(profile.lastSeen).toBeTruthy();
  });

  it('returns existing profile on subsequent calls', () => {
    const first = getOrCreateProfile();
    const second = getOrCreateProfile();
    expect(second.firstSeen).toBe(first.firstSeen);
  });

  it('persists to localStorage', () => {
    getOrCreateProfile();
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });
});

describe('updateProfile', () => {
  it('merges partial updates', () => {
    getOrCreateProfile();
    const updated = updateProfile({ hasInstalledDaemon: true });
    expect(updated.hasInstalledDaemon).toBe(true);
    expect(updated.visitCount).toBe(1);
  });

  it('always sets lastSeen to a valid ISO date', () => {
    getOrCreateProfile();
    const updated = updateProfile({ visitCount: 2 });
    expect(new Date(updated.lastSeen).toISOString()).toBe(updated.lastSeen);
  });
});

describe('recordDaemonInstall', () => {
  it('sets hasInstalledDaemon to true', () => {
    getOrCreateProfile();
    const after = recordDaemonInstall();
    expect(after.hasInstalledDaemon).toBe(true);
  });
});

describe('recordTokenLaunch', () => {
  it('stores token data and wallet address', () => {
    getOrCreateProfile();
    const token = { name: 'TestAgent', ticker: 'TAGENT', imageDataUrl: null, contractAddr: 'So1234' };
    const after = recordTokenLaunch(token, 'wallet123');
    expect(after.launchedToken).toEqual(token);
    expect(after.launchWalletAddress).toBe('wallet123');
  });
});

describe('clearAllStoredData', () => {
  it('removes all stonkagents: keys and clears session storage', () => {
    localStorage.setItem('stonkagents:user', '{}');
    localStorage.setItem('stonkagents:other', 'data');
    localStorage.setItem('unrelated', 'keep');
    sessionStorage.setItem('session-data', 'val');

    clearAllStoredData();

    expect(localStorage.getItem('stonkagents:user')).toBeNull();
    expect(localStorage.getItem('stonkagents:other')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(sessionStorage.length).toBe(0);
  });
});
