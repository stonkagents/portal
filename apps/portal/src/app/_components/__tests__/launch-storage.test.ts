/**
 * Purpose: Tests for the per-wallet launch record behind `stonkagents:launch:<wallet>`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LAUNCH_STORAGE_PREFIX,
  launchStorageKey,
  readStoredLaunch,
  writeStoredLaunch,
  markStoredLaunchBound,
  clearStoredLaunch,
  isLegacyStoredLaunch,
} from '../launch-storage';

const WALLET = 'Wa11et11111111111111111111111111111111111111';
const MINT = 'MinT1111111111111111111111111111111111111111';
const LAUNCH = { mint: MINT, name: 'Agent One', symbol: 'AGENT' };

beforeEach(() => {
  localStorage.clear();
});

describe('launchStorageKey', () => {
  it('scopes the record to one wallet', () => {
    expect(launchStorageKey(WALLET)).toBe(`${LAUNCH_STORAGE_PREFIX}${WALLET}`);
  });
});

describe('readStoredLaunch / writeStoredLaunch', () => {
  it('round-trips a launch', () => {
    writeStoredLaunch(WALLET, LAUNCH);
    expect(readStoredLaunch(WALLET)).toMatchObject(LAUNCH);
  });

  it('returns null for another wallet', () => {
    writeStoredLaunch(WALLET, LAUNCH);
    expect(readStoredLaunch('someone-else')).toBeNull();
  });

  it('returns null without a wallet', () => {
    expect(readStoredLaunch(null)).toBeNull();
  });

  it('ignores malformed JSON', () => {
    localStorage.setItem(launchStorageKey(WALLET), '{not json');
    expect(readStoredLaunch(WALLET)).toBeNull();
  });

  it('ignores a record with no mint', () => {
    localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ name: 'x', symbol: 'X' }));
    expect(readStoredLaunch(WALLET)).toBeNull();
  });

  it('does not write without a wallet', () => {
    writeStoredLaunch(null, LAUNCH);
    expect(localStorage.length).toBe(0);
  });
});

describe('markStoredLaunchBound', () => {
  it('records the binding and the granted credits', () => {
    writeStoredLaunch(WALLET, LAUNCH);
    markStoredLaunchBound(WALLET, MINT, 250);

    const stored = readStoredLaunch(WALLET);
    expect(stored?.bound).toBe(true);
    expect(stored?.creditsGranted).toBe(250);
  });

  it('leaves a different mint alone', () => {
    writeStoredLaunch(WALLET, LAUNCH);
    markStoredLaunchBound(WALLET, 'other-mint', 250);
    expect(readStoredLaunch(WALLET)?.bound).toBeUndefined();
  });
});

describe('clearStoredLaunch', () => {
  it('removes the record', () => {
    writeStoredLaunch(WALLET, LAUNCH);
    clearStoredLaunch(WALLET);
    expect(readStoredLaunch(WALLET)).toBeNull();
  });
});

describe('legacy records', () => {
  it('flags a record without a LaunchLab pool or quote as legacy on read', () => {
    localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: MINT, name: 'Jail', symbol: 'JAIL' }));
    expect(readStoredLaunch(WALLET)?.legacy).toBe(true);
  });

  it('does not flag a LaunchLab record', () => {
    writeStoredLaunch(WALLET, { ...LAUNCH, poolId: 'Poo1', quoteMint: 'QuoteMint' });
    expect(readStoredLaunch(WALLET)?.legacy).toBeUndefined();
  });

  it('isLegacyStoredLaunch needs both a pool and a quote mint', () => {
    expect(isLegacyStoredLaunch({})).toBe(true);
    expect(isLegacyStoredLaunch({ poolId: 'Poo1' })).toBe(true);
    expect(isLegacyStoredLaunch({ quoteMint: 'Q' })).toBe(true);
    expect(isLegacyStoredLaunch({ poolId: 'Poo1', quoteMint: 'Q' })).toBe(false);
  });
});
