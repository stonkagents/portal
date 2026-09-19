/**
 * Purpose: The tokens the owner may offer on the board (phase 1, section 3):
 *          every launch the connected wallet made on this platform
 *          (GET /api/launch/by-wallet) plus the token bound to the running
 *          agent (GET /api/peers/{id}/token), which the tracker accepts as the
 *          poster's own. Decimals come off the mint account itself, once per
 *          session, because the launch record does not carry them.
 */
'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLaunchesByWallet } from './use-launch-pending';
import { usePeerToken } from './use-peer-token';
import { fetchMintDecimals } from '@/lib/jupiter/mint-decimals';
import { useWalletService } from '@/lib/wallet';
import { useDaemon } from '@/providers/DaemonProvider';

export interface OwnedLaunchToken {
  mint: string;
  symbol: string;
  name: string;
}

export function useOwnedLaunchTokens(): { tokens: OwnedLaunchToken[]; isLoading: boolean } {
  const wallet = useWalletService();
  const { health } = useDaemon();
  const walletAddress = wallet.connected ? wallet.publicKey : null;
  const launches = useLaunchesByWallet(walletAddress);
  const peerToken = usePeerToken(health.peerId || null);

  const tokens = useMemo(() => {
    const out: OwnedLaunchToken[] = [];
    const seen = new Set<string>();
    for (const record of launches.data) {
      if (!record.mint || seen.has(record.mint)) continue;
      seen.add(record.mint);
      out.push({ mint: record.mint, symbol: record.symbol, name: record.name });
    }
    const own = peerToken.data;
    if (own?.contractAddr && !seen.has(own.contractAddr)) {
      out.push({ mint: own.contractAddr, symbol: own.ticker, name: own.name });
    }
    return out;
  }, [launches.data, peerToken.data]);

  return { tokens, isLoading: launches.isLoading || peerToken.isLoading };
}

/** The mint's decimals and program off the chain; idle without a mint. */
export function useMintDecimals(mint: string | null) {
  return useQuery({
    queryKey: ['mint-decimals', mint ?? ''],
    queryFn: () => fetchMintDecimals(mint as string),
    enabled: !!mint,
    staleTime: Infinity,
    retry: 1,
    meta: { skipGlobalErrorHandler: true },
  });
}
