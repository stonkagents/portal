/**
 * Purpose: Tests for useInstallerUnlocked — the installer is Step 2. The tracker's
 *          by-wallet answer is the truth; the local record only bridges the wait.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const wallet = vi.hoisted(() => ({ connected: false, publicKey: null as string | null }));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => wallet }));

const byWallet = vi.hoisted(() => ({
  first: null as Record<string, unknown> | null,
  isFetched: true,
  isError: false,
}));
vi.mock('@/lib/api/hooks/use-launch-pending', () => ({
  useLaunchesByWallet: () => ({ data: byWallet.first ? [byWallet.first] : [], ...byWallet }),
}));

import { useInstallerUnlocked } from '../use-installer-unlock';
import { launchStorageKey } from '@/app/_components/launch-storage';

const WALLET = 'Wa11et11111111111111111111111111111111111111';

beforeEach(() => {
  localStorage.clear();
  wallet.connected = false;
  wallet.publicKey = null;
  byWallet.first = null;
  byWallet.isFetched = true;
  byWallet.isError = false;
});

describe('useInstallerUnlocked', () => {
  it('is locked without a wallet, even with a launch remembered locally', () => {
    localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: 'MinT', name: 'A', symbol: 'A' }));
    const { result } = renderHook(() => useInstallerUnlocked());
    expect(result.current).toBe(false);
  });

  it('is locked for a wallet the tracker lists no launch for', () => {
    wallet.connected = true;
    wallet.publicKey = WALLET;
    const { result } = renderHook(() => useInstallerUnlocked());
    expect(result.current).toBe(false);
  });

  it('unlocks when the tracker lists a launch for the wallet', () => {
    wallet.connected = true;
    wallet.publicKey = WALLET;
    byWallet.first = { mint: 'MinT' };
    const { result } = renderHook(() => useInstallerUnlocked());
    expect(result.current).toBe(true);
  });

  it('lets the local record bridge the wait for the tracker, but not a tracker that answered with nothing', () => {
    wallet.connected = true;
    wallet.publicKey = WALLET;
    localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: 'MinT', name: 'A', symbol: 'A' }));

    byWallet.isFetched = false;
    const pending = renderHook(() => useInstallerUnlocked());
    expect(pending.result.current).toBe(true);

    byWallet.isFetched = true;
    byWallet.isError = true;
    const outage = renderHook(() => useInstallerUnlocked());
    expect(outage.result.current).toBe(true);

    byWallet.isError = false;
    const answered = renderHook(() => useInstallerUnlocked());
    expect(answered.result.current).toBe(false);
  });

  it('ignores a launch stored under another wallet', () => {
    wallet.connected = true;
    wallet.publicKey = WALLET;
    localStorage.setItem(launchStorageKey('someone-else'), JSON.stringify({ mint: 'MinT', name: 'A', symbol: 'A' }));
    byWallet.isFetched = false;
    const { result } = renderHook(() => useInstallerUnlocked());
    expect(result.current).toBe(false);
  });
});
