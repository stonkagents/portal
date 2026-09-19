/**
 * TokenCard: renders the merged gallery shape, null-safe, no per-card chain reads.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenCard } from '../TokenCard';
import type { GalleryToken } from '../../_lib/gallery-token';

const launched: GalleryToken = {
  mint: 'MintAAA',
  poolId: 'PoolAAA',
  name: 'Signal Hound',
  symbol: 'HOUND',
  imageUrl: 'https://example.com/hound.png',
  imageThumbUrl: null,
  creator: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  peerId: null,
  quoteMint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  quoteSymbol: 'STONK',
  quoteCategory: 'stonk',
  quoteCategoryLabel: '$STONK',
  quoteDecimals: 9,
  launchedAt: '2026-09-10T12:00:00Z',
  marketCapUsd: 50000,
  priceUsd: 0.00005,
  holders: 43,
  curveProgressPct: 85.5,
  quoteRaised: 27000,
  quoteTarget: 32230,
  graduated: false,
  metrics24h: { priceQuote: null, priceChange24hPct: null, volume24hQuote: null, volume24hUsd: null, trades24h: null },
  transferFeeBps: 100,
  source: 'launch',
  listing: null,
};

const legacy: GalleryToken = {
  ...launched,
  mint: 'MintCCC',
  poolId: null,
  name: 'Old Timer',
  symbol: 'OLD',
  imageUrl: null,
  creator: 'peer-def',
  peerId: 'peer-def',
  quoteMint: null,
  quoteSymbol: null,
  quoteCategory: null,
  quoteCategoryLabel: null,
  quoteDecimals: null,
  marketCapUsd: null,
  priceUsd: null,
  holders: null,
  curveProgressPct: null,
  quoteRaised: null,
  quoteTarget: null,
  transferFeeBps: null,
  source: 'legacy',
};

describe('TokenCard', () => {
  it('renders symbol, name, quote, curve and metrics from a launch', () => {
    render(<TokenCard token={launched} />);

    expect(screen.getByText('HOUND')).toBeInTheDocument();
    expect(screen.getByText('Signal Hound')).toBeInTheDocument();
    expect(screen.getByTestId('token-quote')).toHaveTextContent('/ STONK');
    expect(screen.getByText('85.5%')).toBeInTheDocument();
    expect(screen.getByText('$50.0K')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('On the curve')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tokens/MintAAA');
  });

  it('shows dashes for a legacy token with nothing known', () => {
    render(<TokenCard token={legacy} />);

    expect(screen.getByText('OLD')).toBeInTheDocument();
    expect(screen.getByText('Old Timer')).toBeInTheDocument();
    expect(screen.queryByTestId('token-quote')).not.toBeInTheDocument();
    expect(screen.getAllByText('-')).toHaveLength(3); // curve, market cap, holders
  });

  it('marks a graduated token', () => {
    render(<TokenCard token={{ ...launched, graduated: true }} />);
    expect(screen.getByText('Graduated')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows the 128 px thumb at 32 px when the launch has one, lazily and without layout shift', () => {
    render(<TokenCard token={{ ...launched, imageThumbUrl: 'https://example.com/hound-thumb.webp' }} />);
    const img = screen.getByAltText('HOUND');
    expect(img).toHaveAttribute('src', 'https://example.com/hound-thumb.webp');
    expect(img).toHaveAttribute('width', '32');
    expect(img).toHaveAttribute('height', '32');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('falls back to the full image for a token without a thumb, and to initials without any image', () => {
    render(<TokenCard token={launched} />);
    expect(screen.getByAltText('HOUND')).toHaveAttribute('src', 'https://example.com/hound.png');
    render(<TokenCard token={legacy} />);
    expect(screen.queryByAltText('OLD')).not.toBeInTheDocument();
    expect(screen.getByText('OL')).toBeInTheDocument();
  });
});
