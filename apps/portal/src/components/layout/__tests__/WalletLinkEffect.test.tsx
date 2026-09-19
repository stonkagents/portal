/**
 * Purpose: Connecting a wallet links it to the agent only while no wallet is
 *          linked yet. With a different wallet already linked (peers/me), the
 *          owner is asked: Keep current leaves the link alone (and is not
 *          asked again for that address), Switch is the only path that links
 *          the new wallet. Nothing is linked while peers/me has not answered.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const WA = 'FWxdnjw6oYjRWHxBrmQ9eAQoWmn1z1fYNxU7mNjRZtho';
const WX = 'E312TeQmY4ZbXH1i2R6QeJt8h4Y5Y7bKGxNMLg6CsFdy4';

const linkWallet = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock('@/lib/api/daemon', () => ({ daemonApi: { linkWallet } }));
vi.mock('@/lib/config/app.config', () => ({ appConfig: { useRealDaemon: true } }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => ({ connected: true, health: { peerId: 'me' } }) }));
const walletState = vi.hoisted(() => ({ connected: true, publicKey: 'E312TeQmY4ZbXH1i2R6QeJt8h4Y5Y7bKGxNMLg6CsFdy4' as string | null }));
vi.mock('@/lib/wallet', () => ({ useWalletService: () => walletState }));
const peers = vi.hoisted(() => ({ me: { peerId: 'me', walletAddress: null as string | null } as { peerId: string; walletAddress: string | null } | null, fetched: true }));
vi.mock('@/lib/api/hooks/use-board-peers', () => ({ usePeerMe: () => ({ data: peers.me, isFetched: peers.fetched }) }));

import { WalletLinkEffect } from '../WalletLinkEffect';

function renderEffect() {
  const qc = new QueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<WalletLinkEffect />, { wrapper: Wrapper });
}

beforeEach(() => {
  linkWallet.mockClear();
  walletState.connected = true;
  walletState.publicKey = WX;
  peers.me = { peerId: 'me', walletAddress: null };
  peers.fetched = true;
});

describe('WalletLinkEffect', () => {
  it('links the connected wallet when none is linked yet, without asking', async () => {
    renderEffect();
    await waitFor(() => expect(linkWallet).toHaveBeenCalledWith(WX));
    expect(screen.queryByTestId('wallet-relink')).toBeNull();
  });

  it('links nothing while peers/me has not answered', async () => {
    peers.fetched = false;
    peers.me = null;
    renderEffect();
    await new Promise(r => setTimeout(r, 20));
    expect(linkWallet).not.toHaveBeenCalled();
  });

  it('keeps the linked wallet when another one connects and the owner says Keep current', async () => {
    peers.me = { peerId: 'me', walletAddress: WA };
    renderEffect();
    const dialog = await screen.findByTestId('wallet-relink');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('wallet-relink-text')).toHaveTextContent(
      'This agent is linked to FWxdnj...RZtho. Switch it to E312Te...sFdy4? Payouts and token offers will use the new wallet.',
    );
    fireEvent.click(screen.getByTestId('wallet-relink-keep'));
    await waitFor(() => expect(screen.queryByTestId('wallet-relink')).toBeNull());
    await new Promise(r => setTimeout(r, 20));
    expect(linkWallet).not.toHaveBeenCalled();
  });

  it('switches only on Switch', async () => {
    peers.me = { peerId: 'me', walletAddress: WA };
    renderEffect();
    await screen.findByTestId('wallet-relink');
    expect(linkWallet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('wallet-relink-switch'));
    await waitFor(() => expect(linkWallet).toHaveBeenCalledWith(WX));
    await waitFor(() => expect(screen.queryByTestId('wallet-relink')).toBeNull());
    expect(linkWallet).toHaveBeenCalledTimes(1);
  });

  it('does not ask when the connected wallet is the linked one', async () => {
    peers.me = { peerId: 'me', walletAddress: WX };
    renderEffect();
    await waitFor(() => expect(linkWallet).toHaveBeenCalledWith(WX));
    expect(screen.queryByTestId('wallet-relink')).toBeNull();
  });
});
