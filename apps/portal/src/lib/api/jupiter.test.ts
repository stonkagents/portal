/**
 * Jupiter's Swap API client against what the API sent on 2026-09-15 for
 * $STONK <-> $KNOTS (fixtures under `__fixtures__/jupiter/`, taken with curl):
 * the parsers read those shapes, tolerate a missing field, and the fetchers
 * send what the API wants and turn a refusal into a `JupiterApiError`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_PRIORITY_FEE_LAMPORTS,
  fetchJupiterQuote,
  fetchJupiterSwap,
  JupiterApiError,
  parseJupiterQuote,
  parseJupiterSwap,
  routeLabel,
} from './jupiter';

const STONK = '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';
const KNOTS = '8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS';
const read = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'jupiter', name), 'utf8'));

const jsonResponse = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('parseJupiterQuote', () => {
  it('reads a STONK -> KNOTS quote: raw amounts as bigint, impact as a number, the route labels', () => {
    const quote = parseJupiterQuote(read('quote-stonk-to-knots.json'));
    expect(quote).not.toBeNull();
    expect(quote!.inputMint).toBe(STONK);
    expect(quote!.outputMint).toBe(KNOTS);
    expect(quote!.inAmount).toBe(BigInt(1_000_000_000));
    expect(quote!.outAmount).toBe(BigInt(10_866_717));
    expect(quote!.otherAmountThreshold).toBe(BigInt(10_758_050));
    expect(quote!.swapMode).toBe('ExactIn');
    expect(quote!.slippageBps).toBe(100);
    expect(quote!.priceImpactPct).toBeCloseTo(0.0277, 4);
    expect(quote!.contextSlot).toBe(447167281);
    expect(quote!.route).toEqual([
      {
        label: 'Raydium CP',
        ammKey: 'BUVzsLLLG7GWoyJVoU31pXiBveazA6GXTavZ9VD3CwS9',
        inputMint: STONK,
        outputMint: KNOTS,
        percent: 100,
      },
    ]);
    expect(routeLabel(quote!)).toBe('Raydium CP');
    // The verbatim object goes back to the swap build.
    expect(quote!.raw).toEqual(read('quote-stonk-to-knots.json'));
  });

  it('reads the reverse direction too', () => {
    const quote = parseJupiterQuote(read('quote-knots-to-stonk.json'));
    expect(quote!.inputMint).toBe(KNOTS);
    expect(quote!.outputMint).toBe(STONK);
    expect(quote!.inAmount).toBe(BigInt(1_000_000_000));
    expect(quote!.outAmount).toBe(BigInt(85_165_972_080));
    expect(routeLabel(quote!)).toBe('Raydium CLMM');
  });

  it('tolerates a thin answer and refuses one without amounts', () => {
    const thin = parseJupiterQuote({ inputMint: 'a', outputMint: 'b', inAmount: 10, outAmount: '20' });
    expect(thin).toMatchObject({
      inAmount: BigInt(10),
      outAmount: BigInt(20),
      otherAmountThreshold: BigInt(20),
      slippageBps: 0,
      priceImpactPct: 0,
      route: [],
    });
    expect(routeLabel(thin!)).toBe('unknown route');
    expect(parseJupiterQuote({ inputMint: 'a', outputMint: 'b', inAmount: '1.5', outAmount: '2' })).toBeNull();
    expect(parseJupiterQuote({ error: 'No routes found', errorCode: 'NO_ROUTES_FOUND' })).toBeNull();
    expect(parseJupiterQuote(null)).toBeNull();
    expect(parseJupiterQuote('nope')).toBeNull();
  });

  it('joins the venues of a split route once each, in order', () => {
    const quote = parseJupiterQuote({
      inputMint: 'a',
      outputMint: 'b',
      inAmount: '1',
      outAmount: '1',
      routePlan: [
        { swapInfo: { label: 'Raydium CLMM' }, percent: 60 },
        { swapInfo: { label: 'Meteora DLMM' }, percent: 40 },
        { swapInfo: { label: 'Raydium CLMM' }, percent: 100 },
      ],
    });
    expect(routeLabel(quote!)).toBe('Raydium CLMM, Meteora DLMM');
    expect(quote!.route.map(s => s.percent)).toEqual([60, 40, 100]);
  });
});

describe('parseJupiterSwap', () => {
  it('reads the built transaction, the block height it is valid to, the fee and the simulation verdict', () => {
    const swap = parseJupiterSwap(read('swap.json'));
    expect(swap).not.toBeNull();
    expect(swap!.swapTransaction.startsWith('AQAAAAAAAAAA')).toBe(true);
    expect(swap!.lastValidBlockHeight).toBe(425209420);
    expect(swap!.prioritizationFeeLamports).toBe(101871);
    expect(swap!.dynamicSlippageBps).toBe(80);
    // The fixture was built for a wallet with nothing in it, so Jupiter's simulation said so.
    expect(swap!.simulationError).toEqual({
      code: 'TRANSACTION_ERROR',
      message: 'Attempt to debit an account but found no record of a prior credit.',
    });
  });

  it('reads a clean simulation as null and refuses an answer without a transaction', () => {
    const clean = parseJupiterSwap({ ...(read('swap.json') as object), simulationError: null });
    expect(clean!.simulationError).toBeNull();
    expect(parseJupiterSwap({ lastValidBlockHeight: 1 })).toBeNull();
    expect(parseJupiterSwap({ swapTransaction: 'AQ==' })).toBeNull();
    expect(parseJupiterSwap(undefined)).toBeNull();
  });
});

describe('fetchJupiterQuote / fetchJupiterSwap', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for an exact-in quote with raw units and returns it parsed', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(read('quote-stonk-to-knots.json')));
    const quote = await fetchJupiterQuote({ inputMint: STONK, outputMint: KNOTS, amount: BigInt(1_000_000_000), slippageBps: 100 });
    expect(quote.outAmount).toBe(BigInt(10_866_717));
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe('https://lite-api.jup.ag/swap/v1/quote');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      inputMint: STONK,
      outputMint: KNOTS,
      amount: '1000000000',
      slippageBps: '100',
      swapMode: 'ExactIn',
    });
    expect((init as RequestInit).headers).toEqual({ Accept: 'application/json' });
  });

  it('asks for an exact-out quote when told to, and reads the input cap', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(read('quote-sol-to-stonk-exact-out.json')));
    const quote = await fetchJupiterQuote({
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: STONK,
      amount: BigInt(1_275_000_000_000),
      slippageBps: 100,
      swapMode: 'ExactOut',
    });
    const parsed = new URL(String(fetchMock.mock.calls[0][0]));
    expect(parsed.searchParams.get('swapMode')).toBe('ExactOut');
    expect(parsed.searchParams.get('amount')).toBe('1275000000000');
    expect(quote.swapMode).toBe('ExactOut');
    expect(quote.inAmount).toBe(BigInt(420_000_000));
    expect(quote.outAmount).toBe(BigInt(1_275_000_000_000));
    expect(quote.otherAmountThreshold).toBe(BigInt(424_200_000));
  });

  it('turns "No routes found" into a JupiterApiError carrying the code', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(read('quote-error.json'), 400));
    await expect(
      fetchJupiterQuote({ inputMint: STONK, outputMint: KNOTS, amount: BigInt(0), slippageBps: 100 }),
    ).rejects.toMatchObject({
      name: 'JupiterApiError',
      status: 400,
      code: 'NO_ROUTES_FOUND',
      message: 'No routes found',
    });
  });

  it('reports an outage, a non-JSON body and a dead network as JupiterApiError', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('html');
      },
    } as unknown as Response);
    await expect(
      fetchJupiterQuote({ inputMint: STONK, outputMint: KNOTS, amount: BigInt(1), slippageBps: 100 }),
    ).rejects.toMatchObject({
      status: 503,
      code: null,
      message: 'Jupiter could not quote (503)',
    });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await fetchJupiterQuote({ inputMint: STONK, outputMint: KNOTS, amount: BigInt(1), slippageBps: 100 }).catch(e => e);
    expect(err).toBeInstanceOf(JupiterApiError);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK' });
  });

  it('refuses a quote it cannot read', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ hello: 'world' }));
    await expect(
      fetchJupiterQuote({ inputMint: STONK, outputMint: KNOTS, amount: BigInt(1), slippageBps: 100 }),
    ).rejects.toMatchObject({ code: 'BAD_QUOTE' });
  });

  it('posts the quote back verbatim with the trader and the fee cap, and returns the build', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(read('quote-stonk-to-knots.json')));
    const quote = await fetchJupiterQuote({ inputMint: STONK, outputMint: KNOTS, amount: BigInt(1_000_000_000), slippageBps: 100 });
    fetchMock.mockResolvedValueOnce(jsonResponse(read('swap.json')));
    const built = await fetchJupiterSwap({ quote, userPublicKey: 'Trader111' });
    expect(built.lastValidBlockHeight).toBe(425209420);
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toBe('https://lite-api.jup.ag/swap/v1/swap');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      quoteResponse: read('quote-stonk-to-knots.json'),
      userPublicKey: 'Trader111',
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: { maxLamports: DEFAULT_MAX_PRIORITY_FEE_LAMPORTS, priorityLevel: 'high' },
      },
    });
  });

  it('surfaces a refused build', async () => {
    const quote = parseJupiterQuote(read('quote-stonk-to-knots.json'))!;
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Invalid user public key', errorCode: 'INVALID_USER' }, 422));
    await expect(fetchJupiterSwap({ quote, userPublicKey: 'nope' })).rejects.toMatchObject({ status: 422, code: 'INVALID_USER' });
    fetchMock.mockResolvedValueOnce(jsonResponse({ nothing: true }));
    await expect(fetchJupiterSwap({ quote, userPublicKey: 'nope' })).rejects.toMatchObject({ code: 'BAD_SWAP' });
  });
});
