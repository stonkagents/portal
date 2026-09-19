/**
 * Agents gallery: merged launches + legacy list, loading, filters, launch CTA.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { I18nProvider } from '@/providers/I18nProvider';
import type { GalleryToken } from '../_lib/gallery-token';

const mockUseGallery = vi.fn();
vi.mock('../_lib/use-gallery', () => ({
  useGallery: () => mockUseGallery(),
}));

vi.mock('@/lib/wallet', () => ({
  useWalletService: () => ({ connected: false, publicKey: null }),
}));

const recordTokenLaunch = vi.fn();
vi.mock('@/lib/user-profile', () => ({
  recordTokenLaunch: (...args: unknown[]) => recordTokenLaunch(...args),
}));

vi.mock('next/dynamic', () => ({
  default: () =>
    function WizardStub({ onClose }: { onClose: (launched?: unknown) => void }) {
      return (
        <div data-testid="token-wizard">
          <button
            type="button"
            onClick={() => onClose({ name: 'Signal Hound', ticker: 'HOUND', imageDataUrl: null, contractAddr: 'MintNEW' })}
          >
            finish
          </button>
        </div>
      );
    },
}));

import AgentsPage from '../page';

const base: GalleryToken = {
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
  holders: 42,
  curveProgressPct: 85,
  quoteRaised: 27000,
  quoteTarget: 32230,
  graduated: false,
  metrics24h: { priceQuote: null, priceChange24hPct: null, volume24hQuote: null, volume24hUsd: null, trades24h: null },
  transferFeeBps: 100,
  source: 'launch',
  listing: null,
};

const tokens: GalleryToken[] = [
  base,
  {
    ...base,
    mint: 'MintBBB',
    poolId: 'PoolBBB',
    name: 'Chip Watcher',
    symbol: 'CHIP',
    quoteMint: 'So11111111111111111111111111111111111111112',
    quoteSymbol: 'SOL',
    quoteCategory: 'solana',
    quoteCategoryLabel: 'Solana',
    launchedAt: '2026-09-11T08:00:00Z',
    marketCapUsd: 80000,
    curveProgressPct: 100,
    graduated: true,
  },
  {
    ...base,
    mint: 'MintCCC',
    poolId: null,
    name: 'Old Timer',
    symbol: 'OLD',
    creator: 'peer-3',
    peerId: 'peer-3',
    quoteMint: null,
    quoteSymbol: null,
    quoteCategory: null,
    quoteCategoryLabel: null,
    launchedAt: '2026-04-12T10:00:00Z',
    marketCapUsd: null,
    holders: null,
    curveProgressPct: null,
    quoteRaised: null,
    quoteTarget: null,
    transferFeeBps: null,
    source: 'legacy',
  },
];

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, createElement(I18nProvider, null, children));
  };
}

const gallery = (over: Partial<ReturnType<typeof mockUseGallery>> = {}) => ({
  tokens,
  isLoading: false,
  isRefetching: false,
  launchesFailed: false,
  refetch: vi.fn(),
  ...over,
});

describe('AgentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the heading, the grid and the quote on each card', () => {
    mockUseGallery.mockReturnValue(gallery());
    render(<AgentsPage />, { wrapper: createWrapper() });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Agents');
    expect(screen.getByText('Every token trades on a Raydium LaunchLab curve against $STONK.')).toBeInTheDocument();
    expect(screen.queryByText(/or a stock/)).not.toBeInTheDocument();
    expect(screen.getByTestId('token-grid')).toBeInTheDocument();
    expect(screen.getAllByText('HOUND').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('CHIP').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('OLD').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('token-MintAAA')).toHaveTextContent('/ STONK');
    expect(screen.getByTestId('token-MintBBB')).toHaveTextContent('/ SOL');
    expect(screen.getByTestId('token-MintAAA')).toHaveTextContent('$50.0K');
    expect(screen.queryByText(/pump\.fun/i)).not.toBeInTheDocument();
  });

  it('shows the loading skeletons while either source loads', () => {
    mockUseGallery.mockReturnValue(gallery({ tokens: [], isLoading: true }));
    render(<AgentsPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId('tokens-loading')).toBeInTheDocument();
    expect(screen.getByTestId('tokens-hero-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('token-grid')).not.toBeInTheDocument();
  });

  it('features the top three by market cap', () => {
    mockUseGallery.mockReturnValue(gallery());
    render(<AgentsPage />, { wrapper: createWrapper() });
    const featured = screen.getAllByTestId(/^featured-Mint/);
    expect(featured).toHaveLength(3);
    expect(featured[0]).toHaveAttribute('data-testid', 'featured-MintBBB');
  });

  it('filters by status, with no quote filter to pick', () => {
    mockUseGallery.mockReturnValue(gallery());
    render(<AgentsPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByRole('button', { name: 'Graduated' }));
    expect(screen.getByTestId('token-MintBBB')).toBeInTheDocument();
    expect(screen.queryByTestId('token-MintAAA')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByTestId('token-MintAAA')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Any quote' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Solana' })).not.toBeInTheDocument();
  });

  it('offers to launch the first token when nothing has launched', () => {
    mockUseGallery.mockReturnValue(gallery({ tokens: [] }));
    render(<AgentsPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId('tokens-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tokens-empty-launch'));
    expect(screen.getByTestId('token-wizard')).toBeInTheDocument();
  });

  it('opens the launch form from the empty state and records the launch on close', () => {
    mockUseGallery.mockReturnValue(gallery({ tokens: [] }));
    render(<AgentsPage />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByTestId('tokens-empty-launch'));
    expect(screen.getByTestId('token-wizard')).toBeInTheDocument();

    fireEvent.click(screen.getByText('finish'));
    expect(screen.queryByTestId('token-wizard')).not.toBeInTheDocument();
    expect(recordTokenLaunch).toHaveBeenCalledWith(expect.objectContaining({ contractAddr: 'MintNEW' }), null);
  });

  it('opens the launch form on arrival at /tokens#launch', () => {
    window.location.hash = '#launch';
    mockUseGallery.mockReturnValue(gallery());
    render(<AgentsPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId('token-wizard')).toBeInTheDocument();
    // The hash stays while the form is open (rewriting the URL remounts the page); it is stripped on close.
    expect(window.location.hash).toBe('#launch');
  });

  it('keeps the cards on screen while a refetch is in flight', () => {
    mockUseGallery.mockReturnValue(gallery({ isRefetching: true }));
    render(<AgentsPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId('token-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('tokens-loading')).not.toBeInTheDocument();
  });

  it('says the launchpad is unreachable, not that nothing has launched, when the list failed with no data', () => {
    const refetch = vi.fn();
    mockUseGallery.mockReturnValue(gallery({ tokens: [], launchesFailed: true, isRefetching: true, refetch }));
    render(<AgentsPage />, { wrapper: createWrapper() });
    expect(screen.queryByTestId('tokens-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('tokens-empty-reason')).toHaveTextContent("Can't reach the launchpad right now. Retrying…");
    expect(screen.queryByText('No agents launched yet. Be the first.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tokens-empty-launch')).not.toBeInTheDocument();
    // One message, not two: the slim banner only accompanies cards from a previous answer.
    expect(screen.queryByTestId('tokens-launches-failed')).not.toBeInTheDocument();
    expect(screen.getByTestId('tokens-hero-unreachable')).toHaveTextContent("Can't reach the launchpad right now. Retrying…");
    expect(screen.queryByText('No agents launched yet. Be the first.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tokens-empty-retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('says so when the launch list is down but the legacy list answered', () => {
    const refetch = vi.fn();
    mockUseGallery.mockReturnValue(gallery({ launchesFailed: true, refetch }));
    render(<AgentsPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId('tokens-launches-failed')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
