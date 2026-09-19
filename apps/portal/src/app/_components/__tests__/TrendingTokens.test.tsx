/**
 * Purpose: Tests for TrendingTokens — the home row of top tokens by market cap:
 *          loading skeletons, the empty state that opens the launch form, and
 *          six gallery cards linking to /tokens/<mint> plus "Show all" → /tokens.
 */
import { render as rtlRender, screen, fireEvent, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '@/providers/I18nProvider';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GalleryToken } from '@/app/tokens/_lib/gallery-token';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockUseGallery = vi.fn();
vi.mock('@/app/tokens/_lib/use-gallery', () => ({
  useGallery: () => mockUseGallery(),
}));

import { TrendingTokens } from '../TrendingTokens';

function token(mint: string, marketCapUsd: number | null): GalleryToken {
  return {
    mint,
    poolId: null,
    name: `Agent ${mint}`,
    symbol: mint.toUpperCase(),
    imageUrl: null,
    imageThumbUrl: null,
    creator: 'Wa11et11111111111111111111111111111111111111',
    peerId: null,
    quoteMint: null,
    quoteSymbol: 'STONK',
    quoteCategory: null,
    quoteCategoryLabel: null,
    quoteDecimals: null,
    launchedAt: '2026-09-01T00:00:00Z',
    marketCapUsd,
    priceUsd: null,
    holders: 12,
    curveProgressPct: 25,
    quoteRaised: null,
    quoteTarget: null,
    graduated: false,
    metrics24h: { priceQuote: null, priceChange24hPct: null, volume24hQuote: null, volume24hUsd: null, trades24h: null },
    transferFeeBps: null,
    source: 'launch',
    listing: null,
  };
}

const gallery = (tokens: GalleryToken[], isLoading = false, extra: { launchesFailed?: boolean; isRefetching?: boolean } = {}) => ({
  tokens,
  isLoading,
  isRefetching: extra.isRefetching ?? false,
  launchesFailed: extra.launchesFailed ?? false,
  refetch: vi.fn(),
});

/** The component reads its copy through i18n; render inside the provider so the English strings resolve. */
const render = (ui: ReactElement, options?: RenderOptions) => rtlRender(ui, { wrapper: I18nProvider, ...options });

describe('TrendingTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading, subline and the Show all link to /tokens', () => {
    mockUseGallery.mockReturnValue(gallery([]));
    render(<TrendingTokens onLaunch={vi.fn()} />);
    expect(screen.getByText('Trending Agents')).toBeInTheDocument();
    expect(screen.getByTestId('trending-show-all')).toHaveTextContent('Show all');
    expect(screen.getByText('Ranked by market cap')).toBeInTheDocument();
    expect(screen.getByTestId('trending-show-all')).toHaveAttribute('href', '/tokens');
  });

  it('shows six skeleton placeholders while the gallery loads', () => {
    mockUseGallery.mockReturnValue(gallery([], true));
    render(<TrendingTokens onLaunch={vi.fn()} />);
    expect(screen.getByTestId('trending-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('trending-skeleton')).toHaveLength(6);
    expect(screen.queryByTestId('trending-empty')).not.toBeInTheDocument();
  });

  it('shows the empty state and opens the launch form from it', () => {
    const onLaunch = vi.fn();
    mockUseGallery.mockReturnValue(gallery([]));
    render(<TrendingTokens onLaunch={onLaunch} />);
    expect(screen.getByTestId('trending-empty')).toHaveTextContent('No agents launched yet. Be the first.');
    expect(screen.getByTestId('trending-launch')).toHaveTextContent('Launch Agent');
    fireEvent.click(screen.getByTestId('trending-launch'));
    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('trending-grid')).not.toBeInTheDocument();
  });

  it('says the launchpad is unreachable instead of "no tokens" when the launch list failed with no data', () => {
    mockUseGallery.mockReturnValue(gallery([], false, { launchesFailed: true }));
    render(<TrendingTokens onLaunch={vi.fn()} />);
    expect(screen.getByTestId('trending-unreachable')).toHaveTextContent("Can't reach the launchpad right now. Retrying…");
    expect(screen.queryByTestId('trending-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trending-loading')).not.toBeInTheDocument();
  });

  it('holds the unreachable notice while a retry is in flight instead of flashing "be the first"', () => {
    /* Last completed fetch failed… */
    mockUseGallery.mockReturnValue(gallery([], false, { launchesFailed: true }));
    const { rerender } = render(<TrendingTokens onLaunch={vi.fn()} />);
    expect(screen.getByTestId('trending-unreachable')).toBeInTheDocument();

    /* …then React Query clears the error flag for the retry. */
    mockUseGallery.mockReturnValue(gallery([], false, { launchesFailed: false, isRefetching: true }));
    rerender(<TrendingTokens onLaunch={vi.fn()} />);
    expect(screen.getByTestId('trending-unreachable')).toBeInTheDocument();
    expect(screen.queryByTestId('trending-empty')).not.toBeInTheDocument();

    /* Only a completed, successful fetch with no tokens earns the empty state. */
    mockUseGallery.mockReturnValue(gallery([], false, { launchesFailed: false, isRefetching: false }));
    rerender(<TrendingTokens onLaunch={vi.fn()} />);
    expect(screen.getByTestId('trending-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('trending-unreachable')).not.toBeInTheDocument();
  });

  it('keeps the cards on screen during a refetch, even after a failed launch list', () => {
    const tokens = [token('t1', 1000), token('t2', 2000)];
    mockUseGallery.mockReturnValue(gallery(tokens, false, { isRefetching: true, launchesFailed: true }));
    render(<TrendingTokens onLaunch={vi.fn()} />);
    expect(screen.getByTestId('trending-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('trending-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trending-unreachable')).not.toBeInTheDocument();
  });

  it('renders the top six by market cap as gallery cards linking to the detail page', () => {
    const tokens = Array.from({ length: 8 }, (_, i) => token(`t${i}`, (i + 1) * 1000));
    mockUseGallery.mockReturnValue(gallery(tokens));
    render(<TrendingTokens onLaunch={vi.fn()} />);

    const grid = screen.getByTestId('trending-grid');
    const cards = grid.querySelectorAll('[data-testid^="token-t"]:not([data-testid$="-contract"])');
    expect(cards).toHaveLength(6);
    expect(Array.from(cards).map(c => c.getAttribute('href'))).toEqual([
      '/tokens/t7',
      '/tokens/t6',
      '/tokens/t5',
      '/tokens/t4',
      '/tokens/t3',
      '/tokens/t2',
    ]);
    expect(screen.queryByTestId('token-t0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trending-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trending-loading')).not.toBeInTheDocument();
  });
});
