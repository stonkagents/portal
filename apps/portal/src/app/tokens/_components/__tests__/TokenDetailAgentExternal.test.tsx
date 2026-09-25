/**
 * /tokens/<$AGENT mint>/ with no tracker record: the page is the stonk.fun
 * pool. It is found from the environment's mint and quote, read on chain, and
 * the trade panel is handed that pool (its own platform config inside). The
 * tape comes off the RPC. A pool that cannot be read says so; nothing is
 * sampled. A recorded launch, by contrast, reads the tracker's indexer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AGENT_MINT as CONFIGURED_MINT, AGENT_QUOTE_MINT } from '@/lib/agent-token';
import { launched, pool } from './fixtures';

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
vi.mock('@/lib/api/hooks/use-agent-ledgers', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useBurnPlan: () => ({ status: 'not-built' }),
}));
vi.mock('@/lib/api/hooks/use-stonkfun-token', () => ({
  useStonkfunToken: () => idle,
  useStonkfunBurnPlan: () => ({ status: 'idle' }),
}));
vi.mock('../../_lib/use-token-chain-data', () => ({
  useAllHolders: () => idle,
  useMintInfo: () => idle,
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
vi.mock('../TokenChartIframe', () => ({ TokenChartIframe: () => <div /> }));
vi.mock('@/lib/api/launch-trades', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/api/launch-trades');
  return { ...actual, useLaunchCandles: () => idle };
});
vi.mock('../TokenTrading', () => ({
  TokenTrading: ({
    externalHref,
    pool: p,
    poolError,
    token,
  }: {
    externalHref?: string | null;
    pool?: { poolId: string; platformId: string };
    poolError?: string | null;
    token: { source: string };
  }) => (
    <div
      data-testid="trading-stub"
      data-external={externalHref ?? ''}
      data-pool={p?.poolId ?? ''}
      data-platform={p?.platformId ?? ''}
      data-pool-error={poolError ?? ''}
      data-source={token.source}
    />
  ),
}));
vi.mock('../TokenHolderChat', () => ({ TokenHolderChat: () => null }));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import { TokenDetailClient } from '../TokenDetailClient';

const missing = { token: null, isLoading: false, isFetched: true, isError: false, refetch: vi.fn() };
/** The $AGENT pool as stonk.fun created it: SOL quote, their platform config. */
// The suite setup names the mint (src/test/setup.ts), so the build under test has $AGENT configured.
const AGENT_MINT = CONFIGURED_MINT!;

const stonkfunPool = {
  ...pool,
  mint: AGENT_MINT,
  quoteMint: AGENT_QUOTE_MINT,
  poolId: 'AgentPool1111111111111111111111111111111111',
  platformId: 'StonkFunPlatform111111111111111111111111111',
  platformName: 'stonk.fun',
  creator: 'StonkFunCreator1111111111111111111111111111',
  priceQuote: 0.00000327,
  supplyBase: 1_000_000_000,
};

function visit(mint: string) {
  useParams.mockReturnValue({ tokenId: mint });
  window.history.replaceState(null, '', `/tokens/${mint}/`);
}

describe('TokenDetailClient — $AGENT on an external pool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePoolState.mockReturnValue(idle);
    useExternalPoolState.mockReturnValue({ ...idle, data: stonkfunPool, isFetched: true });
    visit(AGENT_MINT);
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('renders the token page from the pool when the tracker has no record, instead of a 404 or a sample', async () => {
    useTokenDetail.mockReturnValue(missing);
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('token-detail-page')).toBeInTheDocument());
    expect(notFound).not.toHaveBeenCalled();
    expect(screen.getByTestId('token-detail-page')).toHaveAttribute('data-source', 'external');
    expect(screen.queryByTestId('agent-sample-note')).toBeNull();
    expect(screen.queryByText(/sample/i)).toBeNull();
    // The pool is read from the environment's mint and quote; our launch-config pool read stays off.
    expect(useExternalPoolState).toHaveBeenCalledWith({ mint: AGENT_MINT, quoteMint: AGENT_QUOTE_MINT, poolId: null, enabled: true });
    expect(usePoolState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    // Identity and pair from the environment; platform from the pool account.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('StonkAgents');
    expect(screen.getByTestId('token-pair')).toHaveTextContent('AGENT / STONK');
    expect(screen.getByTestId('token-platform-chip')).toHaveTextContent('on stonk.fun');
    expect(screen.queryByTestId('token-age')).toBeNull();
    // The trade panel gets the pool itself, platform config and all, and no off-site link.
    const trading = screen.getByTestId('trading-stub');
    expect(trading).toHaveAttribute('data-pool', stonkfunPool.poolId);
    expect(trading).toHaveAttribute('data-platform', stonkfunPool.platformId);
    expect(trading).toHaveAttribute('data-source', 'external');
    expect(trading).toHaveAttribute('data-external', '');
    // The tape comes off the RPC, listed on the pool, once the pool is known.
    expect(useTokenTape).toHaveBeenLastCalledWith(AGENT_MINT, AGENT_QUOTE_MINT, stonkfunPool.poolId, { enabled: true, source: 'rpc' });
    // No transfer tax on a stonk.fun launch: no fee on the pair line, no holder rewards stat.
    expect(screen.getByTestId('chart-pair')).toHaveTextContent('AGENT / STONK · launchlab curve');
    expect(screen.getByTestId('chart-pair')).not.toHaveTextContent('fee');
    expect(screen.queryByTestId('token-holder-rewards')).toBeNull();
    expect(screen.getByTestId('token-chart')).toHaveAttribute('data-candle-source', 'tape');
    expect(screen.getByTestId('network-token-section')).toBeInTheDocument();
  });

  it('still renders from the pool when the tracker is down', async () => {
    useTokenDetail.mockReturnValue({ ...missing, isFetched: false, isError: true });
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('token-detail-page')).toBeInTheDocument());
    expect(notFound).not.toHaveBeenCalled();
    expect(screen.queryByTestId('token-detail-unavailable')).toBeNull();
  });

  it('says so when the pool cannot be read, with empty figures and no sample', async () => {
    useTokenDetail.mockReturnValue(missing);
    useExternalPoolState.mockReturnValue({ ...idle, isError: true, isFetched: true, error: new Error('cannot found pool') });
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('token-detail-page')).toBeInTheDocument());
    expect(screen.getByTestId('agent-pool-error')).toHaveTextContent('Could not read the $AGENT pool on this network: cannot found pool');
    expect(screen.getByTestId('trading-stub')).toHaveAttribute('data-pool', '');
    expect(screen.getByTestId('trading-stub')).toHaveAttribute('data-pool-error', 'cannot found pool');
    expect(screen.getByTestId('header-price')).toHaveTextContent('-');
    expect(screen.getByTestId('header-mcap')).toHaveTextContent('-');
    expect(screen.getByTestId('token-platform-chip')).toHaveTextContent('external pool');
    expect(screen.queryByText(/sample/i)).toBeNull();
  });

  it('holds the tape until the pool is known, so signatures are listed on the pool, not the mint', async () => {
    useTokenDetail.mockReturnValue(missing);
    useExternalPoolState.mockReturnValue({ ...idle, isLoading: true });
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('token-detail-page')).toBeInTheDocument());
    expect(useTokenTape).toHaveBeenLastCalledWith(AGENT_MINT, AGENT_QUOTE_MINT, null, { enabled: false, source: 'rpc' });
  });
});

describe('TokenDetailClient — a recorded launch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePoolState.mockReturnValue({ ...idle, data: pool, isFetched: true });
    useExternalPoolState.mockReturnValue(idle);
    visit(launched.mint);
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  it("reads the tracker's indexer for the tape and the candles, and prices USD off the tracker's own rate", async () => {
    const priced = { ...launched, priceUsd: 0.00005, metrics24h: { ...launched.metrics24h, priceQuote: 0.00004, volume24hQuote: 1_234, trades24h: 12 } };
    useTokenDetail.mockReturnValue({ ...missing, token: priced });
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('token-detail-page')).toBeInTheDocument());
    expect(screen.getByTestId('token-detail-page')).toHaveAttribute('data-source', 'launch');
    expect(useTokenTape).toHaveBeenLastCalledWith(launched.mint, launched.quoteMint, pool.poolId, { enabled: true, source: 'tracker' });
    expect(screen.getByTestId('token-chart')).toHaveAttribute('data-candle-source', 'tracker');
    // priceUsd / priceQuote is the tracker's quote price; the client-side price feed is not asked.
    expect(useQuoteUsd).toHaveBeenLastCalledWith(null);
    // The stats grid reads the indexer's 24h volume, the same figure the home card shows.
    expect(screen.getAllByTestId('token-vol24h')[0]).toHaveTextContent('1,234 STONK');
    expect(useExternalPoolState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(screen.queryByTestId('token-platform-chip')).toBeNull();
  });

  it('asks the price feed for the quote when the tracker has not priced the launch', async () => {
    useTokenDetail.mockReturnValue({ ...missing, token: { ...launched, priceUsd: null } });
    render(<TokenDetailClient />);
    await waitFor(() => expect(screen.getByTestId('token-detail-page')).toBeInTheDocument());
    expect(useQuoteUsd).toHaveBeenLastCalledWith(launched.quoteMint);
  });
});
