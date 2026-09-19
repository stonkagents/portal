/**
 * Purpose: Wallets the connect prompt can offer when the browser has no
 *          injected connector: an install page on desktop, a deep link into
 *          the wallet's in-app browser on a phone (iOS has no Mobile Wallet
 *          Adapter, so this is the only way in from Safari).
 */

export interface KnownWallet {
  /** Matches the connector id / name ConnectorKit reports, case-insensitive. */
  slug: string;
  name: string;
  installUrl: string;
  /** Deep link that opens `url` inside the wallet's browser. */
  browseUrl: (url: string) => string;
}

function encodedRef(url: string): string {
  return `?ref=${encodeURIComponent(new URL(url).origin)}`;
}

export const KNOWN_WALLETS: readonly KnownWallet[] = [
  {
    slug: 'phantom',
    name: 'Phantom',
    installUrl: 'https://phantom.app/download',
    browseUrl: url => `https://phantom.app/ul/browse/${encodeURIComponent(url)}${encodedRef(url)}`,
  },
  {
    slug: 'solflare',
    name: 'Solflare',
    installUrl: 'https://solflare.com/download',
    browseUrl: url => `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}${encodedRef(url)}`,
  },
  {
    slug: 'backpack',
    name: 'Backpack',
    installUrl: 'https://backpack.app/download',
    browseUrl: url => `https://backpack.app/ul/v1/browse/${encodeURIComponent(url)}${encodedRef(url)}`,
  },
  {
    slug: 'metamask',
    name: 'MetaMask',
    installUrl: 'https://metamask.io/download',
    browseUrl: url => {
      const { host, pathname, search } = new URL(url);
      return `https://metamask.app.link/dapp/${host}${pathname}${search}`;
    },
  },
];

/** Known wallets that none of the ready connectors already represent. */
export function walletsNotInstalled(connectorLabels: readonly string[]): KnownWallet[] {
  const labels = connectorLabels.map(l => l.toLowerCase());
  return KNOWN_WALLETS.filter(w => !labels.some(l => l.includes(w.slug)));
}
