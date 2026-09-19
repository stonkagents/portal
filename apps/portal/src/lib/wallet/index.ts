/**
 * Purpose: Barrel export — useWalletService() routes to mock or real wallet based on env flag.
 *          When real wallet is enabled but ConnectorKit is still loading (deferred import),
 *          returns an inert LOADING_WALLET stub to avoid provider-missing errors.
 */
'use client';

import type { WalletService } from './types';
import { useMockWallet } from './mock-wallet';
import { useRealWallet } from './real-wallet';
import { requestConnect } from './connect-request';
import { useWalletReady } from '@/providers/WalletReadyProvider';

const USE_REAL_WALLET = process.env.NEXT_PUBLIC_USE_REAL_WALLET === 'true';

const NOOP_ASYNC = async () => {};

/**
 * Inert stub returned while ConnectorKit is loading (deferred import). A
 * connect tap in that window still opens the shared prompt, which shows its
 * loading state and lists wallets as soon as the connector is in.
 */
const LOADING_WALLET: WalletService = {
  installed: false,
  connected: false,
  publicKey: null,
  shortAddress: null,
  balance: null,
  connecting: false,
  error: null,
  connect: requestConnect,
  disconnect: NOOP_ASYNC,
  fetchBalance: NOOP_ASYNC,
  sign: () => Promise.reject(new Error('Wallet provider still loading')),
  signAndSend: () => Promise.reject(new Error('Wallet provider still loading')),
};

/**
 * Guard wrapper — returns LOADING_WALLET stub until ConnectorKit AppProvider mounts.
 * The conditional useRealWallet() call is safe: SolanaProvider changes the React tree
 * structure when loading completes, causing a full remount of all children. Each mount
 * instance sees a stable hook call count.
 */
function useGuardedRealWallet(): WalletService {
  const ready = useWalletReady();
  if (!ready) return LOADING_WALLET;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Safe: tree remounts on ready change
  return useRealWallet();
}

// Select implementation at module level — env var is a build-time constant.
// Only the selected hook is called at runtime (avoids missing provider errors).
const useWalletImpl = USE_REAL_WALLET ? useGuardedRealWallet : useMockWallet;

/**
 * Returns the appropriate wallet service based on NEXT_PUBLIC_USE_REAL_WALLET.
 * When false (default): mock wallet with simulated connect/balance.
 * When true: any Wallet Standard wallet via @solana/connector (ConnectorKit),
 * picked in the shared connect prompt.
 * While ConnectorKit loads, returns an inert stub (LOADING_WALLET).
 */
export function useWalletService(): WalletService {
  return useWalletImpl();
}

export type { WalletService } from './types';
export { abbreviateAddress } from './types';
