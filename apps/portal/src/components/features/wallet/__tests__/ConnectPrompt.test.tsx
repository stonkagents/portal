/**
 * Purpose: the shared connect prompt — ConnectorKit's wallet list, install
 *          links on desktop, deep links on a phone, one outcome for every caller.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletReadyProvider, type ConnectorModule } from '@/providers/WalletReadyProvider';
import { LAST_CONNECTOR_STORAGE_KEY } from '@/lib/wallet/last-connector';
import { requestConnect, resolveConnect } from '@/lib/wallet/connect-request';
import { ConnectPrompt, CONNECT_LOADING_SLOW_MS } from '../ConnectPrompt';
import { ConnectPromptHost } from '../ConnectPromptHost';

const connect = vi.fn();
let connectors: { id: string; name: string; icon: string; ready: boolean }[] = [];

const mod = {
  useWalletConnectors: () => connectors,
  useConnectWallet: () => ({ connect, isConnecting: false, error: null }),
} as unknown as ConnectorModule;

function setUA(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0 Safari/537.36';

/* jsdom has no <dialog> implementation; the Modal calls show()/close(). */
beforeEach(() => {
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  connect.mockReset();
  connect.mockResolvedValue(undefined);
  connectors = [];
  localStorage.clear();
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  setUA(WINDOWS);
});
afterEach(() => {
  vi.restoreAllMocks();
  resolveConnect(false);
});

describe('ConnectPrompt', () => {
  it('lists every ready connector, not only Phantom, and connects the one picked', async () => {
    connectors = [
      { id: 'wallet-standard:phantom', name: 'Phantom', icon: '', ready: true },
      { id: 'wallet-standard:metamask', name: 'MetaMask', icon: '', ready: true },
      { id: 'wallet-standard:ledger', name: 'Ledger', icon: '', ready: false },
    ];
    const onConnected = vi.fn();
    render(
      <WalletReadyProvider connector={mod}>
        <ConnectPrompt open onClose={() => undefined} onConnected={onConnected} />
      </WalletReadyProvider>,
    );

    expect(screen.getByTestId('connect-wallet-wallet-standard:phantom')).toBeInTheDocument();
    expect(screen.getByTestId('connect-wallet-wallet-standard:metamask')).toBeInTheDocument();
    expect(screen.queryByTestId('connect-wallet-wallet-standard:ledger')).not.toBeInTheDocument();
    /* Installed wallets are not offered again below. */
    expect(screen.queryByTestId('connect-wallet-link-phantom')).not.toBeInTheDocument();
    expect(screen.getByTestId('connect-wallet-link-solflare')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('connect-wallet-wallet-standard:metamask'));
    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(connect).toHaveBeenCalledWith('wallet-standard:metamask');
    expect(localStorage.getItem(LAST_CONNECTOR_STORAGE_KEY)).toBe('wallet-standard:metamask');
  });

  it('shows install links on desktop when no wallet is injected', () => {
    render(
      <WalletReadyProvider connector={mod}>
        <ConnectPrompt open onClose={() => undefined} onConnected={() => undefined} />
      </WalletReadyProvider>,
    );
    expect(screen.getByTestId('connect-prompt-none')).toHaveTextContent('No Solana wallet found');
    const phantom = screen.getByTestId('connect-wallet-link-phantom');
    expect(phantom).toHaveAttribute('href', 'https://phantom.app/download');
    expect(phantom).toHaveAttribute('target', '_blank');
    expect(screen.queryByText(/Phantom not installed/)).not.toBeInTheDocument();
  });

  it('deep-links into the wallet app on a phone', async () => {
    setUA(IPHONE);
    render(
      <WalletReadyProvider connector={mod}>
        <ConnectPrompt open onClose={() => undefined} onConnected={() => undefined} />
      </WalletReadyProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('connect-prompt-none')).toHaveTextContent('inside your wallet app'));
    const phantom = screen.getByTestId('connect-wallet-link-phantom');
    expect(phantom.getAttribute('href')).toMatch(/^https:\/\/phantom\.app\/ul\/browse\//);
    expect(phantom).toHaveAttribute('target', '_self');
    expect(screen.getByTestId('connect-wallet-link-metamask').getAttribute('href')).toMatch(/^https:\/\/metamask\.app\.link\/dapp\//);
  });

  it('keeps the prompt open and shows the wallet error when connecting fails', async () => {
    connectors = [{ id: 'wallet-standard:phantom', name: 'Phantom', icon: '', ready: true }];
    connect.mockRejectedValueOnce(new Error('User rejected the request'));
    const onConnected = vi.fn();
    render(
      <WalletReadyProvider connector={mod}>
        <ConnectPrompt open onClose={() => undefined} onConnected={onConnected} />
      </WalletReadyProvider>,
    );
    fireEvent.click(screen.getByTestId('connect-wallet-wallet-standard:phantom'));
    await waitFor(() => expect(screen.getByTestId('connect-prompt-error')).toHaveTextContent('User rejected the request'));
    expect(onConnected).not.toHaveBeenCalled();
  });

  it('shows the mascot in the header', () => {
    render(
      <WalletReadyProvider connector={mod}>
        <ConnectPrompt open onClose={() => undefined} onConnected={() => undefined} />
      </WalletReadyProvider>,
    );
    const mascot = screen.getByTestId('connect-mascot');
    expect(mascot).toBeInTheDocument();
    expect(mascot.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the inline mark for a known wallet that is not installed', () => {
    render(
      <WalletReadyProvider connector={mod}>
        <ConnectPrompt open onClose={() => undefined} onConnected={() => undefined} />
      </WalletReadyProvider>,
    );
    for (const slug of ['phantom', 'solflare', 'backpack', 'metamask']) {
      const row = screen.getByTestId(`connect-wallet-link-${slug}`);
      expect(row).toContainElement(screen.getByTestId(`wallet-mark-${slug}`));
      expect(row.querySelector('img')).toBeNull();
    }
  });

  it('keeps the wallet-standard icon of an installed wallet and falls back to the mark only without one', () => {
    const icon = 'data:image/svg+xml;base64,PHN2Zy8+';
    connectors = [
      { id: 'wallet-standard:phantom', name: 'Phantom', icon, ready: true },
      { id: 'wallet-standard:solflare', name: 'Solflare', icon: '', ready: true },
      { id: 'wallet-standard:nightly', name: 'Nightly', icon: '', ready: true },
    ];
    render(
      <WalletReadyProvider connector={mod}>
        <ConnectPrompt open onClose={() => undefined} onConnected={() => undefined} />
      </WalletReadyProvider>,
    );
    const phantom = screen.getByTestId('connect-wallet-wallet-standard:phantom');
    expect(phantom.querySelector('img')).toHaveAttribute('src', icon);
    expect(screen.queryByTestId('wallet-mark-phantom')).not.toBeInTheDocument();
    expect(phantom).toHaveTextContent('Detected');

    const solflare = screen.getByTestId('connect-wallet-wallet-standard:solflare');
    expect(solflare).toContainElement(screen.getByTestId('wallet-mark-solflare'));
    expect(solflare.querySelector('img')).toBeNull();

    const nightly = screen.getByTestId('connect-wallet-wallet-standard:nightly');
    expect(nightly.querySelector('img')).toBeNull();
    expect(nightly.querySelector('[data-testid^="wallet-mark-"]')).toBeNull();
  });

  it('renders a loading state while ConnectorKit is still being imported', () => {
    render(
      <WalletReadyProvider connector={null}>
        <ConnectPrompt open onClose={() => undefined} onConnected={() => undefined} />
      </WalletReadyProvider>,
    );
    expect(screen.getByTestId('connect-prompt-loading')).toBeInTheDocument();
  });

  it('tells the visitor to reload when the connector module has not arrived after a while', async () => {
    vi.useFakeTimers();
    try {
      render(
        <WalletReadyProvider connector={null}>
          <ConnectPrompt open onClose={() => undefined} onConnected={() => undefined} />
        </WalletReadyProvider>,
      );
      expect(screen.queryByTestId('connect-prompt-loading-slow')).not.toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(CONNECT_LOADING_SLOW_MS);
      });
      expect(screen.getByTestId('connect-prompt-loading-slow')).toHaveTextContent('Reload the page');
    } finally {
      vi.useRealTimers();
    }
  });

  it('mounts nothing wallet-related while closed', () => {
    connectors = [{ id: 'wallet-standard:phantom', name: 'Phantom', icon: '', ready: true }];
    render(
      <WalletReadyProvider connector={mod}>
        <ConnectPrompt open={false} onClose={() => undefined} onConnected={() => undefined} />
      </WalletReadyProvider>,
    );
    expect(screen.queryByTestId('connect-prompt')).not.toBeInTheDocument();
  });
});

describe('ConnectPromptHost', () => {
  it('opens for a connect request and settles it with the outcome', async () => {
    connectors = [{ id: 'wallet-standard:phantom', name: 'Phantom', icon: '', ready: true }];
    render(
      <WalletReadyProvider connector={mod}>
        <ConnectPromptHost />
      </WalletReadyProvider>,
    );
    expect(screen.queryByTestId('connect-prompt')).not.toBeInTheDocument();

    let outcome: Promise<boolean> | null = null;
    await waitFor(() => {
      outcome = requestConnect();
      expect(screen.getByTestId('connect-prompt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('connect-wallet-wallet-standard:phantom'));
    await expect(outcome!).resolves.toBe(true);
    await waitFor(() => expect(screen.queryByTestId('connect-prompt')).not.toBeInTheDocument());
  });
});
