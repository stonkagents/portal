/**
 * Purpose: Mounts the shared ConnectPrompt once (SolanaProvider renders it) and
 *          binds it to the module-level connect request, so `wallet.connect()`
 *          from any surface opens the same prompt and gets the same answer.
 */
'use client';

import { useSyncExternalStore } from 'react';
import { isConnectRequested, resolveConnect, subscribeConnectRequest } from '@/lib/wallet/connect-request';
import { ConnectPrompt } from './ConnectPrompt';

const serverSnapshot = () => false;

export function ConnectPromptHost() {
  const open = useSyncExternalStore(subscribeConnectRequest, isConnectRequested, serverSnapshot);
  return <ConnectPrompt open={open} onClose={() => resolveConnect(false)} onConnected={() => resolveConnect(true)} />;
}
