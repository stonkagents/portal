/**
 * Purpose: `ensureConnected()` for actions that need a wallet (Launch, Buy
 *          credits, trade): resolves true when a wallet is connected, opening
 *          the shared connect prompt first if it is not. The caller continues
 *          on true and does nothing on false.
 */
'use client';

import { useCallback } from 'react';
import { useWalletService } from '@/lib/wallet';

export function useConnectPrompt() {
  const wallet = useWalletService();
  const { connected, connect } = wallet;

  const ensureConnected = useCallback(async (): Promise<boolean> => {
    if (connected) return true;
    return connect();
  }, [connected, connect]);

  return {
    /** Open the prompt regardless of state; resolves like `ensureConnected`. */
    openConnectPrompt: connect,
    ensureConnected,
    connected,
    connecting: wallet.connecting,
  };
}
