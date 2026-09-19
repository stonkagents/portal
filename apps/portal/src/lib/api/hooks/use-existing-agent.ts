/**
 * The agent the connected wallet has already launched, if any.
 *
 * One agent per wallet: once a launch exists, every "Launch Agent" entry point
 * becomes a link to that agent instead. Three sources agree on it, in order:
 * every launch the tracker holds for this wallet (`/api/launch/by-wallet`,
 * claimed or not — the authoritative answer), the tracker's unclaimed launches
 * (`/api/launch/pending`, for a tracker without the by-wallet read), and the
 * launch this browser remembered when it signed the transaction (wallet-keyed).
 * The tracker's record wins on identity.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWalletService } from '@/lib/wallet';
import { useLaunchesByWallet, usePendingLaunches } from '@/lib/api/hooks/use-launch-pending';
import { readStoredLaunch, type StoredLaunch } from '@/app/_components/launch-storage';

export interface ExistingAgent {
  mint: string;
  name: string;
  symbol: string;
  href: string;
}

export function useExistingAgent(): ExistingAgent | null {
  const wallet = useWalletService();
  const walletAddress = wallet.connected ? wallet.publicKey : null;
  const { first: byWallet } = useLaunchesByWallet(walletAddress);
  const { first: pending } = usePendingLaunches(walletAddress);
  const [stored, setStored] = useState<StoredLaunch | null>(null);

  useEffect(() => {
    setStored(readStoredLaunch(walletAddress));
  }, [walletAddress]);

  return useMemo(() => {
    if (!walletAddress) return null;
    const launch = byWallet ?? pending ?? stored;
    if (!launch) return null;
    return { mint: launch.mint, name: launch.name, symbol: launch.symbol, href: `/tokens/${launch.mint}` };
  }, [walletAddress, byWallet, pending, stored]);
}
