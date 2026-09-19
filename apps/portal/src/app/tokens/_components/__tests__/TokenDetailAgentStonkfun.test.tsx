/**
 * /tokens/<$AGENT mint>/ with `NEXT_PUBLIC_AGENT_SOURCE=stonkfun`: the page
 * is what stonkfun's public API lists (here the captured $KNOTS answer). No
 * pool is read and no tape; the chart is DexScreener's embed, the trades and
 * the buy button go to stonkfun, the burns are the flywheel's, and the mint
 * and the holders still come off the RPC. The source is read at import time,
 * so the environment is set before anything loads.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const KNOTS = '8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS';
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_AGENT_SOURCE = 'stonkfun';
  process.env.NEXT_PUBLIC_AGENT_MINT = '8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS';
  process.env.NEXT_PUBLIC_AGENT_BUY_URL = '';
  process.env.NEXT_PUBLIC_AGENT_TOTAL_SUPPLY = '';
});

const useParams = vi.fn();
const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ useParams: () => useParams(), notFound: () => notFound() }));

const useTokenDetail = vi.fn();
vi.mock('../../_lib/use-gallery', () => ({ useTokenDetail: (...args: unknown[]) => useTokenDetail(...args) }));

const idle = { data: undefined, isLoading: false, isError: false, isFetched: false, error: null, refetch: vi.fn() };
vi.mock('@/lib/launchlab/launch-config', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/launchlab/launch-config');
  return { ...actual, useLaunchConfig: () => idle };
});
const usePoolState = vi.fn();
vi.mock('@/lib/launchlab/pool-state', () => ({ usePoolState: (p: unknown) => usePoolState(p) }));
const useExternalPoolState = vi.fn();
vi.mock('@/lib/launchlab/external-pool', () => ({ useExternalPoolState: (p: unknown) => useExternalPoolState(p) }));
const useBurnPlan = vi.fn();
vi.mock('@/lib/api/hooks/use-agent-ledgers', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBurnPlan: (e: unknown) => useBurnPlan(e),
}));
const useStonkfunToken = vi.fn();
const useStonkfunBurnPlan = vi.fn();
vi.mock('@/lib/api/hooks/use-stonkfun-token', () => ({
  useStonkfunToken: (m: unknown) => useStonkfunToken(m),
  useStonkfunBurnPlan: (m: unknown, s: unknown, e: unknown) => useStonkfunBurnPlan(m, s, e),
}));
const useMintInfo = vi.fn();
vi.mock('../../_lib/use-token-chain-data', () => ({
  useAllHolders: () => idle,
  useMintInfo: (m: unknown) => useMintInfo(m),
  useTokenRevenue: () => idle,
}));
const useQuoteUsd = vi.fn((_mint: unknown) => idle);
vi.mock('../../_lib/use-token-detail-data', () => ({ useQuoteUsd: (m: unknown) => useQuoteUsd(m), useTokenMetadata: () => idle }));
const useTokenTape = vi.fn((..._args: unknown[]) => ({
  ...idle,
  trades: [],
  stats: {},
  lastPrice: null,
  source: 'rpc',
  isFetching: false,
  reconnecting: false,
}));
vi.mock('../../_lib/use-token-tape', () => ({
  useTokenTape: (a: unknown, b: unknown, c: unknown, d?: unknown) => useTokenTape(a, b, c, d),
}));
vi.mock('../TokenCandleChart', () => ({
  TokenCandleChart: ({ candles }: { candles: unknown[] }) => <div data-testid="candle-stub">{candles.length}</div>,
}));
vi.mock('../TokenChartIframe', () => ({
  TokenChartIframe: ({ mint, poolId }: { mint: string; poolId?: string | null }) => (
    <div data-testid="chart-iframe-stub" data-mint={mint} data-pool={poolId ?? ''} />
  ),
}));
vi.mock('@/lib/api/launch-trades', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/api/launch-trades');
  return { ...actual, useLaunchCandles: () => idle };
});
vi.mock('../TokenTrading', () => ({
  TokenTrading: ({
    externalHref,
    pool: p,
    token,
  }: {
    externalHref?: string | null;
    pool?: { poolId: string };
    token: { source: string };
  }) => <div data-testid="trading-stub" data-external={externalHref ?? ''} data-pool={p?.poolId ?? ''} data-source={token.source} />,
}));
vi.mock('../TokenHolderChat', () => ({ TokenHolderChat: () => null }));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import { parseStonkfunToken } from '@/lib/api/stonkfun';
import { AGENT_MINT, AGENT_SOURCE } from '@/lib/agent-token';
import { TokenDetailClient } from '../TokenDetailClient';

const knots = parseStonkfunToken(
  JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', '..', 'lib', 'api', '__fixtures__', 'stonkfun', 'knots-token.json'), 'utf8'),
  ),
)!;
const missing = { token: null, isLoading: false, isFetched: false, isError: false, refetch: vi.fn() };
const currentSupply = 998_724_544.962446;
const knotsMint = {
  program: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  isToken2022: true,
  decimals: 6,
  supply: currentSupply,
  mintAuthority: null,
  freezeAuthority: null,
  transferFee: { bps: 300, maxPerTransfer: 1e12, withheld: 0, withdrawAuthority: null },
};
const flywheelPlan = {
  total: 1_000_000_000,
  planTotal: null,
  burned: 1_275_455.037554,
  remaining: currentSupply,
  burns: 1966,
  next: null,
  schedule: null,
  recent: [
    {
      at: '2026-09-14T16:15:58.148Z',
      amount: 7043.046204,
      sig: '4RaJAZQW3eJaa2P7ZcQhLxzDnGcUk62K9dSUF1bK8s6YNNM1YkD9tkNu6JJdkViBDgGcJipaRoagff7ieHRzAb4P',
    },
  ],
};

function visit(mint: string) {
  useParams.mockReturnValue({ tokenId: mint });
  window.history.replaceState(null, '', `/tokens/${mint}/`);
}

describe('TokenDetailClient, $AGENT via stonkfun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTokenDetail.mockReturnValue(missing);
    usePoolState.mockReturnValue(idle);
    useExternalPoolState.mockReturnValue(idle);
    useBurnPlan.mockReturnValue({ status: 'idle' });
    useStonkfunToken.mockReturnValue({ ...idle, data: knots, isFetched: true });
    useStonkfunBurnPlan.mockReturnValue({ status: 'ready', data: flywheelPlan });
    useMintInfo.mockReturnValue({ ...idle, data: knotsMint });
    visit(KNOTS);
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('is configured for the test: the source and the mint come from the environment', () => {
    expect(AGENT_SOURCE).toBe('stonkfun');
    expect(AGENT_MINT).toBe(KNOTS);
  });

  it("renders the page from stonkfun's answer, reading neither the tracker, nor a pool, nor a tape", async () => {
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('token-detail-page')).toBeInTheDocument());
    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByTestId('token-detail-page')).toHaveAttribute('data-source', 'external');
    expect(useStonkfunToken).toHaveBeenCalledWith(KNOTS);
    expect(useTokenDetail).toHaveBeenCalledWith(null, expect.anything());
    expect(useExternalPoolState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(usePoolState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(useTokenTape).toHaveBeenLastCalledWith(KNOTS, knots.quote.mint, knots.pool, { enabled: false, source: 'rpc' });
    // Identity, pair, graduation and venue from stonkfun; the mint still read off the chain.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('KNOTS');
    expect(screen.getByTestId('token-pair')).toHaveTextContent('KNOTS / STONK');
    expect(screen.getAllByText('Graduated').length).toBeGreaterThan(0);
    expect(screen.getByTestId('token-platform-chip')).toHaveTextContent('on stonkfun');
    expect(screen.getByTestId('token-venue-source')).toHaveTextContent('stonkfun');
    expect(screen.getByTestId('token-venue-source').querySelector('a')).toHaveAttribute(
      'href',
      `https://www.stonkfun.xyz/token/${KNOTS}`,
    );
    expect(screen.getByTestId('token-age')).toBeInTheDocument();
    expect(useMintInfo).toHaveBeenCalledWith(KNOTS);
    // Priced in USD by stonkfun.
    expect(screen.getByTestId('header-price')).toHaveTextContent('$0.0194');
    expect(screen.getByTestId('header-mcap')).toHaveTextContent('$19.40M');
    expect(screen.getAllByTestId('token-vol24h')[0]).toHaveTextContent('$1.48M');
    expect(screen.getAllByTestId('token-liquidity')[0]).toHaveTextContent('$980.8K');
    expect(screen.queryByTestId('agent-pool-error')).toBeNull();
    expect(screen.queryByText(/sample/i)).toBeNull();
  });

  it("shows DexScreener's chart by the mint, sends the trades tab to stonkfun, and the buy button to Jupiter", async () => {
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('token-detail-page')).toBeInTheDocument());
    expect(screen.queryByTestId('token-chart')).toBeNull();
    expect(screen.getByTestId('chart-iframe-stub')).toHaveAttribute('data-mint', KNOTS);
    expect(screen.getByTestId('chart-iframe-stub')).toHaveAttribute('data-pool', '');
    fireEvent.click(screen.getByTestId('main-tab-trades'));
    expect(screen.getByTestId('trades-on-stonkfun-link')).toHaveAttribute('href', `https://www.stonkfun.xyz/token/${KNOTS}`);
    expect(screen.queryByTestId('live-transactions')).toBeNull();
    const trading = screen.getByTestId('trading-stub');
    // Buy goes to Jupiter with quote -> token pre-filled (stonkfun trades there too).
    const external = trading.getAttribute('data-external') ?? '';
    expect(external.startsWith('https://jup.ag/swap/')).toBe(true);
    expect(external.endsWith(`-${KNOTS}`)).toBe(true);
    expect(trading).toHaveAttribute('data-pool', '');
    expect(trading).toHaveAttribute('data-source', 'external');
  });

  it("draws the network-token section from the flywheel's burns and the mint, with the venue tag", async () => {
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('network-token-section')).toBeInTheDocument());
    expect(useStonkfunBurnPlan).toHaveBeenCalledWith(KNOTS, currentSupply, true);
    expect(useBurnPlan).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('burn-fact-total-value')).toHaveTextContent('1,275,455 $KNOTS');
    expect(screen.getByTestId('burn-fact-step-value')).toHaveTextContent('1,966');
    expect(screen.getByTestId('burn-fact-next-value')).toHaveTextContent('Sep 14, 16:15 UTC');
    expect(screen.getByTestId('burn-fact-plan-value')).toHaveTextContent('no fixed schedule');
    expect(screen.getByTestId('burn-panel')).toHaveAttribute('data-schedule', 'none');
    // One listed burn: one done bar, nothing planned.
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-done', '1');
    expect(screen.getByTestId('burn-chart')).toHaveAttribute('data-planned', '0');
    expect(screen.getByTestId('network-token-venue')).toHaveAttribute('href', `https://www.stonkfun.xyz/token/${KNOTS}`);
    expect(screen.queryByTestId('holders-tape')).toBeNull();
  });

  it('is loading until stonkfun answers, and says so when it cannot', async () => {
    useStonkfunToken.mockReturnValue({ ...idle, isLoading: true });
    const { unmount } = render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('token-detail-loading')).toBeInTheDocument());
    unmount();
    useStonkfunToken.mockReturnValue({ ...idle, isError: true, isFetched: true, error: new Error('stonkfun returned 503') });
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('token-detail-unavailable')).toBeInTheDocument());
    expect(notFound).not.toHaveBeenCalled();
  });
});
