/**
 * Purpose: "Has the connected wallet launched a token?" for surfaces outside the
 *          home page (the chat setup panel). The installer is Step 2 of the
 *          product and is never handed out before Step 1.
 *
 * The tracker's `by-wallet` answer is the truth; the per-wallet localStorage
 * record only bridges the moment before the tracker answers, or an outage.
 * Once the tracker has answered with nothing, the local record does not count.
 * No wallet means locked. The home page derives the same flag from its richer
 * launch state (see useHomePage `installerUnlocked`).
 */
'use client';

import { useEffect, useState } from 'react';
import { useWalletService } from '@/lib/wallet';
import { useLaunchesByWallet } from '@/lib/api/hooks/use-launch-pending';
import { readStoredLaunch } from '@/app/_components/launch-storage';

export function useInstallerUnlocked(): boolean {
  const wallet = useWalletService();
  const walletAddress = wallet.connected ? wallet.publicKey : null;
  const byWallet = useLaunchesByWallet(walletAddress);
  const [hasStoredLaunch, setHasStoredLaunch] = useState(false);

  /* localStorage is read after mount so the server and client render the same first frame. */
  useEffect(() => {
    setHasStoredLaunch(readStoredLaunch(walletAddress) !== null);
  }, [walletAddress]);

  if (!walletAddress) return false;
  if (byWallet.first) return true;
  return hasStoredLaunch && (byWallet.isError || !byWallet.isFetched);
}
