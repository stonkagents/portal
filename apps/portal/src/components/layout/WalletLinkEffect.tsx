'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Modal } from '@/components/ui';
import { useDaemon } from '@/providers/DaemonProvider';
import { useWalletService } from '@/lib/wallet';
import { abbreviateAddress } from '@/lib/wallet/types';
import { daemonApi } from '@/lib/api/daemon';
import { queryKeys } from '@/lib/api/keys';
import { usePeerMe } from '@/lib/api/hooks/use-board-peers';
import { appConfig } from '@/lib/config/app.config';

const MAX_LINK_RETRIES = 5;

/**
 * When both daemon and wallet are connected, links the wallet to the current peer on the tracker.
 * Retries on failure (up to MAX_LINK_RETRIES) so transient daemon/tracker issues don't leave wallet unlinked.
 *
 * The linked wallet carries money since phase 1 (token offers are verified
 * against it, payouts land in it), so a wallet that differs from the one
 * already linked is never adopted silently: the owner is asked to switch or
 * keep, once per connected address. Without a link yet, the wallet is linked
 * as before.
 */
export function WalletLinkEffect() {
  const { connected, health } = useDaemon();
  const wallet = useWalletService();
  const qc = useQueryClient();
  const { data: me, isFetched: meFetched } = usePeerMe();
  const lastLinkedRef = useRef<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  /* The address the owner was asked about and said Keep current to; asked again only for another address. */
  const [declined, setDeclined] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const address = wallet.publicKey?.trim() ?? null;
  const linked = meFetched ? (me?.walletAddress ?? null) : undefined;
  const ready = appConfig.useRealDaemon && connected && !!health.peerId && wallet.connected && !!address;
  /* Undefined linked = peers/me not answered yet (or the route is missing): wait, do not guess. */
  const needsConfirmation = ready && linked !== undefined && linked !== null && linked !== address && confirmed !== address;
  const askOpen = needsConfirmation && declined !== address;

  useEffect(() => {
    if (!address) {
      lastLinkedRef.current = null;
      return;
    }
    if (!ready || linked === undefined || needsConfirmation) return;
    if (lastLinkedRef.current === address) return;
    if (retryTrigger > MAX_LINK_RETRIES) return;
    lastLinkedRef.current = address;
    daemonApi
      .linkWallet(address)
      .then(result => {
        if (result?.success) {
          qc.invalidateQueries({ queryKey: queryKeys.board.me });
          return;
        }
        lastLinkedRef.current = null;
        setRetryTrigger(r => r + 1);
      })
      .catch(() => {
        lastLinkedRef.current = null;
        setRetryTrigger(r => r + 1);
      });
  }, [ready, address, linked, needsConfirmation, retryTrigger, qc]);

  const switchWallet = async () => {
    if (!address) return;
    setSwitching(true);
    try {
      const result = await daemonApi.linkWallet(address);
      if (result?.success) {
        lastLinkedRef.current = address;
        setConfirmed(address);
        qc.invalidateQueries({ queryKey: queryKeys.board.me });
      }
    } catch {
      /* the dialog stays open; the owner can try Switch again or keep the current wallet */
    } finally {
      setSwitching(false);
    }
  };

  if (!askOpen || !address || !linked) return null;

  return (
    <Modal open onClose={() => setDeclined(address)} title="Switch the linked wallet?" maxWidth="max-w-md">
      <div data-testid="wallet-relink">
        <p className="text-sm text-text-secondary mb-4" data-testid="wallet-relink-text">
          This agent is linked to {abbreviateAddress(linked)}. Switch it to {abbreviateAddress(address)}? Payouts and token offers will use
          the new wallet.
        </p>
        <div className="flex gap-2 justify-end flex-wrap">
          <Button variant="secondary" size="sm" data-testid="wallet-relink-keep" onClick={() => setDeclined(address)} disabled={switching}>
            Keep current
          </Button>
          <Button variant="primary" size="sm" data-testid="wallet-relink-switch" onClick={switchWallet} disabled={switching}>
            {switching ? 'Switching...' : 'Switch'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
