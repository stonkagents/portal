/**
 * Buying and selling the Network token through Jupiter's Swap API, in the app.
 *
 * Buy is quote -> token, sell is token -> quote. Amounts are typed in whole
 * units and turned into raw units with each mint's own decimals (read off the
 * chain, cached). Quotes are re-asked 400 ms after the last keystroke and
 * every 15 s while the panel is open; a quote older than 30 s is refreshed
 * before the swap is built. `swap()` builds through Jupiter, signs in the
 * wallet, sends on our RPC and confirms, then refetches both balances.
 * Nothing here touches the daemon.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { config } from '@/config';
import { fetchJupiterQuote, fetchJupiterSwap, routeLabel, type JupiterQuote } from '@/lib/api/jupiter';
import { useHolderBalance } from '@/lib/api/hooks';
import { DEFAULT_SLIPPAGE_BPS, WRAPPED_SOL_MINT } from '@/lib/launchlab/constants';
import { normalizeCluster } from '@/lib/launchlab/launch-config';
import { useWalletService } from '@/lib/wallet';
import { classifySwapError, SwapPreflightError, type SwapError } from './errors';
import { fetchMintDecimals } from './mint-decimals';
import { submitViaWallet } from '@/lib/wallet/submit';
import { confirmSwap, decodeSwapTransaction, sendSignedSwap } from './swap-transaction';

export type SwapSide = 'buy' | 'sell';

/** A beat after the last keystroke before Jupiter is asked. */
export const QUOTE_DEBOUNCE_MS = 400;
/** How often an open panel re-asks for the same quote. */
export const QUOTE_REFRESH_MS = 15_000;
/** A quote older than this is refreshed before the swap is built. */
export const STALE_QUOTE_MS = 30_000;
/** SOL the wallet must hold before a swap is offered: the priority fee cap plus a token account's rent. */
export const FEE_RESERVE_SOL = 0.003;
/** Slippage presets for the swap panel, in basis points. */
export const SWAP_SLIPPAGE_PRESETS_BPS = [50, 100, 300] as const;

export interface SwapQuoteView {
  /** Whole units of the input asset. */
  amountIn: number;
  /** Whole units of the output asset, before slippage. */
  amountOut: number;
  /** The least the swap accepts, in whole units of the output asset. */
  minReceived: number;
  /** Output per one unit of input: "10.95 KNOTS for 1 STONK". */
  rate: number;
  /** In percent. */
  priceImpactPct: number;
  /** "Raydium CLMM", or the venues along a split route. */
  route: string;
  /** Epoch ms the quote was received. */
  quotedAt: number;
  raw: JupiterQuote;
}

export interface SwapResult {
  signature: string;
  side: SwapSide;
  amountIn: number;
  /** As quoted; the chain may land a hair more. */
  amountOut: number;
  inSymbol: string;
  outSymbol: string;
}

export type SwapStatus =
  | { kind: 'idle' }
  | { kind: 'pending'; step: 'quote' | 'build' | 'sign' | 'confirm' }
  | { kind: 'confirmed'; result: SwapResult }
  | { kind: 'error'; error: SwapError };

export type SwapOutcome = { ok: true; result: SwapResult } | { ok: false; error: SwapError };

export interface UseJupiterSwapParams {
  tokenMint: string;
  quoteMint: string;
  tokenSymbol: string;
  quoteSymbol: string;
  /** False keeps the hook quiet: no quotes, no mint reads. */
  enabled?: boolean;
  /** Called once a swap has confirmed, after the balances are refetched. */
  onSwapped?: (result: SwapResult) => void;
}

const pow10 = (n: number): number => 10 ** n;

/** Whole units to raw units, rounded to the mint, as a bigint; null for nothing usable. */
export function toRawUnits(amount: number, decimals: number): bigint | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  // Through a string so 0.1 * 10**6 does not become 100000.00000000001.
  const scaled = Math.round(Number(amount.toFixed(decimals)) * pow10(decimals));
  return scaled > 0 ? BigInt(scaled) : null;
}

/** Raw units to whole units. Precision beyond 2^53 is not needed for display. */
export function fromRawUnits(amount: bigint, decimals: number): number {
  return Number(amount) / pow10(decimals);
}

/** A Jupiter quote as the panel reads it. Pure. */
export function quoteView(quote: JupiterQuote, inDecimals: number, outDecimals: number, now: number = Date.now()): SwapQuoteView {
  const amountIn = fromRawUnits(quote.inAmount, inDecimals);
  const amountOut = fromRawUnits(quote.outAmount, outDecimals);
  return {
    amountIn,
    amountOut,
    minReceived: fromRawUnits(quote.otherAmountThreshold, outDecimals),
    rate: amountIn > 0 ? amountOut / amountIn : 0,
    priceImpactPct: quote.priceImpactPct,
    route: routeLabel(quote),
    quotedAt: now,
    raw: quote,
  };
}

function useMintDecimals(mint: string, enabled: boolean) {
  return useQuery({
    queryKey: ['jupiter', 'mint-decimals', mint],
    queryFn: () => fetchMintDecimals(mint),
    enabled,
    staleTime: Infinity,
    retry: 1,
  });
}

export function useJupiterSwap({ tokenMint, quoteMint, tokenSymbol, quoteSymbol, enabled = true, onSwapped }: UseJupiterSwapParams) {
  const wallet = useWalletService();
  const queryClient = useQueryClient();

  const [side, setSideState] = useState<SwapSide>('buy');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [quote, setQuote] = useState<SwapQuoteView | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [status, setStatus] = useState<SwapStatus>({ kind: 'idle' });
  const quoteRef = useRef<SwapQuoteView | null>(null);
  quoteRef.current = quote;

  const tokenInfo = useMintDecimals(tokenMint, enabled);
  const quoteInfo = useMintDecimals(quoteMint, enabled);
  const tokenDecimals = tokenInfo.data?.decimals ?? null;
  const quoteDecimals = quoteInfo.data?.decimals ?? null;
  const ready = tokenDecimals != null && quoteDecimals != null;
  const decimalsError = tokenInfo.error ?? quoteInfo.error;

  const owner = wallet.connected ? wallet.publicKey : null;
  const quoteIsSol = quoteMint === WRAPPED_SOL_MINT;
  const { balance: rawTokenBalance } = useHolderBalance(enabled ? tokenMint : null, owner);
  const { balance: rawQuoteBalance } = useHolderBalance(enabled && !quoteIsSol ? quoteMint : null, owner);
  const tokenBalance = tokenDecimals != null ? rawTokenBalance / pow10(tokenDecimals) : 0;
  const quoteBalance = quoteIsSol ? (wallet.balance ?? 0) : quoteDecimals != null ? rawQuoteBalance / pow10(quoteDecimals) : 0;

  const isBuy = side === 'buy';
  const inputMint = isBuy ? quoteMint : tokenMint;
  const outputMint = isBuy ? tokenMint : quoteMint;
  const inSymbol = isBuy ? quoteSymbol : tokenSymbol;
  const outSymbol = isBuy ? tokenSymbol : quoteSymbol;
  const inDecimals = isBuy ? quoteDecimals : tokenDecimals;
  const outDecimals = isBuy ? tokenDecimals : quoteDecimals;
  const balanceIn = isBuy ? quoteBalance : tokenBalance;
  const balanceOut = isBuy ? tokenBalance : quoteBalance;

  const parsed = Number.parseFloat(amount);
  const amountValid = Number.isFinite(parsed) && parsed > 0;
  const rawIn = amountValid && inDecimals != null ? toRawUnits(parsed, inDecimals) : null;
  const insufficient = wallet.connected && amountValid && parsed > balanceIn;

  // Why the swap is off, in one line; null when it is on.
  const walletCluster = normalizeCluster(wallet.network);
  const blocked: string | null = !wallet.connected
    ? 'Connect a wallet to swap.'
    : walletCluster && walletCluster !== config.cluster
      ? `Your wallet is on ${walletCluster}; this site trades on ${config.cluster}. Switch networks in the wallet.`
      : decimalsError
        ? `Could not read the mints on this network: ${decimalsError instanceof Error ? decimalsError.message : String(decimalsError)}`
        : wallet.balance != null && wallet.balance < FEE_RESERVE_SOL
          ? `This wallet needs a little SOL for network fees (about ${FEE_RESERVE_SOL} SOL).`
          : null;

  const setSide = useCallback((next: SwapSide) => {
    setSideState(next);
    setAmount('');
    setQuote(null);
    setQuoteError(null);
    setStatus({ kind: 'idle' });
  }, []);

  /** The whole balance of the input side; SOL keeps the fee reserve back. */
  const setMax = useCallback(() => {
    const max = isBuy && quoteIsSol ? Math.max(0, balanceIn - FEE_RESERVE_SOL) : balanceIn;
    setAmount(max > 0 ? String(max) : '');
  }, [isBuy, quoteIsSol, balanceIn]);

  const askQuote = useCallback(
    async (signal?: AbortSignal): Promise<SwapQuoteView> => {
      if (rawIn == null || inDecimals == null || outDecimals == null)
        throw new SwapPreflightError(`Enter a ${inSymbol} amount.`, 'unknown');
      const fresh = await fetchJupiterQuote({ inputMint, outputMint, amount: rawIn, slippageBps }, signal);
      return quoteView(fresh, inDecimals, outDecimals);
    },
    [rawIn, inDecimals, outDecimals, inSymbol, inputMint, outputMint, slippageBps],
  );

  // Re-quote a beat after the last change, then keep the quote fresh while the panel is open.
  useEffect(() => {
    if (!enabled || !ready || rawIn == null) {
      setQuote(null);
      setQuoteError(null);
      setQuoting(false);
      return;
    }
    let live = true;
    let controller: AbortController | null = null;
    const run = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setQuoting(true);
      try {
        const next = await askQuote(current.signal);
        if (!live || current.signal.aborted) return;
        setQuote(next);
        setQuoteError(null);
      } catch (err) {
        if (!live || current.signal.aborted) return;
        setQuote(null);
        setQuoteError(classifySwapError(err, inSymbol).message);
      } finally {
        if (live && !current.signal.aborted) setQuoting(false);
      }
    };
    const debounce = setTimeout(() => void run(), QUOTE_DEBOUNCE_MS);
    const refresh = setInterval(() => void run(), QUOTE_REFRESH_MS);
    return () => {
      live = false;
      controller?.abort();
      clearTimeout(debounce);
      clearInterval(refresh);
    };
  }, [enabled, ready, rawIn, askQuote, inSymbol]);

  const refetchBalances = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['holder-balance', tokenMint] });
    if (!quoteIsSol) void queryClient.invalidateQueries({ queryKey: ['holder-balance', quoteMint] });
    void wallet.fetchBalance();
  }, [queryClient, tokenMint, quoteMint, quoteIsSol, wallet]);

  const swap = useCallback(async (): Promise<SwapOutcome> => {
    const fail = (error: SwapError): SwapOutcome => {
      setStatus({ kind: 'error', error });
      return { ok: false, error };
    };
    if (!wallet.connected || !wallet.publicKey) return fail({ kind: 'unknown', message: 'Connect a wallet to swap.' });
    if (blocked) return fail({ kind: 'unknown', message: blocked });
    if (!amountValid || rawIn == null) return fail({ kind: 'unknown', message: `Enter a ${inSymbol} amount.` });
    if (insufficient)
      return fail({
        kind: 'insufficient',
        message: `You hold ${balanceIn.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${inSymbol}.`,
      });

    try {
      setStatus({ kind: 'pending', step: 'quote' });
      const held = quoteRef.current;
      const usable =
        held != null &&
        held.raw.inAmount === rawIn &&
        held.raw.inputMint === inputMint &&
        held.raw.slippageBps === slippageBps &&
        Date.now() - held.quotedAt <= STALE_QUOTE_MS;
      const current = usable ? held : await askQuote();
      if (!usable) setQuote(current);

      setStatus({ kind: 'pending', step: 'build' });
      const built = await fetchJupiterSwap({ quote: current.raw, userPublicKey: wallet.publicKey });
      if (built.simulationError) throw new Error(`Simulation failed: ${built.simulationError.message}`);
      const tx = await decodeSwapTransaction(built.swapTransaction);

      setStatus({ kind: 'pending', step: 'sign' });
      // The wallet signs and sends; if its send fails it signs only and our RPC sends.
      const signature = await submitViaWallet(wallet, tx, signed => sendSignedSwap(signed));

      setStatus({ kind: 'pending', step: 'confirm' });
      await confirmSwap(signature, { blockhash: tx.message.recentBlockhash, lastValidBlockHeight: built.lastValidBlockHeight });

      const result: SwapResult = { signature, side, amountIn: current.amountIn, amountOut: current.amountOut, inSymbol, outSymbol };
      setAmount('');
      setQuote(null);
      setStatus({ kind: 'confirmed', result });
      refetchBalances();
      onSwapped?.(result);
      return { ok: true, result };
    } catch (err) {
      return fail(classifySwapError(err, inSymbol));
    }
  }, [
    wallet,
    blocked,
    amountValid,
    rawIn,
    inSymbol,
    insufficient,
    balanceIn,
    inputMint,
    slippageBps,
    askQuote,
    side,
    outSymbol,
    refetchBalances,
    onSwapped,
  ]);

  const reset = useCallback(() => setStatus({ kind: 'idle' }), []);

  return useMemo(
    () => ({
      side,
      setSide,
      amount,
      setAmount,
      setMax,
      slippageBps,
      setSlippageBps,
      inSymbol,
      outSymbol,
      inDecimals,
      outDecimals,
      balanceIn,
      balanceOut,
      /** Both mints read; amounts can be converted. */
      ready,
      amountValid,
      insufficient,
      blocked,
      quote,
      quoting,
      quoteError,
      status,
      swap,
      reset,
      refetchBalances,
    }),
    [
      side,
      setSide,
      amount,
      setMax,
      slippageBps,
      inSymbol,
      outSymbol,
      inDecimals,
      outDecimals,
      balanceIn,
      balanceOut,
      ready,
      amountValid,
      insufficient,
      blocked,
      quote,
      quoting,
      quoteError,
      status,
      swap,
      reset,
      refetchBalances,
    ],
  );
}

export type JupiterSwapController = ReturnType<typeof useJupiterSwap>;
