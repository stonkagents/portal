/**
 * The swap hook against a fake wallet, a fake RPC and Jupiter's recorded
 * answers: it quotes a beat after typing and keeps the quote fresh, refuses
 * a stale one before building, and walks a swap from quote to confirmation
 * (or to one line when the wallet says no or the balance is short). The wallet
 * sends the swap itself; when it cannot, the hook signs only and sends on our
 * RPC. No transaction is ever sent anywhere real.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STONK = '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';
const KNOTS = '8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS';
const TRADER = 'FWxdnjw6oYjRWHxBrmQ9eAQoWmn1z1fYNxU7mNjRZtho';
const SIG = 'SIG1111111111111111111111111111111111111111111111111111111111111111111111111111111111111';
const fixtures = join(__dirname, '..', 'api', '__fixtures__', 'jupiter');
const read = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));

const wallet = {
  installed: true,
  connected: true,
  publicKey: TRADER as string | null,
  shortAddress: 'FWxd...Ztho',
  balance: 0.5,
  connecting: false,
  error: null,
  network: 'solana:mainnet' as string | null,
  connect: vi.fn(async () => true),
  disconnect: vi.fn(async () => undefined),
  fetchBalance: vi.fn(async () => undefined),
  sign: vi.fn(async (tx: unknown) => tx),
  signAndSend: vi.fn(async (_tx: unknown) => ({ signature: SIG })),
};
vi.mock('@/lib/wallet', () => ({ useWalletService: () => wallet }));

/** Raw balances per mint, as the chain would report them. */
const balances: Record<string, number> = {};
vi.mock('@/lib/api/hooks', () => ({
  useHolderBalance: (mint: string | null, owner: string | null) => ({
    balance: mint && owner ? (balances[mint] ?? 0) : 0,
    isHolder: false,
    loading: false,
  }),
}));

vi.mock('./mint-decimals', () => ({
  fetchMintDecimals: async (mint: string) =>
    mint === KNOTS
      ? { decimals: 6, program: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxEwG', isToken2022: true }
      : { decimals: 9, program: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', isToken2022: false },
}));

// The send and confirm themselves are covered in swap-transaction.test.ts (node realm: jsdom's Uint8Array is not web3.js's).
const sendSignedSwap = vi.fn(async (_tx: unknown) => 'SIG2222222222222222222222222222222222222222222222222222222222222222222222222222222222222');
const confirmSwap = vi.fn(async (_signature: string, _options: unknown) => undefined);
vi.mock('./swap-transaction', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./swap-transaction');
  return {
    ...actual,
    sendSignedSwap: (tx: unknown) => sendSignedSwap(tx),
    confirmSwap: (signature: string, options: unknown) => confirmSwap(signature, options),
  };
});
vi.mock('@/lib/solana/connection', () => ({
  getSolanaConnection: async () => {
    throw new Error('no RPC in this test');
  },
  loadWeb3: () => import('@solana/web3.js'),
}));

vi.mock('@/config', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/config');
  return { ...actual, config: { ...(actual.config as Record<string, unknown>), cluster: 'mainnet' } };
});

import { useJupiterSwap, QUOTE_DEBOUNCE_MS, QUOTE_REFRESH_MS, STALE_QUOTE_MS, toRawUnits, quoteView } from './use-jupiter-swap';
import { parseJupiterQuote } from '@/lib/api/jupiter';

const fetchMock = vi.fn<typeof fetch>();
const jsonResponse = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

/** Route Jupiter's endpoints to the recorded answers; the swap fixture with a clean simulation. */
function routeJupiter(overrides: { quote?: () => Response; swap?: () => Response } = {}) {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/quote')) {
      if (overrides.quote) return overrides.quote();
      const search = new URL(url).searchParams;
      return jsonResponse(read(search.get('inputMint') === STONK ? 'quote-stonk-to-knots.json' : 'quote-knots-to-stonk.json'));
    }
    if (url.endsWith('/swap'))
      return overrides.swap ? overrides.swap() : jsonResponse({ ...read('swap.json'), simulationError: null });
    throw new Error(`unexpected fetch ${url}`);
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const onSwapped = vi.fn();
const renderSwap = () =>
  renderHook(() => useJupiterSwap({ tokenMint: KNOTS, quoteMint: STONK, tokenSymbol: 'KNOTS', quoteSymbol: 'STONK', onSwapped }), {
    wrapper,
  });

const quoteCalls = () => fetchMock.mock.calls.filter(([input]) => String(input).includes('/quote')).length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-09-15T05:00:00Z'));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  routeJupiter();
  wallet.connected = true;
  wallet.publicKey = TRADER;
  wallet.balance = 0.5;
  wallet.network = 'solana:mainnet';
  wallet.sign.mockReset().mockImplementation(async (tx: unknown) => tx);
  wallet.signAndSend.mockReset().mockImplementation(async (_tx: unknown) => ({ signature: SIG }));
  wallet.fetchBalance.mockClear();
  sendSignedSwap.mockClear();
  confirmSwap.mockClear();
  onSwapped.mockClear();
  balances[STONK] = 250 * 1e9;
  balances[KNOTS] = 1_000 * 1e6;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A tick of the faked clock with the microtask queue drained: enough for a resolved fetch and react-query's notify. */
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
/** Both mint reads settled. */
async function untilReady(result: { current: { ready: boolean } }) {
  for (let i = 0; i < 10 && !result.current.ready; i += 1) await flush();
  expect(result.current.ready).toBe(true);
}

describe('units', () => {
  it('converts whole units to raw units with the mint decimals, exactly', () => {
    expect(toRawUnits(1, 9)).toBe(BigInt(1_000_000_000));
    expect(toRawUnits(0.1, 6)).toBe(BigInt(100_000));
    expect(toRawUnits(1.23456789, 6)).toBe(BigInt(1_234_568));
    expect(toRawUnits(0, 6)).toBeNull();
    expect(toRawUnits(NaN, 6)).toBeNull();
    expect(toRawUnits(0.0000001, 6)).toBeNull();
  });

  it('reads a quote into whole units, a rate, a floor and the route', () => {
    const view = quoteView(parseJupiterQuote(read('quote-stonk-to-knots.json'))!, 9, 6, 123);
    expect(view.amountIn).toBe(1);
    expect(view.amountOut).toBeCloseTo(10.866717, 6);
    expect(view.minReceived).toBeCloseTo(10.75805, 5);
    expect(view.rate).toBeCloseTo(10.866717, 6);
    expect(view.route).toBe('Raydium CP');
    expect(view.quotedAt).toBe(123);
  });
});

describe('useJupiterSwap', () => {
  it('starts on buy with both balances in whole units and no quote', async () => {
    const { result } = renderSwap();
    await untilReady(result);
    expect(result.current.side).toBe('buy');
    expect(result.current.inSymbol).toBe('STONK');
    expect(result.current.outSymbol).toBe('KNOTS');
    expect(result.current.balanceIn).toBe(250);
    expect(result.current.balanceOut).toBe(1_000);
    expect(result.current.quote).toBeNull();
    expect(result.current.blocked).toBeNull();
    expect(quoteCalls()).toBe(0);
  });

  it('quotes a beat after the amount settles, in raw units of the input, and refreshes on a timer', async () => {
    const { result } = renderSwap();
    await untilReady(result);
    act(() => result.current.setAmount('1'));
    act(() => result.current.setAmount('10'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS - 50);
    });
    expect(quoteCalls()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    await flush();
    expect(result.current.quote).not.toBeNull();
    expect(quoteCalls()).toBe(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('inputMint')).toBe(STONK);
    expect(url.searchParams.get('outputMint')).toBe(KNOTS);
    expect(url.searchParams.get('amount')).toBe('10000000000');
    expect(url.searchParams.get('slippageBps')).toBe('100');
    expect(result.current.quote).toMatchObject({ amountIn: 1, route: 'Raydium CP' });
    expect(result.current.quoteError).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_REFRESH_MS);
    });
    expect(quoteCalls()).toBe(2);
  });

  it('flips to sell: token in, quote out, the token balance as the max', async () => {
    const { result } = renderSwap();
    await untilReady(result);
    act(() => result.current.setSide('sell'));
    expect(result.current.inSymbol).toBe('KNOTS');
    expect(result.current.balanceIn).toBe(1_000);
    act(() => result.current.setMax());
    expect(result.current.amount).toBe('1000');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS + 10);
    });
    await flush();
    expect(result.current.quote).not.toBeNull();
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('inputMint')).toBe(KNOTS);
    expect(url.searchParams.get('amount')).toBe('1000000000');
    expect(result.current.quote!.route).toBe('Raydium CLMM');
  });

  it('shows one line when Jupiter has no route', async () => {
    routeJupiter({ quote: () => jsonResponse(read('quote-error.json'), 400) });
    const { result } = renderSwap();
    await untilReady(result);
    act(() => result.current.setAmount('0.000001'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS + 10);
    });
    await flush();
    expect(result.current.quoteError).toBe('Jupiter found no route for that amount. Try a smaller one.');
    expect(result.current.quote).toBeNull();
  });

  it('swaps: reuses a fresh quote, builds through Jupiter, the wallet signs and sends, confirms, then refetches', async () => {
    const { result } = renderSwap();
    await untilReady(result);
    act(() => result.current.setAmount('1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS + 10);
    });
    await flush();
    expect(result.current.quote).not.toBeNull();

    let outcome: Awaited<ReturnType<typeof result.current.swap>> | undefined;
    await act(async () => {
      outcome = await result.current.swap();
    });
    expect(outcome).toMatchObject({ ok: true, result: { side: 'buy', amountIn: 1, inSymbol: 'STONK', outSymbol: 'KNOTS' } });
    expect(outcome!.ok && outcome!.result.amountOut).toBeCloseTo(10.866717, 6);
    // One quote (already held), one build.
    expect(quoteCalls()).toBe(1);
    const build = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/swap'))!;
    expect(JSON.parse(String((build[1] as RequestInit).body))).toMatchObject({
      userPublicKey: TRADER,
      quoteResponse: read('quote-stonk-to-knots.json'),
    });
    // The wallet saw Jupiter's transaction as a v0 transaction and sent it itself; the confirm waits on
    // the transaction's own blockhash and the build's block height. Nothing went through our RPC's send.
    const { VersionedTransaction } = await import('@solana/web3.js');
    const sentTx = wallet.signAndSend.mock.calls[0][0] as InstanceType<typeof VersionedTransaction>;
    expect(sentTx).toBeInstanceOf(VersionedTransaction);
    expect(sentTx.message.staticAccountKeys[0].toBase58()).toBe(TRADER);
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(sendSignedSwap).not.toHaveBeenCalled();
    expect(confirmSwap).toHaveBeenCalledWith(SIG, { blockhash: sentTx.message.recentBlockhash, lastValidBlockHeight: 425209420 });
    expect(result.current.status).toMatchObject({ kind: 'confirmed', result: { signature: SIG } });
    expect(result.current.amount).toBe('');
    expect(wallet.fetchBalance).toHaveBeenCalled();
    expect(onSwapped).toHaveBeenCalledWith(expect.objectContaining({ side: 'buy' }));
  });

  it('re-quotes before building when the held quote is older than 30 s', async () => {
    const { result } = renderSwap();
    await untilReady(result);
    act(() => result.current.setAmount('1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS + 10);
    });
    await flush();
    expect(result.current.quote).not.toBeNull();
    expect(quoteCalls()).toBe(1);
    // Age the quote without letting the refresh timer fire.
    vi.setSystemTime(Date.now() + STALE_QUOTE_MS + 1_000);
    await act(async () => {
      await result.current.swap();
    });
    // The fresh quote is asked for before the build, not after.
    expect(fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname.split('/').pop())).toEqual([
      'quote',
      'quote',
      'swap',
    ]);
    expect(result.current.status.kind).toBe('confirmed');
  });

  it('falls back to sign-only and our own RPC when the wallet cannot send', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    wallet.signAndSend.mockRejectedValueOnce(new Error('Failed to send transaction'));
    const { result } = renderSwap();
    await untilReady(result);
    act(() => result.current.setAmount('1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS + 10);
    });
    await flush();
    let outcome: Awaited<ReturnType<typeof result.current.swap>> | undefined;
    await act(async () => {
      outcome = await result.current.swap();
    });
    expect(outcome).toMatchObject({ ok: true, result: { signature: expect.stringMatching(/^SIG2/) } });
    const signedTx = wallet.sign.mock.calls[0][0];
    expect(signedTx).toBe(wallet.signAndSend.mock.calls[0][0]);
    expect(sendSignedSwap).toHaveBeenCalledWith(signedTx);
    expect(confirmSwap).toHaveBeenCalledWith(expect.stringMatching(/^SIG2/), expect.objectContaining({ lastValidBlockHeight: 425209420 }));
  });

  it('stops with one line when the wallet rejects, and nothing is sent or signed again', async () => {
    wallet.signAndSend.mockRejectedValueOnce({ code: 4001, message: 'User rejected the request.' });
    const { result } = renderSwap();
    await untilReady(result);
    act(() => result.current.setAmount('1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS + 10);
    });
    await flush();
    expect(result.current.quote).not.toBeNull();
    let outcome: Awaited<ReturnType<typeof result.current.swap>> | undefined;
    await act(async () => {
      outcome = await result.current.swap();
    });
    expect(outcome).toEqual({ ok: false, error: { kind: 'rejected', message: 'You rejected the transaction in your wallet.' } });
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(sendSignedSwap).not.toHaveBeenCalled();
    expect(confirmSwap).not.toHaveBeenCalled();
    expect(result.current.status).toMatchObject({ kind: 'error', error: { kind: 'rejected' } });
    expect(onSwapped).not.toHaveBeenCalled();
  });

  it('refuses more than the wallet holds before asking Jupiter to build', async () => {
    const { result } = renderSwap();
    await untilReady(result);
    act(() => result.current.setAmount('300'));
    expect(result.current.insufficient).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS + 10);
    });
    let outcome: Awaited<ReturnType<typeof result.current.swap>> | undefined;
    await act(async () => {
      outcome = await result.current.swap();
    });
    expect(outcome).toEqual({ ok: false, error: { kind: 'insufficient', message: 'You hold 250 STONK.' } });
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/swap'))).toBe(false);
    expect(wallet.sign).not.toHaveBeenCalled();
  });

  it("reads Jupiter's own simulation verdict as the wallet's shortfall, before the wallet is opened", async () => {
    routeJupiter({ swap: () => jsonResponse(read('swap.json')) });
    const { result } = renderSwap();
    await untilReady(result);
    act(() => result.current.setAmount('1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS + 10);
    });
    await flush();
    expect(result.current.quote).not.toBeNull();
    let outcome: Awaited<ReturnType<typeof result.current.swap>> | undefined;
    await act(async () => {
      outcome = await result.current.swap();
    });
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'insufficient' } });
    expect(wallet.sign).not.toHaveBeenCalled();
  });

  it('is off without a wallet, on the wrong cluster, and without SOL for the fees', async () => {
    wallet.connected = false;
    wallet.publicKey = null;
    const off = renderSwap();
    await flush();
    expect(off.result.current.blocked).toBe('Connect a wallet to swap.');
    expect(off.result.current.balanceIn).toBe(0);
    off.unmount();

    wallet.connected = true;
    wallet.publicKey = TRADER;
    wallet.network = 'solana:devnet';
    const wrong = renderSwap();
    await flush();
    expect(wrong.result.current.blocked).toBe('Your wallet is on devnet; this site trades on mainnet. Switch networks in the wallet.');
    wrong.unmount();

    wallet.network = 'solana:mainnet';
    wallet.balance = 0;
    const broke = renderSwap();
    await flush();
    expect(broke.result.current.blocked).toBe('This wallet needs a little SOL for network fees (about 0.003 SOL).');
    act(() => broke.result.current.setAmount('1'));
    let outcome: Awaited<ReturnType<typeof broke.result.current.swap>> | undefined;
    await act(async () => {
      outcome = await broke.result.current.swap();
    });
    expect(outcome).toMatchObject({ ok: false, error: { message: expect.stringContaining('needs a little SOL') } });
  });
});
