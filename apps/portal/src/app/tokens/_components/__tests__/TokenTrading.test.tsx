/**
 * TokenTrading: buy/sell tabs, quote-denominated input, quick chips, slippage,
 * live quote and fee line, CTA states, and the wallet sign-and-send path with
 * its sign-only fallback on our RPC.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { launched, legacy, pool } from './fixtures';

const walletState = {
  installed: true,
  connected: true,
  publicKey: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' as string | null,
  shortAddress: '7xKX...gAsU',
  balance: 1.5,
  connecting: false,
  error: null,
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  fetchBalance: vi.fn(async () => {}),
  sign: vi.fn(async (tx: unknown) => tx),
  signAndSend: vi.fn(async () => ({ signature: 'SIGNATURE111' })),
};

vi.mock('@/lib/wallet', () => ({ useWalletService: () => walletState }));

const balances: Record<string, number> = {};
vi.mock('@/lib/api/hooks', () => ({
  useHolderBalance: (mint: string | null) => ({ balance: mint ? (balances[mint] ?? 0) : 0, isHolder: false, loading: false }),
}));

const addToast = vi.fn();
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast }) }));

const sendSigned = vi.fn(async (_tx: unknown) => 'SIGNATURE222');
const confirmSignature = vi.fn(async (_signature: string) => undefined);
vi.mock('@/lib/launchlab/build-launch', () => ({
  isMockLaunch: () => false,
  sendSigned: (tx: unknown) => sendSigned(tx),
  confirmSignature: (signature: string) => confirmSignature(signature),
}));

const quoteBuy = vi.fn();
const quoteSell = vi.fn();
const buildBuy = vi.fn(async (_params: unknown) => ({ kind: 'buy-tx' }));
const buildSell = vi.fn(async (_params: unknown) => ({ kind: 'sell-tx' }));
vi.mock('@/lib/launchlab/trading', () => ({
  quoteBuy: (pool: unknown, amount: number, slippage: number) => quoteBuy(pool, amount, slippage),
  quoteSell: (pool: unknown, amount: number, slippage: number) => quoteSell(pool, amount, slippage),
  buildBuy: (params: unknown) => buildBuy(params),
  buildSell: (params: unknown) => buildSell(params),
  classifyTradeError: (err: unknown) => (err instanceof Error ? err.message : 'failed'),
}));

import { TokenTrading } from '../TokenTrading';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const quote = {
  amountIn: 100,
  amountOut: 2_400_000,
  minAmountOut: 2_376_000,
  feeQuote: 1.25,
  priceQuote: 0.0000416,
  priceImpactPct: 1.2,
};

describe('TokenTrading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletState.connected = true;
    walletState.publicKey = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    balances[pool.quoteMint] = 500 * 10 ** pool.quoteDecimals; // 500 STONK
    balances[pool.mint] = 1_000 * 10 ** pool.baseDecimals; // 1,000 HOUND
    quoteBuy.mockResolvedValue(quote);
    quoteSell.mockResolvedValue({ ...quote, amountIn: 1_000, amountOut: 0.04, minAmountOut: 0.0396 });
  });

  it('lets the amount be typed with decimals and drops anything else', () => {
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));
    const input = screen.getByTestId('trade-amount') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0.' } });
    expect(input.value).toBe('0.');
    fireEvent.change(input, { target: { value: '0,5' } });
    expect(input.value).toBe('0.5');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.value).toBe('0.5');
  });

  it('opens on Buy, denominated in the quote, with the balance and quick chips', () => {
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));

    expect(screen.getByTestId('tab-buy')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Amount in STONK')).toBeInTheDocument();
    expect(screen.getByText('STONK', { selector: 'span.rounded-md' })).toBeInTheDocument();
    expect(screen.getByText(/Balance/)).toHaveTextContent('500');
    expect(screen.getByTestId('trade-quick-amounts')).toHaveTextContent('10 STONK50 STONK100 STONK500 STONK');
    expect(screen.getByTestId('trade-fee-line')).toHaveTextContent('2.25% fee per trade: 0.25% Raydium · 1% StonkAgents · 1% holders');
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('Enter STONK amount');
    expect(screen.getByTestId('trade-submit')).toBeDisabled();
  });

  it("quotes a buy after the debounce, net of the holders' share", async () => {
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));

    fireEvent.click(screen.getByRole('button', { name: '100 STONK' }));
    expect(screen.getByLabelText('Amount in STONK')).toHaveValue('100');

    await waitFor(() => expect(quoteBuy).toHaveBeenCalledWith(pool, 100, 100));
    // 2,400,000 out, minus the holders' 1% collected on delivery.
    await waitFor(() => expect(screen.getByTestId('trade-receive')).toHaveTextContent('~2,376,000 HOUND'));
    expect(screen.getByTestId('trade-impact')).toHaveTextContent('1.20%');
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('Buy HOUND');
    expect(screen.getByTestId('trade-submit')).toBeEnabled();
  });

  it('switches to Sell: token-denominated, MAX and percent chips, red CTA', async () => {
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));

    fireEvent.click(screen.getByTestId('tab-sell'));
    expect(screen.getByLabelText('Amount in HOUND')).toBeInTheDocument();
    expect(screen.getByTestId('trade-quick-amounts')).toHaveTextContent('25%50%75%100%');

    fireEvent.click(screen.getByRole('button', { name: '50%' }));
    expect(screen.getByLabelText('Amount in HOUND')).toHaveValue('500');

    fireEvent.click(screen.getByTestId('trade-max'));
    expect(screen.getByLabelText('Amount in HOUND')).toHaveValue('1000');

    await waitFor(() => expect(quoteSell).toHaveBeenCalledWith(pool, 1000, 100));
    await waitFor(() => expect(screen.getByTestId('trade-receive')).toHaveTextContent('~0.04 STONK'));
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('Sell HOUND');
  });

  it('flags an amount above the balance and disables the CTA', () => {
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));

    fireEvent.change(screen.getByLabelText('Amount in STONK'), { target: { value: '900' } });
    expect(screen.getByTestId('trade-submit')).toHaveTextContent('Insufficient STONK');
    expect(screen.getByTestId('trade-submit')).toBeDisabled();
  });

  it('changes slippage from the popover, presets and custom', async () => {
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));

    fireEvent.click(screen.getByTestId('slippage-toggle'));
    fireEvent.click(screen.getByRole('radio', { name: '5%' }));
    expect(screen.getByTestId('slippage-toggle')).toHaveTextContent('5%');
    expect(screen.queryByTestId('slippage-popover')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('slippage-toggle'));
    fireEvent.change(screen.getByTestId('slippage-custom'), { target: { value: '3.5' } });
    expect(screen.getByTestId('slippage-toggle')).toHaveTextContent('3.5%');

    fireEvent.change(screen.getByLabelText('Amount in STONK'), { target: { value: '10' } });
    await waitFor(() => expect(quoteBuy).toHaveBeenCalledWith(pool, 10, 350));
  });

  it('has the wallet sign and send, confirms the signature, and shows the explorer link', async () => {
    const onTraded = vi.fn();
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" onTraded={onTraded} />));

    fireEvent.change(screen.getByLabelText('Amount in STONK'), { target: { value: '10' } });
    await waitFor(() => expect(screen.getByTestId('trade-submit')).toBeEnabled());

    await act(async () => {
      fireEvent.click(screen.getByTestId('trade-submit'));
    });

    expect(buildBuy).toHaveBeenCalledWith({ pool, wallet: walletState.publicKey, amount: 10, slippageBps: 100 });
    expect(walletState.signAndSend).toHaveBeenCalledWith({ kind: 'buy-tx' });
    expect(walletState.sign).not.toHaveBeenCalled();
    expect(sendSigned).not.toHaveBeenCalled();
    expect(confirmSignature).toHaveBeenCalledWith('SIGNATURE111');
    await waitFor(() => expect(screen.getByTestId('trade-status')).toHaveTextContent('Trade confirmed'));
    expect(screen.getByTestId('trade-status').querySelector('a')?.getAttribute('href')).toContain('SIGNATURE111');
    expect(onTraded).toHaveBeenCalled();
    expect(walletState.fetchBalance).toHaveBeenCalled();
  });

  it('falls back to sign-only and our own RPC when the wallet cannot send', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    walletState.signAndSend.mockRejectedValueOnce(new Error('Failed to send transaction'));
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));

    fireEvent.change(screen.getByLabelText('Amount in STONK'), { target: { value: '10' } });
    await waitFor(() => expect(screen.getByTestId('trade-submit')).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByTestId('trade-submit'));
    });

    expect(walletState.sign).toHaveBeenCalledWith({ kind: 'buy-tx' });
    expect(sendSigned).toHaveBeenCalledWith({ kind: 'buy-tx' });
    expect(confirmSignature).toHaveBeenCalledWith('SIGNATURE222');
    await waitFor(() => expect(screen.getByTestId('trade-status')).toHaveTextContent('Trade confirmed'));
    expect(screen.getByTestId('trade-status').querySelector('a')?.getAttribute('href')).toContain('SIGNATURE222');
  });

  it('stops at a wallet rejection without asking the wallet again', async () => {
    walletState.signAndSend.mockRejectedValueOnce(new Error('User rejected the request.'));
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));

    fireEvent.change(screen.getByLabelText('Amount in STONK'), { target: { value: '10' } });
    await waitFor(() => expect(screen.getByTestId('trade-submit')).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByTestId('trade-submit'));
    });

    await waitFor(() => expect(screen.getByTestId('trade-status')).toHaveTextContent('User rejected'));
    expect(walletState.sign).not.toHaveBeenCalled();
    expect(sendSigned).not.toHaveBeenCalled();
  });

  it('shows the error state when the confirm fails', async () => {
    confirmSignature.mockRejectedValueOnce(new Error('The price moved past your slippage. Try again.'));
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));

    fireEvent.change(screen.getByLabelText('Amount in STONK'), { target: { value: '10' } });
    await waitFor(() => expect(screen.getByTestId('trade-submit')).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByTestId('trade-submit'));
    });

    await waitFor(() => expect(screen.getByTestId('trade-status')).toHaveTextContent('price moved past your slippage'));
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });

  it('offers connect when the wallet is not connected', () => {
    walletState.connected = false;
    walletState.publicKey = null;
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));

    fireEvent.click(screen.getByTestId('trade-connect'));
    expect(walletState.connect).toHaveBeenCalled();
    expect(screen.getByLabelText('Amount in STONK')).toBeDisabled();
  });

  it('sends a graduated pool to Raydium', () => {
    render(wrap(<TokenTrading token={launched} pool={{ ...pool, status: 2, graduated: true }} quoteSymbol="STONK" />));

    expect(screen.getByTestId('trade-on-raydium')).toHaveAttribute('href', expect.stringContaining(launched.mint));
    expect(screen.queryByTestId('trade-amount')).not.toBeInTheDocument();
  });

  it('explains a missing pool and a legacy token', () => {
    const { rerender } = render(wrap(<TokenTrading token={launched} quoteSymbol="STONK" poolError="boom" />));
    expect(screen.getByTestId('token-trading-unavailable')).toHaveTextContent('boom');

    rerender(wrap(<TokenTrading token={legacy} quoteSymbol={null} />));
    expect(screen.getByText(/predates the launchpad/)).toBeInTheDocument();
  });
});

describe('TokenTrading round 2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletState.connected = true;
    walletState.publicKey = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    balances[pool.quoteMint] = 500 * 10 ** pool.quoteDecimals;
    balances[pool.mint] = 1_000 * 10 ** pool.baseDecimals;
    quoteBuy.mockResolvedValue(quote);
  });

  it('takes a USD amount on a buy and quotes the curve in the quote asset', async () => {
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" quoteUsd={0.5} />));

    fireEvent.click(screen.getByTestId('trade-denom-usd'));
    expect(screen.getByLabelText('Amount in USD')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Amount in USD'), { target: { value: '50' } });
    expect(screen.getByTestId('trade-converted')).toHaveTextContent('≈ 100 STONK');
    await waitFor(() => expect(quoteBuy).toHaveBeenCalledWith(pool, 100, 100));
    await waitFor(() => expect(screen.getByTestId('trade-receive')).toHaveTextContent('~2,376,000 HOUND'));
    expect(screen.getByText('≈ $50.00')).toBeInTheDocument();
    expect(screen.getByTestId('trade-lp-fee')).toHaveTextContent('1.25 STONK');
    expect(screen.getByText('Max slippage')).toBeInTheDocument();
    expect(screen.getByText('Min. received')).toBeInTheDocument();

    // Quick chips write the USD equivalent when the input is in USD.
    fireEvent.click(screen.getByRole('button', { name: '10 STONK' }));
    expect(screen.getByLabelText('Amount in USD')).toHaveValue('5');

    // Switching back converts the typed figure to the quote.
    fireEvent.click(screen.getByTestId('trade-denom-quote'));
    expect(screen.getByLabelText('Amount in STONK')).toHaveValue('10');
  });

  it('warns on tight and wide slippage', () => {
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));
    expect(screen.queryByTestId('trade-slippage-note')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('slippage-toggle'));
    fireEvent.change(screen.getByTestId('slippage-custom'), { target: { value: '0.1' } });
    expect(screen.getByTestId('trade-slippage-note')).toHaveTextContent('That tight, the swap may not clear.');

    fireEvent.change(screen.getByTestId('slippage-custom'), { target: { value: '12' } });
    expect(screen.getByTestId('trade-slippage-note')).toHaveTextContent('wide door');
  });

  it('colours a mid price impact yellow', async () => {
    quoteBuy.mockResolvedValue({ ...quote, priceImpactPct: 3 });
    render(wrap(<TokenTrading token={launched} pool={pool} quoteSymbol="STONK" />));
    fireEvent.change(screen.getByLabelText('Amount in STONK'), { target: { value: '10' } });
    await waitFor(() => expect(screen.getByTestId('trade-impact')).toHaveTextContent('3.00%'));
    expect(screen.getByTestId('trade-impact')).toHaveClass('text-accent-yellow');
  });
});
