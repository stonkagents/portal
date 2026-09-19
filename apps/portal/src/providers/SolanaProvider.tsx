/**
 * Purpose: Wallet provider — defers ConnectorKit initialization to after first paint.
 *          Dynamically imports @solana/connector/react so the module-scope crypto
 *          setup doesn't block React mount (~3.6s savings). While loading, children
 *          render with the connector module unset so wallet hooks return stubs.
 *
 *          The import happens once, right after mount, on purpose: ConnectorKit's
 *          AppProvider has to wrap the whole tree, and swapping it in later would
 *          remount every provider below it (query cache, daemon install watch,
 *          an open wizard). Doing it before the visitor can interact keeps that
 *          remount invisible. What IS deferred is the bytes: nothing else in the
 *          main bundle imports the connector or web3.js (PERF-4).
 */
'use client';

import { useState, useEffect, type ReactNode } from 'react';
import type { AppProviderProps, ConnectorConfig } from '@solana/connector/react';
import { WalletReadyProvider, type ConnectorModule } from './WalletReadyProvider';
import { ConnectPromptHost } from '@/components/features/wallet/ConnectPromptHost';
import { config } from '@/config';

const USE_REAL_WALLET = config.solana.useRealWallet;
/**
 * The wallet adapter's cluster comes from the one switch in `@/config`
 * (NEXT_PUBLIC_SOLANA_CLUSTER), so the wallet, the explorer links and the
 * launch engine can never disagree about which chain this build is on.
 */
const SOLANA_NETWORK = config.solana.walletNetwork;
const SOLANA_RPC_URL = config.solana.rpcUrl;
const APP_NAME = config.brand.name;

interface LoadedModule {
  mod: ConnectorModule;
  config: ConnectorConfig;
  mobile: NonNullable<AppProviderProps['mobile']>;
}

/**
 * Mobile Wallet Adapter identity (Android: Phantom, Solflare, Backpack … through
 * the system wallet chooser). ConnectorKit only registers MWA when this is
 * passed. iOS has no MWA; the connect prompt deep-links into the wallet's
 * in-app browser instead.
 */
function mobileConfig(): LoadedModule['mobile'] {
  // The identity a wallet shows for this dapp: the brand name on the official domain.
  const uri = typeof window !== 'undefined' ? window.location.origin : `https://${config.brand.domain}`;
  return {
    appIdentity: { name: APP_NAME, uri, icon: '/icons/icon-192x192.png' },
    chains: [SOLANA_NETWORK === 'mainnet-beta' ? 'solana:mainnet' : 'solana:devnet'],
  };
}

/**
 * Conditionally wraps children with ConnectorKit AppProvider.
 * When USE_REAL_WALLET is false, renders children with wallet stub (zero overhead).
 * When true, defers heavy import until after first paint, then mounts AppProvider.
 */
export function SolanaProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<LoadedModule | null>(null);

  useEffect(() => {
    if (!USE_REAL_WALLET) return;

    let cancelled = false;
    Promise.all([import('@solana/connector/react'), import('@solana/connector')]).then(([mod, core]) => {
      if (cancelled) return;
      // The connector reads balances through its cluster URL. Left to its default
      // it uses the public RPC, which on mainnet refuses browser requests, so
      // every wallet showed 0 SOL on staging. Point the cluster at our RPC.
      const cluster =
        SOLANA_NETWORK === 'mainnet-beta'
          ? core.createSolanaMainnet({ url: SOLANA_RPC_URL })
          : core.createSolanaDevnet({ url: SOLANA_RPC_URL });
      const config = mod.getDefaultConfig({
        appName: APP_NAME,
        network: SOLANA_NETWORK,
        clusters: [cluster],
        autoConnect: true,
        enableMobile: true,
      });
      // Persistence uses ConnectorKit’s default storage adapters (account/cluster/wallet), not raw localStorage.
      setLoaded({ mod, config, mobile: mobileConfig() });
    }).catch((err: unknown) => {
      // A blocked or stale chunk (a deploy while the tab was open): the connect
      // prompt keeps its loading line and, after a while, tells the visitor to reload.
      console.error('[SolanaProvider] the wallet module did not load', err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!USE_REAL_WALLET || !loaded) {
    return (
      <WalletReadyProvider connector={null}>
        <ConnectPromptHost />
        {children}
      </WalletReadyProvider>
    );
  }

  const { mod, config, mobile } = loaded;
  const Provider = mod.AppProvider;
  return (
    <Provider connectorConfig={config} mobile={mobile}>
      <WalletReadyProvider connector={mod}>
        <ConnectPromptHost />
        {children}
      </WalletReadyProvider>
    </Provider>
  );
}
