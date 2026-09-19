/**
 * Purpose: Token surfaces name the bound agent by display name when the
 *          tracker sends one (card "by" line, detail header chip, token panel
 *          row) and fall back to the wallet / masked peer id when it does not.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenCard } from '../TokenCard';
import { TokenPanel } from '../TokenPanel';
import type { GalleryToken } from '../../_lib/gallery-token';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const PEER_ID = '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab';
const MASKED = '12D3KooWtest123a...89ab';

const token: GalleryToken = {
  mint: 'MintAAA',
  poolId: 'PoolAAA',
  name: 'Signal Hound',
  symbol: 'HOUND',
  imageUrl: null,
  imageThumbUrl: null,
  creator: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  peerId: PEER_ID,
  quoteMint: null,
  quoteSymbol: null,
  quoteCategory: null,
  quoteCategoryLabel: null,
  quoteDecimals: null,
  launchedAt: '2026-09-10T12:00:00Z',
  marketCapUsd: null,
  priceUsd: null,
  holders: null,
  curveProgressPct: null,
  quoteRaised: null,
  quoteTarget: null,
  graduated: false,
  metrics24h: { priceQuote: null, priceChange24hPct: null, volume24hQuote: null, volume24hUsd: null, trades24h: null },
  transferFeeBps: 100,
  source: 'launch',
  listing: null,
};

describe('TokenCard by-line', () => {
  it('names the bound agent when it has a display name', () => {
    render(<TokenCard token={{ ...token, peerDisplayName: 'Hound Bot' }} />);
    expect(screen.getByTestId('token-by-agent')).toHaveTextContent('by Hound Bot');
    expect(screen.getByTestId('token-by-agent').getAttribute('title')).toContain(token.creator);
  });

  it('keeps the creator wallet without a name', () => {
    render(<TokenCard token={token} />);
    expect(screen.queryByTestId('token-by-agent')).not.toBeInTheDocument();
    expect(screen.getByText('by 7xKXtg...gAsU')).toBeInTheDocument();
  });
});

describe('TokenPanel bound agent row', () => {
  it('shows the display name with the peer id as tooltip', () => {
    render(<TokenPanel token={{ ...token, peerDisplayName: 'Hound Bot' }} quoteSymbol={null} mintInfo={null} metadata={null} />);
    const row = screen.getByTestId('token-bound-agent');
    expect(row).toHaveTextContent('Hound Bot');
    expect(row).not.toHaveTextContent(MASKED);
    expect(screen.getByRole('link', { name: /Hound Bot/ })).toHaveAttribute('title', PEER_ID);
  });

  it('shows the masked peer id without a name', () => {
    render(<TokenPanel token={token} quoteSymbol={null} mintInfo={null} metadata={null} />);
    expect(screen.getByTestId('token-bound-agent')).toHaveTextContent(MASKED);
  });
});
