/**
 * Featured $AGENT card: the four-stat header row off the stonk.fun pool
 * (placeholders while loading and for the 24h pair, which needs an indexer),
 * the honest error when the pool cannot be read, the mascot, the buy CTA and
 * the copy-address button.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeaturedAgentCard, formatChange, formatUsdCompact, formatCount, truncateMint } from '../FeaturedAgentCard';
import { featuredAgentToken } from '@/lib/agent-token';
import { agentStatsFromStonkfun } from '@/lib/api/hooks/use-agent-token';
import { parseStonkfunToken } from '@/lib/api/stonkfun';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const addToast = vi.fn();
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast }) }));

const mockUseAgentToken = vi.fn();
vi.mock('@/lib/api/hooks/use-agent-token', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/api/hooks/use-agent-token');
  return { ...actual, useAgentToken: (mint: string | null) => mockUseAgentToken(mint) };
});

const mockNetwork = vi.fn();
vi.mock('../AgentTokenPanel', () => ({
  useAgentNetworkData: (token: unknown, live: unknown, pool: unknown) => mockNetwork(token, live, pool),
  AgentTokenPanel: ({ data }: { data: { holderCount: number | null } }) => (
    <div data-testid="agent-token-panel">{String(data.holderCount)}</div>
  ),
}));
const NETWORK = {
  mintInfo: null,
  pool: null,
  burnPlan: { status: 'loading' },
  createdSupply: null,
  holderCount: null,
  creatorWallet: null,
  launchedAt: null,
};

const LOADING = { stats: null, pool: null, poolError: null, isLoading: true, isFetched: false, isError: false };
/** What the pool gives on its own: no image, no USD without a quote price, the cap in SOL. */
const POOL = { poolId: 'AgentPool', platformId: 'StonkFunPlatform', platformName: 'stonk.fun' };
const LIVE = {
  stats: {
    image: null,
    quoteSymbol: 'SOL',
    mcapUsd: null,
    priceUsd: null,
    priceQuote: 0.00000327,
    mcapQuote: 3_270,
    supply: 1_000_000_000,
    holders: null,
    change24h: null,
    volume24h: null,
    curveProgressPct: 2.1,
    graduated: false,
    quoteMint: 'So11111111111111111111111111111111111111112',
    poolId: 'AgentPool',
    creatorWallet: 'Creator',
    platformId: 'StonkFunPlatform',
    platformName: 'stonk.fun',
    transferFeeBps: null,
    launchedAt: null,
  },
  pool: POOL,
  poolError: null,
  isLoading: false,
  isFetched: true,
  isError: false,
};

const MINT = 'tRqrTWVmyZD7pqgu8jkBJodLyCKYJhC7Wbgi1MnT9gSr';

describe('FeaturedAgentCard', () => {
  beforeEach(() => {
    addToast.mockClear();
    mockUseAgentToken.mockReset().mockReturnValue(LOADING);
    mockNetwork.mockReset().mockReturnValue(NETWORK);
  });

  it('renders the network-token panel under the header, fed by the live stats and the pool', () => {
    mockUseAgentToken.mockReturnValue(LIVE);
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    expect(mockNetwork).toHaveBeenCalledWith(featuredAgentToken(MINT), LIVE.stats, POOL);
    expect(screen.getByTestId('agent-token-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('featured-pool-error')).toBeNull();
  });

  it('shows the market cap in the quote off the pool when the quote has no USD price', () => {
    mockUseAgentToken.mockReturnValue(LIVE);
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    expect(screen.getByTestId('featured-mcap')).toHaveTextContent('3.3K SOL');
    expect(screen.getByText('$SOL')).toBeInTheDocument();
  });

  it('fills holders from the chain', () => {
    mockUseAgentToken.mockReturnValue(LIVE);
    mockNetwork.mockReturnValue({ ...NETWORK, holderCount: 15 });
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    expect(screen.getByTestId('featured-holders')).toHaveTextContent('15');
  });

  it('says so when the pool cannot be read, with every stat a placeholder and no sample', () => {
    mockUseAgentToken.mockReturnValue({ ...LOADING, isLoading: false, isFetched: true, isError: true, poolError: new Error('cannot found pool') });
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    expect(screen.getByTestId('featured-pool-error')).toHaveTextContent('Could not read the $AGENT pool on this network: cannot found pool');
    expect(screen.getByTestId('featured-mcap')).toHaveTextContent('-');
    expect(screen.getByTestId('featured-holders')).toHaveTextContent('-');
    expect(screen.getByTestId('featured-change')).toHaveTextContent('-');
    expect(screen.getByTestId('featured-volume')).toHaveTextContent('-');
    expect(screen.queryByTestId('featured-ledger-error')).toBeNull();
  });

  it("says so when the burn ledger fails, including a tracker configured for another mint", () => {
    mockUseAgentToken.mockReturnValue(LIVE);
    mockNetwork.mockReturnValue({
      ...NETWORK,
      burnPlan: { status: 'error', error: new Error("The tracker's burn ledger is for CuiX, not the 2161 this site reads.") },
    });
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    expect(screen.queryByTestId('featured-pool-error')).toBeNull();
    expect(screen.getByTestId('featured-ledger-error')).toHaveTextContent(
      "Could not read the $AGENT burn ledger: The tracker's burn ledger is for CuiX, not the 2161 this site reads.",
    );
  });

  it('renders the identity and badge, with placeholders until the pool answers', () => {
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    expect(mockUseAgentToken).toHaveBeenCalledWith(MINT);
    expect(screen.getByTestId('featured-agent-card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('$AGENT');
    expect(screen.getByText("The Network's token")).toBeInTheDocument();
    expect(screen.getByText('StonkAgents')).toBeInTheDocument();
    expect(screen.getByText('$SOL')).toBeInTheDocument();
    expect(screen.getByTestId('featured-stats')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('featured-mcap')).toHaveTextContent('-');
    expect(screen.getByTestId('featured-holders')).toHaveTextContent('-');
    expect(screen.getByTestId('featured-change')).toHaveTextContent('-');
    expect(screen.getByTestId('featured-volume')).toHaveTextContent('-');
    // Always four stats, always in this order.
    expect(screen.getAllByRole('term').map(term => term.textContent)).toEqual(['24h change', 'Market cap', '24h volume', 'Holders']);
    expect(screen.queryByTestId('featured-image')).toBeNull();
    expect(screen.getByTestId('featured-mascot')).toBeInTheDocument();
  });

  it("shows the USD figures once the quote is priced, the tracker's holders when it has a record, and always the mascot", () => {
    mockUseAgentToken.mockReturnValue({ ...LIVE, stats: { ...LIVE.stats, mcapUsd: 3_120.5, priceUsd: 3.12e-6, holders: 17, image: 'https://x/agent.png' } });
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    expect(screen.getByTestId('featured-mcap')).toHaveTextContent('$3.1K');
    expect(screen.getByTestId('featured-holders')).toHaveTextContent('17');
    expect(screen.getByText('$SOL')).toBeInTheDocument();
    // The network token wears the brand mascot regardless of the tracker image.
    expect(screen.queryByTestId('featured-image')).toBeNull();
    expect(screen.getByTestId('featured-mascot')).toBeInTheDocument();
    // The 24h pair stays a placeholder until an indexer over the pool serves it, with no tone.
    expect(screen.getByTestId('featured-change')).toHaveTextContent('-');
    expect(screen.getByTestId('featured-change').className).not.toMatch(/text-accent-(green|red)/);
    expect(screen.getByTestId('featured-volume')).toHaveTextContent('-');
  });

  it('fills in 24h change and volume once an indexer serves them', () => {
    mockUseAgentToken.mockReturnValue({ ...LIVE, stats: { ...LIVE.stats, change24h: -6, volume24h: 812 } });
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    const change = screen.getByTestId('featured-change');
    expect(change).toHaveTextContent('−6%');
    expect(change.className).toContain('text-accent-red');
    expect(screen.getByTestId('featured-volume')).toHaveTextContent('$812');
  });

  it('keeps a null stat as a placeholder after loading', () => {
    mockUseAgentToken.mockReturnValue(LIVE);
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    expect(screen.getByTestId('featured-holders')).toHaveTextContent('-');
    expect(screen.getByTestId('featured-mascot')).toBeInTheDocument();
  });

  it('links the CTA to the token page by default, with no second door for the pool source', () => {
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    const cta = screen.getByTestId('featured-buy');
    expect(cta).toHaveTextContent('Buy $AGENT');
    expect(cta).toHaveAttribute('href', `/tokens/${MINT}/`);
    expect(cta).not.toHaveAttribute('target');
    expect(screen.queryByTestId('featured-swap-external')).toBeNull();
  });

  it('opens an external buy URL in a new tab, and then offers no second door', () => {
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} buyHref="https://dex.example/swap" swapHref="https://jup.ag/swap/a-b" />);
    const cta = screen.getByTestId('featured-buy');
    expect(cta).toHaveAttribute('href', 'https://dex.example/swap');
    expect(cta).toHaveAttribute('target', '_blank');
    expect(cta).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByTestId('featured-swap-external')).toBeNull();
  });

  it('copies the mint to the clipboard and toasts', () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    const copy = screen.getByTestId('token-copy-address');
    expect(copy).toHaveAttribute('title', MINT);
    fireEvent.click(copy);
    expect(writeText).toHaveBeenCalledWith(MINT);
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Address copied', variant: 'success' }));
  });
});

describe('FeaturedAgentCard via stonkfun', () => {
  const KNOTS = '8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS';
  const knots = parseStonkfunToken(
    JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'lib', 'api', '__fixtures__', 'stonkfun', 'knots-token.json'), 'utf8')),
  )!;
  const STONKFUN = {
    source: 'stonkfun',
    stats: agentStatsFromStonkfun(knots),
    pool: null,
    poolError: null,
    isLoading: false,
    isFetched: true,
    isError: false,
  };

  beforeEach(() => {
    addToast.mockClear();
    mockUseAgentToken.mockReset().mockReturnValue(STONKFUN);
    mockNetwork.mockReset().mockReturnValue({ ...NETWORK, holderCount: 1_204 });
  });

  it("wears stonkfun's identity and figures: $KNOTS paired with $STONK, graduated, the four stats in USD, holders off the chain", () => {
    render(<FeaturedAgentCard token={featuredAgentToken(KNOTS)} buyHref={`https://www.stonkfun.xyz/token/${KNOTS}`} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('$KNOTS');
    expect(screen.getByText("The Network's token")).toBeInTheDocument();
    expect(screen.getByText('$STONK')).toBeInTheDocument();
    expect(screen.getByTestId('featured-graduated')).toHaveTextContent(/graduated/i);
    expect(screen.getByTestId('featured-change')).toHaveTextContent('−11%');
    expect(screen.getByTestId('featured-change').className).toContain('text-accent-red');
    expect(screen.getByTestId('featured-mcap')).toHaveTextContent('$19.4M');
    expect(screen.getByTestId('featured-volume')).toHaveTextContent('$1.48M');
    expect(screen.getByTestId('featured-holders')).toHaveTextContent('1,204');
    // The panel is fed the identity stonkfun names, so the ring says "Burning $KNOTS".
    expect(mockNetwork).toHaveBeenCalledWith(expect.objectContaining({ mint: KNOTS, symbol: 'KNOTS', name: 'KNOTS' }), STONKFUN.stats, null);
    // Still the mascot, never the venue image.
    expect(screen.queryByTestId('featured-image')).toBeNull();
    expect(screen.getByTestId('featured-mascot')).toBeInTheDocument();
    expect(screen.queryByTestId('featured-pool-error')).toBeNull();
  });

  it('tags the source with a link to the stonkfun page; Buy opens the token page trade panel, Jupiter is the second door', () => {
    const STONK = '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';
    render(<FeaturedAgentCard token={featuredAgentToken(KNOTS)} buyHref={`/tokens/${KNOTS}/#trade`} swapHref={`https://jup.ag/swap/${STONK}-${KNOTS}`} />);
    const venue = screen.getByTestId('featured-venue');
    expect(venue).toHaveTextContent(/via stonkfun/);
    expect(venue).toHaveAttribute('href', `https://www.stonkfun.xyz/token/${KNOTS}`);
    expect(venue).toHaveAttribute('target', '_blank');
    const cta = screen.getByTestId('featured-buy');
    expect(cta).toHaveTextContent('Buy $KNOTS');
    expect(cta).toHaveAttribute('href', `/tokens/${KNOTS}/#trade`);
    expect(cta).not.toHaveAttribute('target');
    const door = screen.getByTestId('featured-swap-external');
    expect(door).toHaveTextContent('or open on Jupiter');
    expect(door).toHaveAttribute('href', `https://jup.ag/swap/${STONK}-${KNOTS}`);
    expect(door).toHaveAttribute('target', '_blank');
    expect(door).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('names stonkfun when it cannot be reached, with the configured identity and placeholders', () => {
    mockUseAgentToken.mockReturnValue({ ...STONKFUN, stats: null, isError: true, poolError: new Error('stonkfun returned 503') });
    mockNetwork.mockReturnValue(NETWORK);
    render(<FeaturedAgentCard token={featuredAgentToken(KNOTS)} />);
    expect(screen.getByTestId('featured-pool-error')).toHaveTextContent('Could not reach stonkfun for $AGENT: stonkfun returned 503');
    expect(screen.getByTestId('featured-mcap')).toHaveTextContent('-');
    expect(screen.queryByTestId('featured-graduated')).toBeNull();
    expect(screen.getByTestId('featured-venue')).toBeInTheDocument();
  });

  it('shows no venue tag or graduation pill with the pool source', () => {
    mockUseAgentToken.mockReturnValue(LIVE);
    mockNetwork.mockReturnValue(NETWORK);
    render(<FeaturedAgentCard token={featuredAgentToken(MINT)} />);
    expect(screen.queryByTestId('featured-venue')).toBeNull();
    expect(screen.queryByTestId('featured-graduated')).toBeNull();
  });
});

describe('formatters', () => {
  it('formats compact USD', () => {
    expect(formatUsdCompact(1_840_000)).toBe('$1.84M');
    expect(formatUsdCompact(312_000)).toBe('$312K');
    expect(formatUsdCompact(41_200)).toBe('$41.2K');
    expect(formatUsdCompact(980)).toBe('$980');
  });
  it('formats change, count and truncated mints', () => {
    expect(formatChange(14)).toBe('+14%');
    expect(formatChange(-6)).toBe('−6%');
    expect(formatChange(0.2)).toBe('0%');
    expect(formatCount(4812)).toBe('4,812');
    expect(truncateMint(MINT)).toBe('tRqr…9gSr');
    expect(truncateMint('short')).toBe('short');
  });
});
