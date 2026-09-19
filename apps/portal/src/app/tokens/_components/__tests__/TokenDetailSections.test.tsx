/**
 * The token detail sections around the trade panel: header, stats grid, curve
 * progress, trades table, holders panel, token / pool panels, fees block.
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TokenTxItem } from '@/lib/api/hooks/use-token-transactions';
import { launched, legacy, pool } from './fixtures';
import { TokenDetailHeader } from '../TokenDetailHeader';
import { TokenDetailStats, curveLiquidityQuote, marketCapUsd } from '../TokenDetailStats';
import { BondingCurveBlock } from '../BondingCurveBlock';
import { LiveTransactions, filterTrades, pageItems, tapeAge } from '../LiveTransactions';
import { TokenHolders } from '../TokenHolders';
import { TokenPanel } from '../TokenPanel';
import { PoolPanel } from '../PoolPanel';
import { feeSplit, feeSplitLine } from '../../_lib/fees';
import { summarizeRevenue, type RevenueEntry } from '../../_lib/use-token-chain-data';
import type { TokenHolder } from '../../_lib/use-token-detail-data';

const noop = () => {};

describe('TokenDetailHeader', () => {
  it('shows name, $TICKER, pair, quote badge, creator, age, CA, price/mcap and links', () => {
    const onDenominationChange = vi.fn();
    render(
      <TokenDetailHeader
        token={launched}
        pool={pool}
        quoteSymbol="STONK"
        quoteUsd={0.5}
        lastPrice={0.00005}
        denomination="quote"
        onDenominationChange={onDenominationChange}
        metadata={{ description: 'A hound.', website: 'https://hound.example/', twitter: 'https://x.com/hound', telegram: null }}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Signal Hound');
    expect(screen.getByText('$HOUND')).toBeInTheDocument();
    expect(screen.getByTestId('token-pair')).toHaveTextContent('HOUND / STONK');
    expect(screen.getByTestId('token-quote-badge')).toHaveTextContent('against $STONK');
    expect(screen.getByText('On the curve')).toBeInTheDocument();
    expect(screen.getByText('No agent yet')).toBeInTheDocument();
    expect(screen.getByTestId('token-age')).toHaveTextContent('launched 3h ago');
    expect(screen.getByText('CA')).toBeInTheDocument();
    expect(screen.getByText('7xKXtg...gAsU')).toBeInTheDocument();
    // The tape's last price wins over the pool's spot.
    expect(screen.getByTestId('header-price')).toHaveTextContent('0.00005 STONK');
    expect(screen.getByTestId('header-mcap')).toHaveTextContent('100.0K STONK');
    expect(screen.getByRole('link', { name: /Website/ })).toHaveAttribute('href', 'https://hound.example/');
    expect(screen.getByRole('link', { name: 'Open X profile' })).toHaveAttribute('href', 'https://x.com/hound');
    expect(screen.getByRole('link', { name: /DexScreener/ })).toHaveAttribute('href', expect.stringContaining(pool.poolId));
    expect(screen.getByRole('link', { name: /Docs/ })).toHaveAttribute('href', 'https://docs.stonkagents.com');
    expect(screen.getByTestId('token-venue-link')).toHaveAttribute('href', expect.stringContaining(launched.mint));

    fireEvent.click(screen.getByRole('radio', { name: 'usd' }));
    expect(onDenominationChange).toHaveBeenCalledWith('usd');
  });

  it('shows the thumb at 80 px when the launch has one and the master otherwise', () => {
    const { unmount } = render(
      <TokenDetailHeader
        token={{ ...launched, imageThumbUrl: 'https://example.com/hound-thumb.webp' }}
        pool={pool}
        quoteSymbol="STONK"
        quoteUsd={0.5}
        denomination="usd"
        onDenominationChange={noop}
      />,
    );
    const thumbed = screen.getByAltText('HOUND');
    expect(thumbed).toHaveAttribute('src', 'https://example.com/hound-thumb.webp');
    expect(thumbed).toHaveAttribute('width', '80');
    expect(thumbed).toHaveAttribute('height', '80');
    unmount();

    render(
      <TokenDetailHeader
        token={launched}
        pool={pool}
        quoteSymbol="STONK"
        quoteUsd={0.5}
        denomination="usd"
        onDenominationChange={noop}
      />,
    );
    expect(screen.getByAltText('HOUND')).toHaveAttribute('src', 'https://example.com/hound.png');
  });

  it('renders in USD, marks a bound agent and near-graduation', () => {
    render(
      <TokenDetailHeader
        token={{ ...launched, peerId: 'peer-1' }}
        pool={{ ...pool, progressPct: 95 }}
        quoteSymbol="STONK"
        quoteUsd={0.5}
        denomination="usd"
        onDenominationChange={noop}
      />,
    );
    expect(screen.getByText('Bound agent')).toBeInTheDocument();
    expect(screen.getByText('Near graduation')).toBeInTheDocument();
    expect(screen.getByTestId('header-price')).toHaveTextContent('$0.00002');
    expect(screen.getByTestId('header-mcap')).toHaveTextContent('$50.0K');
  });

  it("names the pool's platform for an external pool, prices off the pool, and leaves out what no record knows", () => {
    const external = { ...launched, source: 'external' as const, launchedAt: '', marketCapUsd: null, priceUsd: null, transferFeeBps: null, quoteSymbol: 'SOL' };
    render(
      <TokenDetailHeader
        token={external}
        pool={{ ...pool, platformName: 'stonk.fun', priceQuote: 0.00000327 }}
        quoteSymbol="SOL"
        quoteUsd={null}
        denomination="quote"
        onDenominationChange={noop}
      />,
    );
    expect(screen.getByTestId('token-platform-chip')).toHaveTextContent('on stonk.fun');
    expect(screen.queryByTestId('token-age')).toBeNull();
    expect(screen.queryByText('No agent yet')).toBeNull();
    expect(screen.getByTestId('header-price')).toHaveTextContent('0.00000327 SOL');
    // No USD price for the quote: the cap is still read off the pool, in the quote (0.00000327 × 1B).
    expect(screen.getByTestId('header-mcap')).toHaveTextContent('3,270 SOL');
    expect(screen.getByText('7xKXtg...gAsU')).toBeInTheDocument();
  });
});

describe('TokenDetailStats', () => {
  const tape = { volume24hQuote: 1234, trades24h: 12, buys24h: 8, sells24h: 4, tradesToday: 5, truncated: false };
  const revenue = { entries: [], totalsUsd: { holder_distribution: 42 }, counts: { holder_distribution: 3 }, partial: false };

  it('fills the grid from the pool, the tape, the holders and the ledger', () => {
    render(
      <TokenDetailStats
        token={{ ...launched, launchFeeLamports: 12_000_000 }}
        pool={pool}
        quoteSymbol="STONK"
        quoteUsd={0.5}
        solUsd={100}
        tape={tape}
        holderCount={120}
        creatorPct={4.2}
        revenue={revenue}
      />,
    );
    expect(screen.getByTestId('token-vol24h')).toHaveTextContent('1,234 STONK');
    expect(screen.getByText('12 trades · 8 buys / 4 sells')).toBeInTheDocument();
    expect(screen.getByTestId('token-trades-today')).toHaveTextContent('5');
    // 27,000 quote + 307,000,000 × 0.00004 = 39,280 STONK
    expect(screen.getByTestId('token-liquidity')).toHaveTextContent('39.3K STONK');
    expect(screen.getByTestId('token-holders-count')).toHaveTextContent('120');
    expect(screen.getByTestId('token-circulating')).toHaveTextContent('693.00M');
    expect(screen.getByText('69.3% of 1.00B supply')).toBeInTheDocument();
    expect(screen.getByTestId('token-raised')).toHaveTextContent('27.0K STONK');
    expect(screen.getByTestId('token-holder-rewards')).toHaveTextContent('$42.00');
    expect(screen.getByTestId('token-creator-allocation')).toHaveTextContent('4.20%');
  });

  it('flags a truncated tape and reads USD when asked', () => {
    render(
      <TokenDetailStats
        token={launched}
        pool={pool}
        quoteSymbol="STONK"
        quoteUsd={0.5}
        denomination="usd"
        tape={{ ...tape, truncated: true }}
      />,
    );
    expect(screen.getByTestId('token-vol24h')).toHaveTextContent('≥ $617');
    expect(screen.getByTestId('token-trades-today')).toHaveTextContent('≥ 5');
  });

  it("reads Vol 24h from the tracker's indexer when it has one, the same figure as the home card, over the tape", () => {
    const indexed = { ...launched, metrics24h: { ...launched.metrics24h, volume24hQuote: 9_876, volume24hUsd: 4_938, trades24h: 40 } };
    const { rerender } = render(
      <TokenDetailStats token={indexed} pool={pool} quoteSymbol="STONK" quoteUsd={0.5} tape={{ ...tape, truncated: true }} />,
    );
    expect(screen.getByTestId('token-vol24h')).toHaveTextContent('9,876 STONK');
    expect(screen.getByTestId('token-vol24h')).not.toHaveTextContent('≥');
    // The indexer knows the count; the tape's buys/sells split is a floor here, so it stays out.
    expect(screen.getByText('40 trades')).toBeInTheDocument();
    rerender(<TokenDetailStats token={indexed} pool={pool} quoteSymbol="STONK" quoteUsd={0.5} denomination="usd" tape={tape} />);
    expect(screen.getByTestId('token-vol24h')).toHaveTextContent('$4,938');
    expect(screen.getByText('40 trades · 8 buys / 4 sells')).toBeInTheDocument();
  });

  it('has no holder-rewards stat for a pool with no transfer tax (the external $AGENT pool)', () => {
    render(<TokenDetailStats token={{ ...launched, source: 'external', transferFeeBps: null }} pool={pool} quoteSymbol="SOL" tape={tape} />);
    expect(screen.queryByTestId('token-holder-rewards')).toBeNull();
    expect(screen.getByTestId('token-vol24h')).toHaveTextContent('1,234 SOL');
  });

  it('derives market cap and liquidity from the pool', () => {
    expect(marketCapUsd({ ...launched, marketCapUsd: null }, pool, 0.5)).toBeCloseTo(0.00004 * 1_000_000_000 * 0.5);
    expect(marketCapUsd({ ...launched, marketCapUsd: null }, pool, null)).toBeNull();
    expect(curveLiquidityQuote(pool)).toBeCloseTo(27_000 + 307_000_000 * 0.00004);
    expect(curveLiquidityQuote(undefined)).toBeNull();
  });
});

describe('BondingCurveBlock', () => {
  it('shows percent, raised vs target, market cap, age and the graduation line', () => {
    render(<BondingCurveBlock token={launched} pool={pool} quoteSymbol="STONK" quoteUsd={0.5} />);
    expect(screen.getByTestId('curve-percent')).toHaveTextContent('84%');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '84');
    expect(screen.getByText('27.0K STONK')).toBeInTheDocument();
    expect(screen.getByText('32.2K STONK')).toBeInTheDocument();
    expect(screen.getByText('$50.0K')).toBeInTheDocument();
    expect(screen.getByText('3h ago')).toBeInTheDocument();
    expect(screen.getByText(/Graduates to Raydium CPMM at 32.2K STONK/)).toBeInTheDocument();
  });

  it('falls back to the launch config target and reads graduated', () => {
    const { rerender } = render(
      <BondingCurveBlock token={{ ...launched, quoteTarget: null }} quoteSymbol="STONK" configTarget={30_000} />,
    );
    expect(screen.getByText(/at 30.0K STONK/)).toBeInTheDocument();

    rerender(<BondingCurveBlock token={launched} pool={{ ...pool, graduated: true }} quoteSymbol="STONK" />);
    expect(screen.getByTestId('curve-percent')).toHaveTextContent('100%');
    expect(screen.getByText(/moved to a Raydium CPMM pool/)).toBeInTheDocument();
  });
});

describe('LiveTransactions', () => {
  const now = Math.floor(Date.now() / 1000);
  const rows: TokenTxItem[] = [
    {
      signature: 'SIGBUY111111111',
      blockTime: now - 1,
      type: 'buy',
      amountQuote: 2500,
      amountToken: 12_000,
      price: 0.2083,
      wallet: 'WalletBUY111111111',
    },
    { signature: 'SIGSELL22222222', blockTime: now - 3600, type: 'sell', amountQuote: 20, amountToken: 3_000, price: 0.0067 },
    { signature: 'SIGUNK333333333', blockTime: null, type: 'unknown' },
  ];
  const base = {
    trades: rows,
    isLoading: false,
    error: null,
    refetch: noop,
    tokenSymbol: 'HOUND',
    quoteSymbol: 'STONK',
    quoteUsd: 0.5,
  };
  const bodyRows = () => screen.getAllByRole('row').slice(1);
  const manyTrades = (count: number): TokenTxItem[] =>
    Array.from({ length: count }, (_, i) => ({
      signature: `SIG${String(i).padStart(12, '0')}`,
      blockTime: now - i * 10,
      type: i % 2 === 0 ? 'buy' : 'sell',
      amountQuote: 10 + i,
      amountToken: 100 + i,
      price: 0.1,
      wallet: `Wallet${String(i).padStart(12, '0')}`,
    }));

  it('lays the tape out as age · side · usd · token · quote · price · wallet · tx', () => {
    render(<LiveTransactions {...base} />);
    const table = screen.getByRole('table', { name: 'trades' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent);
    expect(headers).toEqual(['age', 'side', 'usd', 'HOUND', 'STONK', 'price', 'wallet', 'tx']);
    expect(within(table).getAllByRole('columnheader')[4]).toHaveClass('tape-hide-sm');
    expect(within(table).getAllByRole('columnheader')[5]).toHaveClass('tape-hide-sm');
    expect(screen.getByText('recent trades · live')).toBeInTheDocument();
  });

  it('renders each cell from the trade and marks fresh rows', () => {
    render(<LiveTransactions {...base} />);
    const body = bodyRows();
    expect(body).toHaveLength(3);
    const cells = within(body[0]!).getAllByRole('cell');
    expect(cells).toHaveLength(8);
    expect(cells[0]).toHaveTextContent('now');
    expect(cells[1]).toHaveTextContent('buy');
    expect(cells[1]).toHaveClass('side');
    expect(cells[2]).toHaveTextContent('$1,250');
    expect(cells[3]).toHaveTextContent('12.0K');
    expect(cells[4]).toHaveTextContent('2,500');
    expect(cells[5]).toHaveTextContent('0.2083');
    expect(within(cells[6]!).getByRole('link')).toHaveAttribute('href', expect.stringContaining('WalletBUY111111111'));
    const txLink = within(cells[7]!).getByRole('link', { name: 'view transaction on the explorer' });
    expect(txLink).toHaveAttribute('href', expect.stringContaining('SIGBUY111111111'));
    expect(txLink).toHaveTextContent('↗');
    expect(body[0]).toHaveClass('buy', 'fresh');
    expect(body[0]).toHaveAttribute('data-fresh', 'true');

    expect(body[1]).toHaveClass('sell');
    expect(body[1]).not.toHaveClass('fresh');
    expect(body[1]).not.toHaveAttribute('data-fresh');
    const sellCells = within(body[1]!).getAllByRole('cell');
    expect(sellCells[0]).toHaveTextContent('1h');
    expect(sellCells[1]).toHaveTextContent('sell');
    expect(sellCells[6]).toHaveTextContent('-');

    const unknownCells = within(body[2]!).getAllByRole('cell');
    expect(unknownCells[0]).toHaveTextContent('-');
    expect(unknownCells[1]).toHaveTextContent('tx');
    expect(unknownCells[2]).toHaveTextContent('-');
    // Every data row and cell is set in the mono, tabular face.
    body.forEach(row => expect(row).toHaveClass('tape-data'));
  });

  it('shows the price in USD when the page is denominated in USD', () => {
    render(<LiveTransactions {...base} denomination="usd" />);
    const cells = within(bodyRows()[0]!).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('$1,250');
    expect(cells[5]).toHaveTextContent('$0.1042');
  });

  it('filters by side with pressed chips coloured for buys and sells', () => {
    render(<LiveTransactions {...base} />);
    const group = screen.getByRole('group', { name: 'trade filters' });
    const all = within(group).getByRole('button', { name: 'all' });
    const buys = within(group).getByRole('button', { name: 'buys' });
    const sells = within(group).getByRole('button', { name: 'sells' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveClass('on');

    fireEvent.click(sells);
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveClass('sell');
    expect(sells).toHaveAttribute('aria-pressed', 'true');
    expect(sells).toHaveClass('on', 'dn');
    expect(all).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(buys);
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveClass('buy');
    expect(buys).toHaveClass('on', 'up');
    expect(sells).not.toHaveClass('on');

    fireEvent.click(all);
    expect(bodyRows()).toHaveLength(3);
  });

  it('toggles big trades at $1k and combines with the side filter', () => {
    render(<LiveTransactions {...base} />);
    const big = screen.getByTestId('trades-big-toggle');
    expect(big).toHaveTextContent('>$1k');
    expect(big).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(big);
    expect(big).toHaveAttribute('aria-pressed', 'true');
    expect(big).toHaveClass('on');
    expect(bodyRows()).toHaveLength(1);
    expect(within(bodyRows()[0]!).getAllByRole('cell')[2]).toHaveTextContent('$1,250');

    fireEvent.click(screen.getByRole('button', { name: 'sells' }));
    expect(screen.getByText('No trades match this filter.')).toBeInTheDocument();
    expect(screen.queryAllByRole('row').slice(1)).toHaveLength(0);

    fireEvent.click(big);
    expect(big).toHaveAttribute('aria-pressed', 'false');
    expect(bodyRows()).toHaveLength(1);
  });

  it('sizes big trades in the quote asset when there is no USD price', () => {
    render(<LiveTransactions {...base} quoteUsd={null} />);
    const big = screen.getByTestId('trades-big-toggle');
    expect(big).toHaveTextContent('>1k STONK');
    expect(big).toHaveAttribute('title', expect.stringContaining('No USD price'));
    expect(within(bodyRows()[0]!).getAllByRole('cell')[2]).toHaveTextContent('-');
    fireEvent.click(big);
    expect(bodyRows()).toHaveLength(1);
    expect(within(bodyRows()[0]!).getAllByRole('cell')[4]).toHaveTextContent('2,500');
  });

  it('filterTrades is pure and only falls back to the quote amount when asked', () => {
    expect(filterTrades(rows, 'whales', 0.5).map(t => t.signature)).toEqual(['SIGBUY111111111']);
    expect(filterTrades(rows, 'whales', null)).toEqual([]);
    expect(filterTrades(rows, 'whales', null, { quoteFallback: true }).map(t => t.signature)).toEqual(['SIGBUY111111111']);
    expect(filterTrades(rows, 'whales', 0.5, { bigUsd: 5 }).map(t => t.signature)).toEqual(['SIGBUY111111111', 'SIGSELL22222222']);
    expect(filterTrades(rows, 'buys', null).map(t => t.signature)).toEqual(['SIGBUY111111111']);
    expect(filterTrades(rows, 'all', null)).toHaveLength(3);
    expect(filterTrades(rows, 'all', null)).not.toBe(rows);
  });

  it('pages 25 at a time over the newest 150 with a pager', () => {
    render(<LiveTransactions {...base} trades={manyTrades(200)} />);
    expect(bodyRows()).toHaveLength(25);
    expect(screen.getByTestId('trades-page-range')).toHaveTextContent('1-25 of 150');
    const pager = screen.getByRole('navigation', { name: 'trade pages' });
    expect(within(pager).getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
    expect(within(pager).getByRole('button', { name: '6' })).toBeInTheDocument();
    expect(within(pager).queryByRole('button', { name: '7' })).not.toBeInTheDocument();
    expect(within(pager).getByRole('button', { name: 'previous page' })).toBeDisabled();

    fireEvent.click(within(pager).getByRole('button', { name: '6' }));
    expect(screen.getByTestId('trades-page-range')).toHaveTextContent('126-150 of 150');
    expect(within(pager).getByRole('button', { name: 'next page' })).toBeDisabled();
    expect(pageItems(6, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pageItems(4, 12)).toEqual([1, 'gap', 3, 4, 5, 'gap', 12]);
  });

  it('freezes the list while paging and rejoins the live stream on page one or a filter change', () => {
    const initial = manyTrades(60);
    const { rerender } = render(<LiveTransactions {...base} trades={initial} />);
    const list = () => screen.getByTestId('live-transactions-list');
    const firstSig = () => within(bodyRows()[0]!).getAllByRole('cell')[7]!.querySelector('a')!.getAttribute('title');
    expect(list()).not.toHaveAttribute('data-frozen');

    fireEvent.click(screen.getByRole('button', { name: 'next page' }));
    expect(list()).toHaveAttribute('data-frozen', 'true');
    expect(screen.getByTestId('trades-page-range')).toHaveTextContent('26-50 of 60');
    expect(firstSig()).toBe('SIG000000000025');

    // A new trade lands while on page 2: the rows do not shift.
    const newer: TokenTxItem = { signature: 'SIGNEW', blockTime: now, type: 'buy', amountQuote: 1, amountToken: 1, price: 0.1 };
    rerender(<LiveTransactions {...base} trades={[newer, ...initial]} />);
    expect(firstSig()).toBe('SIG000000000025');
    expect(screen.getByTestId('trades-page-range')).toHaveTextContent('26-50 of 60');

    // Back to page 1 rejoins the live stream.
    fireEvent.click(screen.getByRole('button', { name: 'previous page' }));
    expect(list()).not.toHaveAttribute('data-frozen');
    expect(firstSig()).toBe('SIGNEW');
    expect(screen.getByTestId('trades-page-range')).toHaveTextContent('1-25 of 61');

    // Paging away again, then a filter change resets to page 1 and unfreezes.
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(list()).toHaveAttribute('data-frozen', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'buys' }));
    expect(list()).not.toHaveAttribute('data-frozen');
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
    expect(firstSig()).toBe('SIGNEW');
  });

  it('formats tape ages', () => {
    const t = 1_700_000_000_000;
    expect(tapeAge(null, t)).toBe('-');
    expect(tapeAge(t - 1_000, t)).toBe('now');
    expect(tapeAge(t - 12_000, t)).toBe('12s');
    expect(tapeAge(t - 4 * 60_000, t)).toBe('4m');
    expect(tapeAge(t - 3 * 3_600_000, t)).toBe('3h');
    expect(tapeAge(t - 2 * 86_400_000, t)).toBe('2d');
  });

  it('handles loading, error and empty, with a retry on error', () => {
    const refetch = vi.fn();
    const { rerender } = render(<LiveTransactions {...base} refetch={refetch} trades={[]} isLoading />);
    expect(screen.getByText('loading the tape…')).toBeInTheDocument();
    expect(screen.queryAllByRole('row').slice(1)).toHaveLength(0);
    expect(screen.queryByRole('navigation', { name: 'trade pages' })).not.toBeInTheDocument();

    rerender(<LiveTransactions {...base} refetch={refetch} trades={[]} error={new Error('rpc')} />);
    expect(screen.getByText(/Could not load trades/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);

    rerender(<LiveTransactions {...base} refetch={refetch} trades={[]} />);
    expect(screen.getByText(/No trades yet/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'trade pages' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});

describe('TokenHolders', () => {
  const holders: TokenHolder[] = [
    { owner: 'AuthorityXYZ111111111111', account: pool.vaultBase, amount: 300_000_000, percent: 30, isPool: true },
    { owner: launched.creator, account: 'AtaCreator', amount: 50_000_000, percent: 5, isPool: false },
    { owner: 'AgentWallet1111111111111', account: 'AtaAgent', amount: 20_000_000, percent: 2, isPool: false },
    ...Array.from({ length: 30 }, (_, i) => ({
      owner: `Holder${i}`.padEnd(24, 'x'),
      account: `Ata${i}`,
      amount: 1_000_000 - i,
      percent: 0.1,
      isPool: false,
    })),
  ];

  it('shows concentration, labels, and pages the list', () => {
    render(
      <TokenHolders
        holders={holders}
        supply={1_000_000_000}
        capped={false}
        isLoading={false}
        tokenSymbol="HOUND"
        creator={launched.creator}
        agentWallet="AgentWallet1111111111111"
      />,
    );
    const conc = screen.getByTestId('holders-concentration');
    expect(conc).toHaveTextContent('32'); // non-pool holders
    expect(conc).toHaveTextContent('Top 10 hold');
    expect(conc).toHaveTextContent('30%'); // in the curve
    const body = screen.getAllByRole('row').slice(1);
    expect(body).toHaveLength(25);
    expect(body[0]).toHaveTextContent('Bonding curve');
    expect(body[1]).toHaveTextContent('Creator');
    expect(body[2]).toHaveTextContent('Bound agent');
    expect(screen.getByText('1-25 of 33')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    expect(screen.getByText('26-33 of 33')).toBeInTheDocument();
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(8);
  });

  it('says when only the largest accounts are known, and reads empty and error states', () => {
    const { rerender } = render(
      <TokenHolders holders={holders.slice(0, 3)} supply={1_000_000_000} capped isLoading={false} tokenSymbol="HOUND" />,
    );
    expect(screen.getByText(/only the twenty largest accounts/)).toBeInTheDocument();
    expect(screen.getByTestId('holders-concentration')).toHaveTextContent('≥ 2');

    rerender(<TokenHolders holders={[]} supply={0} capped={false} isLoading={false} tokenSymbol="HOUND" />);
    expect(screen.getByText('No holders yet.')).toBeInTheDocument();

    rerender(
      <TokenHolders holders={[]} supply={null} capped={false} isLoading={false} error={new Error('rpc')} tokenSymbol="HOUND" />,
    );
    expect(screen.getByText(/Could not load holders/)).toBeInTheDocument();
  });
});

describe('TokenPanel / PoolPanel', () => {
  it('lists the mint facts, transfer fee, metadata, creator, bound agent and quote', () => {
    render(
      <TokenPanel
        token={{ ...launched, peerId: 'peer-1', launchSignature: 'LaunchSig1111111111111' }}
        quoteSymbol="STONK"
        mintInfo={{
          program: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
          isToken2022: true,
          decimals: 6,
          supply: 1_000_000_000,
          mintAuthority: null,
          freezeAuthority: null,
          transferFee: { bps: 100, maxPerTransfer: 1e9, withheld: 1234, withdrawAuthority: 'Auth' },
        }}
        metadata={{ description: 'A hound.', website: null, twitter: null, telegram: null }}
      />,
    );
    expect(screen.getByText('Token-2022')).toBeInTheDocument();
    expect(screen.getByText('1.00B HOUND')).toBeInTheDocument();
    expect(screen.getByTestId('token-transfer-fee')).toHaveTextContent('1% to holders');
    expect(screen.getByTestId('token-transfer-fee')).toHaveTextContent('1,234 HOUND collected, waiting to be paid out');
    expect(screen.getByText('None (fixed supply)')).toBeInTheDocument();
    expect(screen.getByText('A hound.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ipfs:\/\/QmMeta/ })).toHaveAttribute('href', 'https://ipfs.io/ipfs/QmMeta');
    expect(screen.getByTestId('token-bound-agent')).toHaveTextContent('peer-1');
    expect(screen.getByText('$STONK')).toBeInTheDocument();
  });

  it('lists the pool ids, curve, target, migration and vaults; links Raydium once migrated', () => {
    const { rerender } = render(<PoolPanel token={launched} pool={pool} quoteSymbol="STONK" />);
    expect(screen.getByText('Fund-raising')).toBeInTheDocument();
    expect(screen.getByText('Constant product')).toBeInTheDocument();
    expect(screen.getByText('Raydium CPMM')).toBeInTheDocument();
    expect(screen.getByText('32.2K STONK')).toBeInTheDocument();
    expect(screen.getByTestId('pool-vaults')).toHaveTextContent('27.0K STONK · 307.00M HOUND');
    expect(screen.queryByTestId('pool-cpmm-link')).not.toBeInTheDocument();

    rerender(<PoolPanel token={launched} pool={{ ...pool, status: 2, graduated: true }} quoteSymbol="STONK" />);
    expect(screen.getByText('Migrated')).toBeInTheDocument();
    expect(screen.getByTestId('pool-cpmm-link')).toHaveAttribute('href', expect.stringContaining(launched.mint));

    rerender(<PoolPanel token={legacy} quoteSymbol={null} />);
    expect(screen.getByText(/no LaunchLab pool/)).toBeInTheDocument();
  });
});

describe('fee model', () => {
  const entries: RevenueEntry[] = [
    { id: 1, kind: 'holder_distribution', amount_raw: 10, amount_usd: 5, mint: launched.mint, occurred_at: new Date().toISOString() },
    { id: 2, kind: 'holder_distribution', amount_raw: 10, amount_usd: 7, mint: launched.mint, occurred_at: new Date().toISOString() },
    { id: 3, kind: 'platform_fee_claim', amount_raw: 3, amount_usd: 9, mint: launched.mint, occurred_at: new Date().toISOString() },
    { id: 4, kind: 'buyback', amount_raw: 3, amount_usd: 99, mint: 'OtherMint', occurred_at: new Date().toISOString() },
  ];

  it('summarizeRevenue filters by mint and flags a partial window', () => {
    const r = summarizeRevenue(entries, launched.mint);
    expect(r.entries).toHaveLength(3);
    expect(r.totalsUsd).toEqual({ holder_distribution: 12, platform_fee_claim: 9 });
    expect(r.partial).toBe(false);
    expect(summarizeRevenue(entries, 'Nope').entries).toEqual([]);
  });

  it('keeps the fee line wording', () => {
    expect(feeSplitLine(feeSplit(launched, pool))).toBe('2.25% fee per trade: 0.25% Raydium · 1% StonkAgents · 1% holders');
    expect(feeSplit(launched, pool).totalBps).toBe(225);
  });
});

describe('reconnecting states', () => {
  it('keeps the last trades on screen with a hint instead of a banner', () => {
    const rows: TokenTxItem[] = [
      { signature: 'SIG1', blockTime: Math.floor(Date.now() / 1000) - 60, type: 'buy', amountQuote: 1, amountToken: 2, price: 0.5 },
    ];
    render(
      <LiveTransactions
        trades={rows}
        isLoading={false}
        error={new Error('rpc')}
        reconnecting
        refetch={noop}
        tokenSymbol="HOUND"
        quoteSymbol="STONK"
      />,
    );
    expect(screen.getByTestId('trades-reconnecting')).toHaveTextContent('reconnecting…');
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
    expect(screen.queryByText(/Could not load trades/)).not.toBeInTheDocument();
  });

  it('keeps the last holders on screen with a hint, and stays quiet with nothing yet', () => {
    const holders: TokenHolder[] = [{ owner: 'Someone1111111111111111', account: 'Ata', amount: 10, percent: 1, isPool: false }];
    const { rerender } = render(
      <TokenHolders
        holders={holders}
        supply={1000}
        capped={false}
        isLoading={false}
        error={new Error('rpc')}
        reconnecting
        tokenSymbol="HOUND"
      />,
    );
    expect(screen.getByTestId('holders-reconnecting')).toBeInTheDocument();
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);

    rerender(
      <TokenHolders holders={[]} supply={null} capped={false} isLoading={false} error={new Error('rpc')} tokenSymbol="HOUND" />,
    );
    expect(screen.getByText(/Retrying in the background/)).toBeInTheDocument();
    expect(screen.queryByText(/Check your RPC/)).not.toBeInTheDocument();
  });
});
