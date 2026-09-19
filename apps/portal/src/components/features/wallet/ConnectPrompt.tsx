/**
 * Purpose: The one wallet connect prompt. Lists every wallet ConnectorKit can
 *          connect to (injected extensions, Mobile Wallet Adapter on Android)
 *          and, for wallets that are not here, an install link on desktop or a
 *          deep link into the wallet's in-app browser on a phone.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, Modal } from '@/components/ui';
import { ClawMascot } from '@/components/brand/ClawMascot';
import { mono } from '@/components/features/launch/FieldChrome';
import { useConnectorModule, type ConnectorModule } from '@/providers/WalletReadyProvider';
import { currentPlatform } from '@/lib/installer/use-installer-downloads';
import { rememberConnector } from '@/lib/wallet/last-connector';
import { walletsNotInstalled, type KnownWallet } from './wallet-catalog';
import { WALLET_MARKS, walletMarkSlug } from './wallet-marks';

export interface ConnectPromptProps {
  open: boolean;
  /** Dismissed without connecting. */
  onClose: () => void;
  /** A connector connected. */
  onConnected: () => void;
}

const ROW = cn(
  'flex w-full min-h-[44px] items-center gap-3 rounded-lg border border-border-default bg-bg-tertiary px-3 py-1.5 text-left text-sm text-text-primary no-underline',
  'transition-colors hover:border-accent-green/50 hover:bg-accent-green/5',
  'focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
);

/** The right-hand state of a row: mono, small, tabular. */
const STATE = cn(mono, 'ml-auto shrink-0 text-[11px] uppercase tracking-wide');

function isPhone(): boolean {
  const p = currentPlatform();
  return p === 'ios' || p === 'android';
}

export function ConnectPrompt({ open, onClose, onConnected }: ConnectPromptProps) {
  const mod = useConnectorModule();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-3">
          <span data-testid="connect-mascot" className="inline-flex shrink-0">
            <ClawMascot variant="online" animation="bounce" size="md" />
          </span>
          Connect a wallet
        </span>
      }
      maxWidth="max-w-md"
      className="border-t-2 border-t-accent-green"
    >
      {/* Mounted only while open, so the connector hooks run for a visible list and nothing else. */}
      {open && (mod ? <WalletList mod={mod} onConnected={onConnected} /> : <Loading />)}
    </Modal>
  );
}

/** After this long without the connector module, the loading line says what to do about it. */
export const CONNECT_LOADING_SLOW_MS = 12_000;
export const CONNECT_LOADING_SLOW_HINT =
  'This is taking longer than usual. Reload the page; if it keeps happening, check that nothing blocks scripts from this site.';

/**
 * The wallet module is imported after first paint (SolanaProvider); a blocked
 * or stale chunk would otherwise leave this line up for good with nothing to
 * press, so after a while it says to reload.
 */
function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), CONNECT_LOADING_SLOW_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="flex flex-col gap-2 py-6 text-sm text-text-secondary" data-testid="connect-prompt-loading" role="status">
      <span className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-accent-green animate-daemon-pulse shrink-0" />
        Loading wallets…
      </span>
      {slow && (
        <span className="text-xs text-accent-yellow" data-testid="connect-prompt-loading-slow">
          {CONNECT_LOADING_SLOW_HINT}
        </span>
      )}
    </div>
  );
}

function WalletList({ mod, onConnected }: { mod: ConnectorModule; onConnected: () => void }) {
  const { useWalletConnectors, useConnectWallet } = mod;
  const connectors = useWalletConnectors();
  const { connect, isConnecting } = useConnectWallet();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    setPhone(isPhone());
    setPageUrl(window.location.href);
  }, []);

  const ready = useMemo(() => connectors.filter(c => c.ready), [connectors]);
  const others = useMemo(() => walletsNotInstalled(ready.flatMap(c => [c.id, c.name])), [ready]);

  const pick = useCallback(
    async (id: string) => {
      setError(null);
      setBusyId(id);
      try {
        await connect(id as Parameters<typeof connect>[0]);
        rememberConnector(id);
        onConnected();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
      } finally {
        setBusyId(null);
      }
    },
    [connect, onConnected],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="connect-prompt">
      {ready.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="connect-prompt-installed">
          {ready.map(c => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => void pick(c.id)}
                disabled={isConnecting || busyId !== null}
                className={cn(ROW, 'cursor-pointer disabled:cursor-not-allowed disabled:opacity-60')}
                data-testid={`connect-wallet-${c.id}`}
              >
                <WalletTile icon={c.icon} slug={walletMarkSlug(c.id, c.name)} />
                <span className="font-semibold">{c.name}</span>
                <span className={cn(STATE, busyId === c.id ? 'text-text-tertiary' : 'text-accent-green')}>
                  {busyId === c.id ? 'Connecting…' : 'Detected'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-text-secondary" data-testid="connect-prompt-none">
          {phone ? 'Open this page inside your wallet app to connect.' : 'No Solana wallet found in this browser.'}
        </p>
      )}

      {others.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {phone ? 'Open in' : ready.length > 0 ? 'Other wallets' : 'Get a wallet'}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="connect-prompt-others">
            {others.map(w => (
              <li key={w.slug}>
                <KnownWalletLink wallet={w} phone={phone} pageUrl={pageUrl} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="m-0 text-xs text-accent-red" role="alert" data-testid="connect-prompt-error">
          {error}
        </p>
      )}
    </div>
  );
}

function KnownWalletLink({ wallet, phone, pageUrl }: { wallet: KnownWallet; phone: boolean; pageUrl: string }) {
  const href = phone && pageUrl ? wallet.browseUrl(pageUrl) : wallet.installUrl;
  return (
    <a
      href={href}
      target={phone ? '_self' : '_blank'}
      rel="noopener noreferrer"
      className={cn(ROW, 'cursor-pointer')}
      data-testid={`connect-wallet-link-${wallet.slug}`}
    >
      <WalletTile slug={wallet.slug} />
      <span className="font-semibold">{wallet.name}</span>
      <span className={cn(STATE, 'text-text-tertiary')}>{phone ? 'Open app' : 'Install'}</span>
      <Icon name="arrow-right" size="sm" className="h-3 w-3 shrink-0 opacity-40" />
    </a>
  );
}

/**
 * The 40px tile at the left of every row. The wallet's own icon (reported through
 * the wallet standard) wins; a known wallet without one gets our inline mark;
 * anything else the generic wallet glyph.
 */
function WalletTile({ icon, slug }: { icon?: string; slug: string | null }) {
  const Mark = slug ? WALLET_MARKS[slug] : undefined;
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-default bg-bg-void"
      aria-hidden="true"
    >
      {icon ? (
        /* Wallet icons are data URIs the wallet itself reports; next/image has nothing to optimise. */
        <img src={icon} alt="" className="h-6 w-6 rounded-sm" />
      ) : Mark ? (
        <Mark className="h-6 w-6 rounded-sm" />
      ) : (
        <Icon name="wallet" size="sm" className="text-text-tertiary" />
      )}
    </span>
  );
}
