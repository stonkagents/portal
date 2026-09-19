/**
 * The trade panel for the Network token via stonkfun: the in-app Jupiter
 * swap instead of an external link. Buy and sell tabs, the amount and its
 * quick chips, the quote box with the rate, the floor and the route, the
 * price impact colours, every reason the button is off, the outcome lines,
 * and Jupiter's own page kept as a second door. The hook is faked here; its
 * own tests cover quoting and the swap itself.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { parseStonkfunToken } from '@/lib/api/stonkfun';
import type { JupiterSwapController, SwapQuoteView, SwapStatus } from '@/lib/jupiter/use-jupiter-swap';
import { stonkfunAgentToken } from '../../_lib/external-token';

const { STONK, KNOTS } = vi.hoisted(() => ({
  STONK: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  KNOTS: '8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS',
}));
const JUPITER = `https://jup.ag/swap/${STONK}-${KNOTS}`;

const walletState = {
  installed: true,
  connected: true,
  publicKey: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' as string | null,
  shortAddress: '7xKX...gAsU',
  balance: 1.5,
  connecting: false,
  error: null,
  connect: vi.fn(async () => true),
  disconnect: vi.fn(async () => undefined),
  fetchBalance: vi.fn(async () => undefined),
  sign: vi.fn(async (tx: unknown) => tx),
  signAndSend: vi.fn(async () => ({ signature: 'x' })),
};
vi.mock('@/lib/wallet', () => ({ useWalletService: () => walletState }));
vi.mock('@/lib/api/hooks', () => ({
  useHolderBalance: () => ({ balance: 0, isHolder: false, loading: false }),
}));
const addToast = vi.fn();
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast }) }));
vi.mock('@/lib/launchlab/build-launch', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/launchlab/build-launch');
  return { ...actual, isMockLaunch: () => false };
});
vi.mock('@/lib/agent-token', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/agent-token');
  return { ...actual, AGENT_MINT: KNOTS, AGENT_QUOTE_MINT: STONK, AGENT_VIA_STONKFUN: true };
});

const swap = vi.fn(async () => ({
  ok: true as const,
  result: { signature: 'SIG', side: 'buy' as const, amountIn: 1, amountOut: 10.87, inSymbol: 'STONK', outSymbol: 'KNOTS' },
}));
const setSide = vi.fn();
const setAmount = vi.fn();
const setMax = vi.fn();
const setSlippageBps = vi.fn();
const hookParams = vi.fn();

const quoteFixture: SwapQuoteView = {
  amountIn: 1,
  amountOut: 10.866717,
  minReceived: 10.75805,
  rate: 10.866717,
  priceImpactPct: 0.0277,
  route: 'Raydium CLMM',
  quotedAt: 0,
  raw: {} as SwapQuoteView['raw'],
};

let controller: JupiterSwapController;
function baseController(overrides: Partial<JupiterSwapController> = {}): JupiterSwapController {
  return {
    side: 'buy',
    setSide,
    amount: '',
    setAmount,
    setMax,
    slippageBps: 100,
    setSlippageBps,
    inSymbol: 'STONK',
    outSymbol: 'KNOTS',
    inDecimals: 9,
    outDecimals: 6,
    balanceIn: 250,
    balanceOut: 1_000,
    ready: true,
    amountValid: false,
    insufficient: false,
    blocked: null,
    quote: null,
    quoting: false,
    quoteError: null,
    status: { kind: 'idle' } as SwapStatus,
    swap,
    reset: vi.fn(),
    refetchBalances: vi.fn(),
    ...overrides,
  };
}
vi.mock('@/lib/jupiter/use-jupiter-swap', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/jupiter/use-jupiter-swap');
  return {
    ...actual,
    useJupiterSwap: (params: unknown) => {
      hookParams(params);
      return controller;
    },
  };
});

import { TokenTrading } from '../TokenTrading';

const knots = parseStonkfunToken(
  JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', '..', 'lib', 'api', '__fixtures__', 'stonkfun', 'knots-token.json'), 'utf8'),
  ),
)!;
const token = stonkfunAgentToken(knots);

function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}
const renderPanel = (props: Partial<Parameters<typeof TokenTrading>[0]> = {}) =>
  render(
    <TokenTrading
      token={token}
      pool={undefined}
      poolError={null}
      poolLoading={false}
      quoteSymbol="STONK"
      quoteUsd={null}
      externalHref={JUPITER}
      inAppSwap
      {...props}
    />,
    { wrapper: Providers },
  );

beforeEach(() => {
  controller = baseController();
  walletState.connected = true;
  walletState.publicKey = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  [swap, setSide, setAmount, setMax, setSlippageBps, hookParams, addToast].forEach(fn => fn.mockClear());
});

describe('TokenTrading via stonkfun: the in-app Jupiter swap', () => {
  it('renders the swap panel for the network pair, not the external link, with Jupiter as a second door', () => {
    renderPanel();
    const panel = screen.getByTestId('token-trading');
    expect(panel).toHaveAttribute('data-source', 'jupiter');
    expect(panel).toHaveAttribute('id', 'trade');
    expect(screen.queryByTestId('token-trading-external')).toBeNull();
    expect(hookParams).toHaveBeenCalledWith(
      expect.objectContaining({ tokenMint: KNOTS, quoteMint: STONK, tokenSymbol: 'KNOTS', quoteSymbol: 'STONK' }),
    );
    const door = screen.getByTestId('trade-open-jupiter');
    expect(door).toHaveAttribute('href', JUPITER);
    expect(door).toHaveAttribute('target', '_blank');
    expect(door).toHaveTextContent('Open on Jupiter');
    expect(screen.getByTestId('trade-route')).toHaveTextContent('via Jupiter');
  });

  it('keeps the external link when the swap is not asked for', () => {
    renderPanel({ inAppSwap: false });
    expect(screen.getByTestId('token-trading-external')).toHaveAttribute('href', JUPITER);
    expect(screen.queryByTestId('trade-open-jupiter')).toBeNull();
  });

  it('has buy and sell tabs; sell reads the token balance and offers percent chips, buy offers quote amounts', () => {
    const { rerender } = renderPanel();
    expect(screen.getByTestId('tab-buy')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Balance/)).toHaveTextContent('Balance 250 STONK');
    expect(screen.getByTestId('trade-quick-amounts')).toHaveTextContent('10 STONK50 STONK100 STONK500 STONK');
    fireEvent.click(screen.getByText('50 STONK'));
    expect(setAmount).toHaveBeenCalledWith('50');
    fireEvent.click(screen.getByTestId('tab-sell'));
    expect(setSide).toHaveBeenCalledWith('sell');

    controller = baseController({ side: 'sell', inSymbol: 'KNOTS', outSymbol: 'STONK', balanceIn: 1_000, balanceOut: 250 });
    rerender(
      <Providers>
        <TokenTrading
          token={token}
          pool={undefined}
          poolError={null}
          poolLoading={false}
          quoteSymbol="STONK"
          quoteUsd={null}
          inAppSwap
        />
      </Providers>,
    );
    expect(screen.getByTestId('tab-sell')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Balance/)).toHaveTextContent('Balance 1,000 KNOTS');
    expect(screen.getByTestId('trade-quick-amounts')).toHaveTextContent('25%50%75%100%');
    fireEvent.click(screen.getByText('25%'));
    expect(setAmount).toHaveBeenCalledWith('250');
    fireEvent.click(screen.getByTestId('trade-max'));
    expect(setMax).toHaveBeenCalled();
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('Enter KNOTS amount');
  });

  it('types an amount freely and hands it to the hook', () => {
    renderPanel();
    fireEvent.change(screen.getByTestId('trade-amount'), { target: { value: '12,5' } });
    expect(setAmount).toHaveBeenCalledWith('12.5');
    fireEvent.change(screen.getByTestId('trade-amount'), { target: { value: 'abc' } });
    expect(setAmount).toHaveBeenCalledTimes(1);
  });

  it('shows the quote: what lands, the rate line, the floor, the route, the transfer tax', () => {
    controller = baseController({ amount: '1', amountValid: true, quote: quoteFixture });
    renderPanel();
    expect(screen.getByTestId('trade-receive')).toHaveTextContent('~10.8667 KNOTS');
    expect(screen.getByTestId('trade-rate')).toHaveTextContent('~10.8667 KNOTS for 1 STONK');
    expect(screen.getByTestId('trade-min-received')).toHaveTextContent('10.7581 KNOTS');
    expect(screen.getByTestId('trade-route')).toHaveTextContent('via Jupiter (Raydium CLMM)');
    expect(screen.getByTestId('trade-impact')).toHaveTextContent('0.03%');
    expect(screen.getByTestId('trade-impact').className).toContain('text-text-secondary');
    expect(screen.queryByTestId('trade-impact-note')).toBeNull();
    expect(screen.getByTestId('trade-tax-line')).toHaveTextContent('KNOTS charges a 3% transfer tax on every transfer.');
    const cta = screen.getByTestId('trade-submit');
    expect(cta).toHaveTextContent('Buy KNOTS');
    expect(cta).toBeEnabled();
    fireEvent.click(cta);
    expect(swap).toHaveBeenCalledTimes(1);
  });

  it('colours the price impact amber above 2% and red above 5%, with a note', () => {
    controller = baseController({ amount: '1', amountValid: true, quote: { ...quoteFixture, priceImpactPct: 2.4 } });
    const { rerender } = renderPanel();
    expect(screen.getByTestId('trade-impact')).toHaveTextContent('2.40%');
    expect(screen.getByTestId('trade-impact').className).toContain('text-accent-yellow');
    expect(screen.getByTestId('trade-impact-note')).toHaveTextContent('moves the price by more than 2%');

    controller = baseController({ amount: '1', amountValid: true, quote: { ...quoteFixture, priceImpactPct: 7.5 } });
    rerender(
      <Providers>
        <TokenTrading
          token={token}
          pool={undefined}
          poolError={null}
          poolLoading={false}
          quoteSymbol="STONK"
          quoteUsd={null}
          inAppSwap
        />
      </Providers>,
    );
    expect(screen.getByTestId('trade-impact').className).toContain('text-accent-red');
    expect(screen.getByTestId('trade-impact-note')).toHaveTextContent('more than 5%. Consider a smaller amount.');
  });

  it('is off, and says why: no amount, more than held, no quote, the hook blocked, a swap in flight', () => {
    const { rerender } = renderPanel();
    const again = () =>
      rerender(
        <Providers>
          <TokenTrading
            token={token}
            pool={undefined}
            poolError={null}
            poolLoading={false}
            quoteSymbol="STONK"
            quoteUsd={null}
            inAppSwap
          />
        </Providers>,
      );
    expect(screen.getByTestId('trade-submit')).toBeDisabled();
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('Enter STONK amount');

    controller = baseController({ amount: '900', amountValid: true, insufficient: true, quote: quoteFixture });
    again();
    expect(screen.getByTestId('trade-submit')).toBeDisabled();
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('Insufficient STONK');
    expect(screen.getByTestId('trade-amount').className).toContain('border-accent-red');

    controller = baseController({
      amount: '1',
      amountValid: true,
      quoteError: 'Jupiter found no route for that amount. Try a smaller one.',
    });
    again();
    expect(screen.getByTestId('trade-submit')).toBeDisabled();
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('No quote');
    expect(screen.getByTestId('trade-quote-error')).toHaveTextContent('Jupiter found no route');

    controller = baseController({
      amount: '1',
      amountValid: true,
      quote: quoteFixture,
      blocked: 'This wallet needs a little SOL for network fees (about 0.003 SOL).',
    });
    again();
    expect(screen.getByTestId('trade-submit')).toBeDisabled();
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('Swap unavailable');
    expect(screen.getByTestId('trade-blocked')).toHaveTextContent('needs a little SOL');

    controller = baseController({ amount: '1', amountValid: true, quote: quoteFixture, status: { kind: 'pending', step: 'sign' } });
    again();
    expect(screen.getByTestId('trade-submit')).toBeDisabled();
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('Confirm in wallet');
    expect(screen.getByTestId('trade-amount')).toBeDisabled();

    controller = baseController({ amount: '1', amountValid: true, quote: quoteFixture, status: { kind: 'pending', step: 'confirm' } });
    again();
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('Confirming');
  });

  it('asks for a wallet when none is connected', () => {
    walletState.connected = false;
    walletState.publicKey = null;
    controller = baseController({ blocked: 'Connect a wallet to swap.', balanceIn: 0, balanceOut: 0 });
    renderPanel();
    expect(screen.getByText('Wallet not connected')).toBeInTheDocument();
    expect(screen.queryByTestId('trade-submit')).toBeNull();
    expect(screen.queryByTestId('trade-blocked')).toBeNull();
    expect(screen.getByTestId('trade-amount')).toBeDisabled();
    fireEvent.click(screen.getByTestId('trade-connect'));
    expect(walletState.connect).toHaveBeenCalled();
  });

  it('shows the outcome: a confirmed swap with its explorer link, or the one line that went wrong', () => {
    controller = baseController({
      status: {
        kind: 'confirmed',
        result: {
          signature: 'SIGabcdefghijklmnop',
          side: 'buy',
          amountIn: 10,
          amountOut: 108.67,
          inSymbol: 'STONK',
          outSymbol: 'KNOTS',
        },
      },
    });
    const { rerender } = renderPanel();
    expect(screen.getByTestId('trade-status')).toHaveTextContent('Swapped 10 STONK for ~108.67 KNOTS.');
    expect(screen.getByTestId('trade-status-link')).toHaveAttribute('href', expect.stringContaining('/tx/SIGabcdefghijklmnop'));

    controller = baseController({
      status: { kind: 'error', error: { kind: 'rejected', message: 'You rejected the transaction in your wallet.' } },
    });
    rerender(
      <Providers>
        <TokenTrading
          token={token}
          pool={undefined}
          poolError={null}
          poolLoading={false}
          quoteSymbol="STONK"
          quoteUsd={null}
          inAppSwap
        />
      </Providers>,
    );
    expect(screen.getByTestId('trade-status')).toHaveTextContent('You rejected the transaction in your wallet.');
  });

  it('toasts a failed swap with the classified line', async () => {
    swap.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'slippage', message: 'The price moved past your slippage before the swap landed. Raise it or try again.' },
    } as never);
    controller = baseController({ amount: '1', amountValid: true, quote: quoteFixture });
    renderPanel();
    fireEvent.click(screen.getByTestId('trade-submit'));
    await vi.waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error', title: expect.stringContaining('slippage') })),
    );
  });

  it('uses the swap slippage presets', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('slippage-toggle'));
    expect(screen.getByRole('radiogroup', { name: 'Slippage' })).toHaveTextContent('0.5%1%3%');
    fireEvent.click(screen.getByText('3%'));
    expect(setSlippageBps).toHaveBeenCalledWith(300);
  });
});
