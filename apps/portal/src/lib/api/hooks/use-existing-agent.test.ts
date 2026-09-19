/**
 * Purpose: Tests for useExistingAgent — the one-agent-per-wallet answer the
 *          header and hero read. The tracker's by-wallet record wins, then its
 *          pending (unclaimed) record, then what this browser remembered.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockWallet: { connected: boolean; publicKey: string | null } = { connected: false, publicKey: null };
vi.mock('@/lib/wallet', () => ({
  useWalletService: () => mockWallet,
}));

let mockByWalletFirst: Record<string, unknown> | null = null;
let mockPendingFirst: Record<string, unknown> | null = null;
vi.mock('@/lib/api/hooks/use-launch-pending', () => ({
  useLaunchesByWallet: () => ({ data: mockByWalletFirst ? [mockByWalletFirst] : [], first: mockByWalletFirst }),
  usePendingLaunches: () => ({ data: mockPendingFirst ? [mockPendingFirst] : [], first: mockPendingFirst }),
}));

import { useExistingAgent } from './use-existing-agent';
import { launchStorageKey } from '@/app/_components/launch-storage';

const WALLET = 'Wa11et11111111111111111111111111111111111111';

beforeEach(() => {
  localStorage.clear();
  mockWallet = { connected: false, publicKey: null };
  mockByWalletFirst = null;
  mockPendingFirst = null;
});

describe('useExistingAgent', () => {
  it('is null without a connected wallet, whatever is remembered', () => {
    localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: 'MintA', name: 'A', symbol: 'A' }));
    const { result } = renderHook(() => useExistingAgent());
    expect(result.current).toBeNull();
  });

  it('names the agent from the tracker by-wallet record first, even once claimed', () => {
    mockWallet = { connected: true, publicKey: WALLET };
    mockByWalletFirst = { mint: 'MintClaimed', name: 'Claimed', symbol: 'CLM', peer_id: 'peer-1', agentBound: true };
    mockPendingFirst = { mint: 'MintPending', name: 'Pending', symbol: 'PND' };
    localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: 'MintStored', name: 'Stored', symbol: 'STO' }));

    const { result } = renderHook(() => useExistingAgent());

    expect(result.current).toEqual({ mint: 'MintClaimed', name: 'Claimed', symbol: 'CLM', href: '/tokens/MintClaimed' });
  });

  it('falls back to the pending record, then to the browser record', () => {
    mockWallet = { connected: true, publicKey: WALLET };
    mockPendingFirst = { mint: 'MintPending', name: 'Pending', symbol: 'PND' };
    localStorage.setItem(launchStorageKey(WALLET), JSON.stringify({ mint: 'MintStored', name: 'Stored', symbol: 'STO' }));

    const { result, rerender } = renderHook(() => useExistingAgent());
    expect(result.current?.mint).toBe('MintPending');

    mockPendingFirst = null;
    rerender();
    expect(result.current?.mint).toBe('MintStored');
  });

  it('is null for a connected wallet with no launch anywhere', () => {
    mockWallet = { connected: true, publicKey: WALLET };
    const { result } = renderHook(() => useExistingAgent());
    expect(result.current).toBeNull();
  });
});
