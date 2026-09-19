import type { Connection } from '@solana/web3.js';
import { appConfig } from '@/lib/config/app.config';
import { config } from '@/config';
import { createFailoverFetch } from './rpc-fetch';

/** The fetch every portal Connection uses: primary RPC, fallback on a provider fault. */
export function rpcFetch(): typeof fetch {
  return createFailoverFetch({
    primary: config.solana.rpcUrl,
    fallback: config.solana.rpcFallbackUrl,
    onFailover: reason => console.warn(`[rpc] primary RPC failed (${reason}); using fallback`),
  });
}

/** web3.js on demand: pages that never read the chain do not ship it. */
export function loadWeb3() {
  return import('@solana/web3.js');
}

let sharedConnection: Connection | null = null;

/** One Connection per RPC URL, so a grid of cards does not open ten. */
export async function getSolanaConnection(): Promise<Connection> {
  if (!sharedConnection) {
    const { Connection } = await loadWeb3();
    sharedConnection = new Connection(appConfig.solanaRpcUrl, { commitment: 'confirmed', fetch: rpcFetch() });
  }
  return sharedConnection;
}
