/**
 * Purpose: Context that hands the lazily imported ConnectorKit module to the
 *          wallet layer. Null until SolanaProvider has loaded it, in which case
 *          useWalletService returns a loading stub instead of calling hooks
 *          that would throw without the provider context.
 *
 *          The type-only import keeps `@solana/connector/react` (and the
 *          web3.js it drags in) out of the main bundle (PERF-4); the only
 *          runtime import of that package is SolanaProvider's dynamic one.
 */
'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type * as ConnectorReact from '@solana/connector/react';

export type ConnectorModule = typeof ConnectorReact;

const ConnectorModuleContext = createContext<ConnectorModule | null>(null);

export function WalletReadyProvider({ connector, children }: { connector: ConnectorModule | null; children: ReactNode }) {
  return <ConnectorModuleContext.Provider value={connector}>{children}</ConnectorModuleContext.Provider>;
}

/** The loaded ConnectorKit module, or null while it is still loading (or when the real wallet is off). */
export function useConnectorModule(): ConnectorModule | null {
  return useContext(ConnectorModuleContext);
}

export function useWalletReady(): boolean {
  return useConnectorModule() !== null;
}
