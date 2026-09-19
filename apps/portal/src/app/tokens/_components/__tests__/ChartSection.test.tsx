/**
 * The chart card: the interval tablist, the delta strip read off the tape (or
 * the tracker's candles for a recorded launch), the price / mcap and live /
 * external pills, the empty states and the pure helpers behind them. The
 * canvas itself is mocked; lightweight-charts needs a real canvas.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { TokenTxItem } from '@/lib/api/hooks/use-token-transactions';
import type { Candle } from '../../_lib/candles';
import { ChartSection } from '../ChartSection';
import { CHART_INTERVALS, DELTA_WINDOWS, bodyRange, deltaPct, formatDelta, stepOption, subZero } from '../chart-card';

const useLaunchCandles = vi.fn();
vi.mock('@/lib/api/launch-trades', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/api/launch-trades');
  return { ...actual, useLaunchCandles: (...args: unknown[]) => useLaunchCandles(...args) };
});

const render = (ui: ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
const idle = { data: undefined, isLoading: false, isError: false, error: null };

vi.mock('../TokenCandleChart', () => ({
  TokenCandleChart: (p: { interval: string; mark: string; candles: unknown[] }) => (
    <div data-testid="token-candle-chart" data-interval={p.interval} data-mark={p.mark} data-count={p.candles.length} />
  ),
}));
vi.mock('../TokenChartIframe', () => ({
  TokenChartIframe: () => <div data-testid="token-chart-external" />,
}));

const NOW = Math.floor(Date.now() / 1000);

function trade(agoSec: number, price: number, i: number): TokenTxItem {
  return { signature: `sig-${i}`, blockTime: NOW - agoSec, type: 'buy', price, amountQuote: 10, amountToken: 10 / price };
}

/** 25h ago at 10, 5h ago at 2, 30m ago at 4, a minute ago at 5. */
const tape: TokenTxItem[] = [trade(25 * 3600, 10, 0), trade(5 * 3600, 2, 1), trade(30 * 60, 4, 2), trade(60, 5, 3)];

const baseProps = {
  mint: 'MintAAA',
  poolId: 'PoolAAA',
  quoteMint: 'QuoteAAA',
  quoteSymbol: 'STONK',
  quoteUsd: 0.5,
  supply: 1_000_000_000,
  trades: tape,
  tapeLoading: false,
  denomination: 'quote' as const,
  onDenominationChange: () => {},
  poolOpen: true,
};

describe('chart-card helpers', () => {
  it('offers the terminal interval set in order, labelled by id', () => {
    expect(CHART_INTERVALS.map(t => t.id)).toEqual(['5m', '15m', '1h', '4h', '1d']);
    expect(CHART_INTERVALS.map(t => t.label)).toEqual(['5m', '15m', '1h', '4h', '1d']);
    expect(CHART_INTERVALS.map(t => t.seconds)).toEqual([300, 900, 3600, 14_400, 86_400]);
  });

  it('steps through a chip row and wraps at the ends', () => {
    const ids = ['5m', '15m', '1h'] as const;
    expect(stepOption(ids, '5m', 1)).toBe('15m');
    expect(stepOption(ids, '1h', 1)).toBe('5m');
    expect(stepOption(ids, '5m', -1)).toBe('1h');
  });

  it('reads the delta over a window off the tape, or gives up when it does not reach', () => {
    expect(deltaPct(tape, 5, 300, NOW)).toBeCloseTo(25);
    expect(deltaPct(tape, 5, 3600, NOW)).toBeCloseTo(150);
    expect(deltaPct(tape, 5, 6 * 3600, NOW)).toBeCloseTo(-50);
    expect(deltaPct(tape, 5, 24 * 3600, NOW)).toBeCloseTo(-50);
    // Nothing traded before the cutoff: no reference, no number.
    expect(deltaPct(tape, 5, 48 * 3600, NOW)).toBeNull();
    expect(deltaPct(tape, null, 300, NOW)).toBeNull();
    expect(deltaPct([], 5, 300, NOW)).toBeNull();
    // Unpriced rows never count as a reference.
    const unpriced: TokenTxItem = { signature: 'x', blockTime: NOW - 7200, type: 'unknown' };
    expect(deltaPct([unpriced], 5, 3600, NOW)).toBeNull();
  });

  it('formats deltas with a sign, one decimal under 100 and none past it', () => {
    expect(formatDelta(3.24)).toBe('+3.2%');
    expect(formatDelta(-12)).toBe('-12.0%');
    expect(formatDelta(150.4)).toBe('+150%');
    expect(formatDelta(null)).toBe('-');
  });

  it('prints subscript-zero prices like the terminal', () => {
    expect(subZero(0.0000227)).toBe('0.0₄227');
    expect(subZero(602_410)).toBe('602.41K');
    expect(subZero(0.0512)).toBe('0.0512');
    expect(subZero(1.5)).toBe('1.50');
    expect(subZero(0.00123)).toBe('0.001230');
    expect(subZero(0)).toBe('0');
  });

  it('fixes the axis to candle bodies and lets wicks stretch it only so far', () => {
    const flat = { time: 0, volume: 0, trades: 1, gap: false };
    const r = bodyRange([
      { ...flat, open: 1, high: 1.1, low: 0.9, close: 1.05 },
      { ...flat, time: 60, open: 1.05, high: 50, low: 1, close: 1.02 },
    ]);
    expect(r).not.toBeNull();
    expect(r!.max).toBeLessThan(2);
    expect(r!.min).toBeGreaterThan(0.8);
    expect(bodyRange([])).toBeNull();
  });
});

describe('ChartSection', () => {
  beforeEach(() => useLaunchCandles.mockReset().mockReturnValue(idle));

  it('renders the interval tablist with the terminal set and 15m selected', () => {
    render(<ChartSection {...baseProps} />);
    const tablist = screen.getByRole('tablist', { name: 'candle interval' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['5m', '15m', '1h', '4h', '1d']);
    expect(tabs.map(t => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false', 'false']);
    expect(tabs.map(t => t.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
    expect(tabs[1]).toHaveClass('cc-chip', 'on');
    expect(screen.getByTestId('token-candle-chart')).toHaveAttribute('data-interval', '15m');
  });

  it('picks an interval by click and by arrow keys, wrapping at the ends', () => {
    render(<ChartSection {...baseProps} />);
    const tablist = screen.getByRole('tablist', { name: 'candle interval' });
    fireEvent.click(within(tablist).getByRole('tab', { name: '1h' }));
    expect(within(tablist).getByRole('tab', { name: '1h' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('token-candle-chart')).toHaveAttribute('data-interval', '1h');
    expect(screen.getByTestId('chart-footer')).toHaveTextContent('1h candles');

    fireEvent.keyDown(within(tablist).getByRole('tab', { name: '1h' }), { key: 'ArrowRight' });
    expect(within(tablist).getByRole('tab', { name: '4h' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tablist).getByRole('tab', { name: '4h' })).toHaveFocus();

    fireEvent.keyDown(within(tablist).getByRole('tab', { name: '4h' }), { key: 'ArrowRight' });
    fireEvent.keyDown(within(tablist).getByRole('tab', { name: '1d' }), { key: 'ArrowRight' });
    expect(within(tablist).getByRole('tab', { name: '5m' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(within(tablist).getByRole('tab', { name: '5m' }), { key: 'ArrowLeft' });
    expect(within(tablist).getByRole('tab', { name: '1d' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the delta strip from the tape, coloured by sign', () => {
    render(<ChartSection {...baseProps} />);
    const strip = screen.getByTestId('chart-deltas');
    expect(strip).toHaveAttribute('aria-label', 'price change');
    expect(DELTA_WINDOWS.map(w => w.label)).toEqual(['5m', '1h', '6h', '24h']);
    expect(screen.getByTestId('chart-delta-5m')).toHaveTextContent('5m+25.0%');
    expect(screen.getByTestId('chart-delta-1h')).toHaveTextContent('1h+150%');
    expect(screen.getByTestId('chart-delta-6h')).toHaveTextContent('6h-50.0%');
    expect(screen.getByTestId('chart-delta-24h')).toHaveTextContent('24h-50.0%');
    expect(screen.getByTestId('chart-delta-5m').querySelector('b')).toHaveClass('cc-up');
    expect(screen.getByTestId('chart-delta-6h').querySelector('b')).toHaveClass('cc-dn');
  });

  it('prints a dash for windows the tape does not reach', () => {
    // A tape that starts 400s ago reaches the 5m window's cutoff but not the 1h one.
    render(<ChartSection {...baseProps} trades={[trade(400, 4, 0), trade(30, 5, 1)]} />);
    expect(screen.getByTestId('chart-delta-5m')).toHaveTextContent('5m+25.0%');
    expect(screen.getByTestId('chart-delta-1h')).toHaveTextContent('1h-');
    expect(screen.getByTestId('chart-delta-1h').querySelector('b')).toHaveClass('cc-mute');
    expect(screen.getByTestId('chart-delta-24h')).toHaveTextContent('24h-');
  });

  it('reads the price in the quote by default and in USD when asked', () => {
    const { rerender } = render(<ChartSection {...baseProps} />);
    expect(screen.getByTestId('chart-price')).toHaveTextContent('STONK 5.00');
    expect(screen.getByTestId('token-candle-chart')).toHaveAttribute('data-mark', 'STONK ');
    rerender(<ChartSection {...baseProps} denomination="usd" />);
    expect(screen.getByTestId('chart-price')).toHaveTextContent('$2.50');
    expect(screen.getByTestId('token-candle-chart')).toHaveAttribute('data-mark', '$');
  });

  it('switches to market cap and back with the mode pills', () => {
    render(<ChartSection {...baseProps} />);
    const modes = screen.getByRole('tablist', { name: 'price or market cap' });
    fireEvent.click(within(modes).getByRole('tab', { name: 'mcap' }));
    expect(screen.getByTestId('chart-price')).toHaveTextContent('mcap STONK 5.00B');
    expect(screen.getByTestId('chart-footer')).toHaveTextContent('mcap STONK 5.00B');
    fireEvent.keyDown(within(modes).getByRole('tab', { name: 'mcap' }), { key: 'ArrowLeft' });
    expect(screen.getByTestId('chart-price')).toHaveTextContent('STONK 5.00');
  });

  it('hides the mode pills without a supply', () => {
    render(<ChartSection {...baseProps} supply={null} />);
    expect(screen.queryByRole('tablist', { name: 'price or market cap' })).toBeNull();
  });

  it('hands the denomination pills to the page', () => {
    const onDenominationChange = vi.fn();
    render(<ChartSection {...baseProps} onDenominationChange={onDenominationChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'USD' }));
    expect(onDenominationChange).toHaveBeenCalledWith('usd');
  });

  it('swaps the canvas for the venue embed behind the source pill', () => {
    render(<ChartSection {...baseProps} />);
    expect(screen.queryByTestId('token-chart-external')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'external' }));
    expect(screen.getByTestId('token-chart-external')).toBeInTheDocument();
    expect(screen.queryByTestId('token-candle-chart')).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'candle interval' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'live' }));
    expect(screen.getByTestId('token-candle-chart')).toBeInTheDocument();
  });

  it('shows the loading and empty states in the canvas slot', () => {
    const { rerender } = render(<ChartSection {...baseProps} trades={[]} tapeLoading />);
    expect(screen.getByTestId('chart-empty')).toHaveTextContent('Loading candles…');
    expect(screen.queryByTestId('token-candle-chart')).toBeNull();

    rerender(<ChartSection {...baseProps} trades={[]} tapeLoading={false} poolOpen />);
    expect(screen.getByTestId('chart-empty')).toHaveTextContent('No trades in this window yet.');
    expect(screen.getByTestId('chart-empty')).toHaveTextContent('The first swap draws the first candle.');

    rerender(<ChartSection {...baseProps} trades={[]} tapeLoading={false} poolOpen={false} denomination="usd" quoteUsd={null} />);
    expect(screen.getByTestId('chart-empty')).toHaveTextContent('No trades on the tape.');
    expect(screen.getByTestId('chart-empty')).toHaveTextContent('No USD price for STONK yet.');
    expect(screen.getByTestId('chart-delta-5m')).toHaveTextContent('-');
  });

  it('notes a reconnecting tape and a missing USD rate in the foot', () => {
    render(<ChartSection {...baseProps} tapeReconnecting denomination="usd" quoteUsd={null} />);
    expect(screen.getByTestId('chart-reconnecting')).toHaveTextContent('reconnecting…');
    expect(screen.getByTestId('chart-footer')).toHaveTextContent('no USD price for STONK yet · showing STONK');
    expect(screen.getByTestId('chart-footer')).not.toHaveTextContent('TradingView');
  });
});

describe('ChartSection from the tracker', () => {
  const candle = (time: number, close: number, open = close): Candle => ({ time, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1, trades: 1, gap: false });
  /** 5m buckets: 25h ago at 10, 5h ago at 2, 30m ago at 4, the open bucket at 5. */
  const fiveMinute = [
    candle(Math.floor((NOW - 25 * 3600) / 300) * 300, 10),
    candle(Math.floor((NOW - 5 * 3600) / 300) * 300, 2),
    candle(Math.floor((NOW - 30 * 60) / 300) * 300, 4),
    candle(Math.floor(NOW / 300) * 300, 5),
  ];
  const fifteenMinute = [candle(Math.floor((NOW - 3600) / 900) * 900, 3), candle(Math.floor(NOW / 900) * 900, 5)];

  beforeEach(() => {
    useLaunchCandles.mockReset().mockImplementation((_mint: string, interval: string) => ({
      ...idle,
      data: interval === '5m' ? fiveMinute : interval === '1h' ? [candle(Math.floor(NOW / 3600) * 3600, 5)] : fifteenMinute,
    }));
  });

  it("draws the tracker's candles for the interval and reads the deltas off its 5m series", () => {
    render(<ChartSection {...baseProps} trades={[]} candleSource="tracker" />);
    expect(screen.getByTestId('token-chart')).toHaveAttribute('data-candle-source', 'tracker');
    expect(useLaunchCandles).toHaveBeenCalledWith('MintAAA', '15m', expect.objectContaining({ enabled: true }));
    expect(useLaunchCandles).toHaveBeenCalledWith('MintAAA', '5m', expect.objectContaining({ enabled: true, limit: 300 }));
    expect(screen.getByTestId('token-candle-chart')).toHaveAttribute('data-interval', '15m');
    // Two 15m buckets an hour apart: the gaps between them are filled.
    expect(Number(screen.getByTestId('token-candle-chart').getAttribute('data-count'))).toBeGreaterThanOrEqual(5);
    expect(screen.getByTestId('chart-price')).toHaveTextContent('STONK 5.00');
    expect(screen.getByTestId('chart-delta-5m')).toHaveTextContent('5m+25.0%');
    expect(screen.getByTestId('chart-delta-6h')).toHaveTextContent('6h-50.0%');
    expect(screen.getByTestId('chart-delta-24h')).toHaveTextContent('24h-50.0%');
    expect(screen.getByTestId('chart-footer')).toHaveTextContent('tracker candles');
  });

  it("prefers the tracker's own 24h change and rolls 4h up from 1h", () => {
    render(<ChartSection {...baseProps} trades={[]} candleSource="tracker" change24hPct={12.5} />);
    expect(screen.getByTestId('chart-delta-24h')).toHaveTextContent('24h+12.5%');
    const tablist = screen.getByRole('tablist', { name: 'candle interval' });
    fireEvent.click(within(tablist).getByRole('tab', { name: '4h' }));
    expect(useLaunchCandles).toHaveBeenCalledWith('MintAAA', '1h', expect.objectContaining({ enabled: true, limit: 500 }));
    expect(screen.getByTestId('token-candle-chart')).toHaveAttribute('data-interval', '4h');
  });

  it('leaves the tracker queries off for a tape-sourced chart and shows its loading state', () => {
    useLaunchCandles.mockReturnValue({ ...idle, isLoading: true });
    const { unmount } = render(<ChartSection {...baseProps} trades={[]} candleSource="tracker" />);
    expect(screen.getByTestId('chart-empty')).toHaveTextContent('Loading candles…');
    unmount();
    render(<ChartSection {...baseProps} />);
    expect(useLaunchCandles).toHaveBeenLastCalledWith('MintAAA', '5m', expect.objectContaining({ enabled: false }));
  });
});
