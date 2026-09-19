/**
 * Purpose: Mock wallet implementation — simulates a wallet connect with hardcoded data.
 *          Used when NEXT_PUBLIC_USE_REAL_WALLET=false (default).
 */
'use client';

import { useState, useCallback } from 'react';
import type { WalletService } from './types';
import { abbreviateAddress } from './types';

const MOCK_ADDRESS = '7a3bK9rNqP2xM5vT8wDf6jHk4nLs1gYc9f2cRtEm';
const MOCK_BALANCE = 2.847;
const CONNECT_DELAY_MS = 1500;

export function useMockWallet(): WalletService {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    await new Promise(resolve => setTimeout(resolve, CONNECT_DELAY_MS));
    setConnected(true);
    setConnecting(false);
    return true;
  }, []);

  const disconnect = useCallback(async () => {
    setConnected(false);
  }, []);

  const fetchBalance = useCallback(async () => {
    // No-op — mock balance is static
  }, []);

  const sign = useCallback(async (tx: Parameters<WalletService['sign']>[0]) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return tx;
  }, []);

  const signAndSend = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const mockSig = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return { signature: mockSig };
  }, []);

  return {
    installed: true,
    connected,
    publicKey: connected ? MOCK_ADDRESS : null,
    shortAddress: connected ? abbreviateAddress(MOCK_ADDRESS) : null,
    balance: connected ? MOCK_BALANCE : null,
    connecting,
    error,
    connect,
    disconnect,
    fetchBalance,
    sign,
    signAndSend,
  };
}
