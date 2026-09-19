/**
 * The top-up hook against a fake wallet, a fake RPC and a recorded ExactOut
 * quote: it measures the shortfall, asks Jupiter for the shortfall plus the
 * buffer, stays off on devnet and without SOL, and walks a top-up from the
 * held quote through the wallet to a balance read that finally covers the
 * need (or gives up, or steps aside when the wallet says no). The wallet sends
 * the swap itself; when it cannot, the hook signs only and sends on our RPC.
 * No transaction is ever sent anywhere real.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STONK = '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';
const SOL = 'So11111111111111111111111111111111111111112';
const TRADER = 'FWxdnjw6oYjRWHxBrmQ9eAQoWmn1z1fYNxU7mNjRZtho';
const fixtures = join(__dirname, '..', 'api', '__fixtures__', 'jupiter');
const read = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(fixtures, name), 'utf8'));
const SIG = 'SIG1111111111111111111111111111111111111111111111111111111111111111111111111111111111111';

const wallet = {
  installed: true,
  connected: true,
  publicKey: TRADER as string | null,
  shortAddress: 'FWxd...Ztho',
  balance: 1.5 as number | null,
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

const cluster = vi.hoisted(() => ({ current: 'mainnet' }));
vi.mock('@/config', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/config');
  return {
    ...actual,
    config: {
      ...(actual.config as Record<string, unknown>),
      get cluster() {
        return cluster.current;
      },
    },
  };
});

import { holderBalanceQueryKey } from '@/lib/api/hooks/use-holder-balance';
import { parseJupiterQuote } from '@/lib/api/jupiter';
import { QUOTE_DEBOUNCE_MS, QUOTE_REFRESH_MS } from './use-jupiter-swap';
import {
  BALANCE_POLL_MS,
  BALANCE_WAIT_MS,
  TOPUP_BUFFER_BPS,
  shortfallOf,
  topupQuoteView,
  topupTarget,
  useStonkTopup,
  type UseStonkTopupParams,
} from './use-stonk-topup';

const fetchMock = vi.fn<typeof fetch>();
const jsonResponse = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

function routeJupiter(overrides: { quote?: () => Response; swap?: () => Response } = {}) {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/quote')) return overrides.quote ? overrides.quote() : jsonResponse(read('quote-sol-to-stonk-exact-out.json'));
    if (url.endsWith('/swap')) return overrides.swap ? overrides.swap() : jsonResponse({ ...read('swap.json'), simulationError: null });
    throw new Error(`unexpected fetch ${url}`);
  });
}
const paths = () => fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname.split('/').pop());

/** What the chain says the wallet holds, in raw units, per read. */
const chainBalance = { reads: 0, raw: 10 * 1e9, after: null as null | { reads: number; raw: number } };
const readChainBalance = async () => {
  chainBalance.reads += 1;
  return chainBalance.after && chainBalance.reads >= chainBalance.after.reads ? chainBalance.after.raw : chainBalance.raw;
};

const client = { current: new QueryClient() };
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client.current}>{children}</QueryClientProvider>;
}

const onSwapped = vi.fn();
const defaults: UseStonkTopupParams = {
  quoteMint: STONK,
  quoteSymbol: 'STONK',
  quoteDecimals: 9,
  needed: 1_260,
  balance: 10,
  reserve: { sol: 0.02, label: 'the launch' },
  onSwapped,
};
/** The hook beside the host's own balance read, the way LaunchForm and TokenTrading mount it. */
const renderTopup = (params: Partial<UseStonkTopupParams> = {}) =>
  renderHook(
    (props: Partial<UseStonkTopupParams>) => {
      const balance = useQuery({ queryKey: holderBalanceQueryKey(STONK, TRADER), queryFn: readChainBalance, staleTime: 60_000 });
      const raw = balance.data ?? 10 * 1e9;
      return useStonkTopup({ ...defaults, balance: raw / 1e9, ...props });
    },
    { wrapper, initialProps: params },
  );

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
const untilQuoted = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(QUOTE_DEBOUNCE_MS + 10);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-09-15T05:00:00Z'));
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  routeJupiter();
  cluster.current = 'mainnet';
  wallet.connected = true;
  wallet.publicKey = TRADER;
  wallet.balance = 1.5;
  wallet.network = 'solana:mainnet';
  wallet.sign.mockReset().mockImplementation(async (tx: unknown) => tx);
  wallet.signAndSend.mockReset().mockImplementation(async (_tx: unknown) => ({ signature: SIG }));
  wallet.fetchBalance.mockClear();
  sendSignedSwap.mockClear();
  confirmSwap.mockClear();
  onSwapped.mockClear();
  chainBalance.reads = 0;
  chainBalance.raw = 10 * 1e9;
  chainBalance.after = null;
  client.current = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('shortfall maths', () => {
  it('measures the shortfall in whole units, rounded to the mint, and none when covered', () => {
    expect(shortfallOf(1_260, 10, 9)).toBe(1_250);
    expect(shortfallOf(100, 100, 9)).toBe(0);
    expect(shortfallOf(100, 250, 9)).toBe(0);
    expect(shortfallOf(0, 0, 9)).toBe(0);
    expect(shortfallOf(NaN, 0, 9)).toBe(0);
    expect(shortfallOf(1, -5, 9)).toBe(1);
    expect(shortfallOf(0.3, 0.1, 6)).toBe(0.2);
  });

  it('asks for the shortfall plus the buffer', () => {
    expect(TOPUP_BUFFER_BPS).toBe(200);
    expect(topupTarget(1_250)).toBeCloseTo(1_275, 9);
  });

  it('reads an ExactOut quote as SOL in, the SOL cap, $STONK out and the rate', () => {
    const view = topupQuoteView(parseJupiterQuote(read('quote-sol-to-stonk-exact-out.json'))!, 9, 42);
    expect(view.solIn).toBe(0.42);
    expect(view.maxSolIn).toBe(0.4242);
    expect(view.stonkOut).toBe(1_275);
    expect(view.rate).toBeCloseTo(3_035.71, 2);
    expect(view.route).toBe('Raydium CLMM');
    expect(view.quotedAt).toBe(42);
  });
});

describe('useStonkTopup', () => {
  it('quotes SOL for the shortfall plus the buffer as an ExactOut swap, a beat after it settles, and keeps it fresh', async () => {
    const { result } = renderTopup();
    await flush();
    expect(result.current.shortfall).toBe(1_250);
    expect(result.current.canTopUp).toBe(true);
    expect(result.current.quote).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    await untilQuoted();
    expect(paths()).toEqual(['quote']);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      inputMint: SOL,
      outputMint: STONK,
      amount: '1275000000000',
      slippageBps: '100',
      swapMode: 'ExactOut',
    });
    expect(result.current.quote).toMatchObject({ solIn: 0.42, maxSolIn: 0.4242, stonkOut: 1_275 });
    expect(result.current.quoteError).toBeNull();
    expect(result.current.solInsufficient).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUOTE_REFRESH_MS);
    });
    expect(paths()).toEqual(['quote', 'quote']);
  });

  it('is off when nothing is short, and run() has nothing to do', async () => {
    const { result } = renderTopup({ needed: 5 });
    await untilQuoted();
    expect(result.current.shortfall).toBe(0);
    expect(result.current.canTopUp).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.run();
    });
    expect(outcome).toBe('done');
    expect(wallet.sign).not.toHaveBeenCalled();
  });

  it('is off on devnet, when the wallet sits on another cluster, when it is not connected, and when told to be', async () => {
    cluster.current = 'devnet';
    const devnet = renderTopup();
    await untilQuoted();
    expect(devnet.result.current.shortfall).toBe(1_250);
    expect(devnet.result.current.canTopUp).toBe(false);
    devnet.unmount();

    cluster.current = 'mainnet';
    wallet.network = 'solana:devnet';
    const wrongWallet = renderTopup();
    await untilQuoted();
    expect(wrongWallet.result.current.canTopUp).toBe(false);
    wrongWallet.unmount();

    wallet.network = 'solana:mainnet';
    wallet.connected = false;
    wallet.publicKey = null;
    const offline = renderTopup();
    await untilQuoted();
    expect(offline.result.current.canTopUp).toBe(false);
    offline.unmount();

    wallet.connected = true;
    wallet.publicKey = TRADER;
    const disabled = renderTopup({ enabled: false });
    await untilQuoted();
    expect(disabled.result.current.canTopUp).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when the SOL does not stretch to the swap, the fees and what the host still needs', async () => {
    wallet.balance = 0.3;
    const { result } = renderTopup();
    await untilQuoted();
    expect(result.current.quote).not.toBeNull();
    expect(result.current.solInsufficient).toBe(
      'This wallet holds 0.3 SOL; the swap needs about 0.424 SOL, plus about 0.023 SOL for the launch.',
    );
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.run();
    });
    expect(outcome).toBe('failed');
    expect(result.current.status).toMatchObject({ kind: 'error', error: { kind: 'insufficient' } });
    expect(paths()).toEqual(['quote']);
    expect(wallet.sign).not.toHaveBeenCalled();
  });

  it('shows one line when Jupiter has no route', async () => {
    routeJupiter({ quote: () => jsonResponse(read('quote-error.json'), 400) });
    const { result } = renderTopup();
    await untilQuoted();
    expect(result.current.quote).toBeNull();
    expect(result.current.quoteError).toBe('Jupiter found no route for that amount. Try a smaller one.');
  });

  it('runs: builds from the held quote, signs, sends, then waits for the balance to cover the need before it is done', async () => {
    // The chain reports the old balance twice after the swap lands, then the new one.
    chainBalance.after = { reads: 4, raw: 1_284 * 1e9 };
    const { result } = renderTopup();
    await untilQuoted();
    expect(result.current.quote).not.toBeNull();
    const readsBefore = chainBalance.reads;

    let running: Promise<string> | undefined;
    await act(async () => {
      running = result.current.run();
      await vi.advanceTimersByTimeAsync(1);
    });
    // The swap has landed; the hook is now on the balance.
    expect(result.current.status).toEqual({ kind: 'pending', step: 'balance' });
    let outcome: string | undefined;
    await act(async () => {
      for (let i = 0; i < 6; i += 1) await vi.advanceTimersByTimeAsync(BALANCE_POLL_MS);
      outcome = await running;
    });
    expect(outcome).toBe('done');
    expect(paths()).toEqual(['quote', 'swap']);
    const build = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/swap'))!;
    expect(JSON.parse(String((build[1] as RequestInit).body))).toMatchObject({
      userPublicKey: TRADER,
      quoteResponse: read('quote-sol-to-stonk-exact-out.json'),
    });
    const { VersionedTransaction } = await import('@solana/web3.js');
    const sentTx = wallet.signAndSend.mock.calls[0][0] as InstanceType<typeof VersionedTransaction>;
    expect(sentTx).toBeInstanceOf(VersionedTransaction);
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(sendSignedSwap).not.toHaveBeenCalled();
    expect(confirmSwap).toHaveBeenCalledWith(SIG, { blockhash: sentTx.message.recentBlockhash, lastValidBlockHeight: 425209420 });
    // Three reads after the swap: two stale, one that covers 1,260.
    expect(chainBalance.reads - readsBefore).toBe(3);
    expect(result.current.status).toEqual({ kind: 'idle' });
    expect(result.current.shortfall).toBe(0);
    expect(result.current.canTopUp).toBe(false);
    expect(wallet.fetchBalance).toHaveBeenCalled();
    expect(onSwapped).toHaveBeenCalledWith(expect.stringMatching(/^SIG/));
  });

  it('gives up after the wait when the balance never catches up, naming the swap that landed', async () => {
    const { result } = renderTopup();
    await untilQuoted();
    let outcome: string | undefined;
    await act(async () => {
      const running = result.current.run();
      await vi.advanceTimersByTimeAsync(BALANCE_WAIT_MS + BALANCE_POLL_MS * 2);
      outcome = await running;
    });
    expect(outcome).toBe('failed');
    expect(wallet.signAndSend).toHaveBeenCalledTimes(1);
    expect(confirmSwap).toHaveBeenCalledTimes(1);
    expect(result.current.status).toMatchObject({
      kind: 'error',
      error: { message: expect.stringMatching(/^The swap landed \(SIG11111\.\.\.\) but the \$STONK balance has not caught up yet/) },
    });
    expect(onSwapped).not.toHaveBeenCalled();
  });

  it('falls back to sign-only and our own RPC when the wallet cannot send', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    wallet.signAndSend.mockRejectedValueOnce(new Error('Failed to send transaction'));
    const { result } = renderTopup();
    await untilQuoted();
    await act(async () => {
      const running = result.current.run();
      await vi.advanceTimersByTimeAsync(BALANCE_WAIT_MS + BALANCE_POLL_MS * 2);
      await running;
    });
    const signedTx = wallet.sign.mock.calls[0][0];
    expect(signedTx).toBe(wallet.signAndSend.mock.calls[0][0]);
    expect(sendSignedSwap).toHaveBeenCalledWith(signedTx);
    expect(confirmSwap).toHaveBeenCalledWith(expect.stringMatching(/^SIG2/), expect.objectContaining({ lastValidBlockHeight: 425209420 }));
  });

  it('steps aside when the wallet says no: cancelled, idle, nothing sent or signed again', async () => {
    wallet.signAndSend.mockRejectedValueOnce({ code: 4001, message: 'User rejected the request.' });
    const { result } = renderTopup();
    await untilQuoted();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.run();
    });
    expect(outcome).toBe('cancelled');
    expect(result.current.status).toEqual({ kind: 'idle' });
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(sendSignedSwap).not.toHaveBeenCalled();
    expect(confirmSwap).not.toHaveBeenCalled();
    expect(onSwapped).not.toHaveBeenCalled();
  });

  it("reads Jupiter's own simulation verdict before the wallet is opened", async () => {
    routeJupiter({ swap: () => jsonResponse(read('swap.json')) });
    const { result } = renderTopup();
    await untilQuoted();
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.run();
    });
    expect(outcome).toBe('failed');
    expect(result.current.status).toMatchObject({ kind: 'error', error: { kind: 'insufficient' } });
    expect(wallet.sign).not.toHaveBeenCalled();
  });
});
