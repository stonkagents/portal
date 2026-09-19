/**
 * Top up $STONK from SOL on the fly.
 *
 * Every launch and every curve buy is paid in $STONK. A wallet that holds SOL
 * but not enough $STONK is not a dead end: the host says how much it needs
 * and how much the wallet holds, and this hook quotes a Jupiter swap
 * SOL -> $STONK for the shortfall (plus a small buffer), runs it when asked,
 * waits for the refreshed balance to cover the need, and reports whether the
 * host may carry on with its own transaction.
 *
 * The quote is ExactOut: the $STONK out is fixed and Jupiter says the SOL in.
 * It is re-asked as the shortfall moves and kept fresh while it is shown, like
 * the swap panel's. Devnet has no $STONK on Jupiter, so the hook is off there
 * and the host keeps its plain shortfall message. Nothing here touches the
 * daemon.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { config } from '@/config';
import { fetchJupiterQuote, fetchJupiterSwap, routeLabel, type JupiterQuote } from '@/lib/api/jupiter';
import { holderBalanceQueryKey } from '@/lib/api/hooks/use-holder-balance';
import { DEFAULT_SLIPPAGE_BPS, WRAPPED_SOL_MINT } from '@/lib/launchlab/constants';
import { normalizeCluster } from '@/lib/launchlab/launch-config';
import { useWalletService } from '@/lib/wallet';
import { classifySwapError, type SwapError } from './errors';
import { submitViaWallet } from '@/lib/wallet/submit';
import { confirmSwap, decodeSwapTransaction, sendSignedSwap } from './swap-transaction';
import { FEE_RESERVE_SOL, QUOTE_DEBOUNCE_MS, QUOTE_REFRESH_MS, STALE_QUOTE_MS, fromRawUnits, toRawUnits } from './use-jupiter-swap';

/** Swapped on top of the shortfall so a re-priced dev buy or a rounding step still clears. */
export const TOPUP_BUFFER_BPS = 200;
/** Decimals of SOL, the input side of every top-up. */
const SOL_DECIMALS = 9;
/** How long a landed swap is given to show in the balance read, and how often it is re-read. */
export const BALANCE_WAIT_MS = 20_000;
export const BALANCE_POLL_MS = 1_500;

export interface TopupQuote {
  /** SOL Jupiter expects to spend. */
  solIn: number;
  /** The most SOL the swap may spend, after slippage. */
  maxSolIn: number;
  /** $STONK out, the shortfall plus the buffer. */
  stonkOut: number;
  /** $STONK per SOL at this quote. */
  rate: number;
  /** In percent. */
  priceImpactPct: number;
  route: string;
  quotedAt: number;
  raw: JupiterQuote;
}

export type TopupStep = 'quote' | 'build' | 'sign' | 'confirm' | 'balance';

export type TopupStatus = { kind: 'idle' } | { kind: 'pending'; step: TopupStep } | { kind: 'error'; error: SwapError };

/** How `run()` ended: the balance covers the need, the wallet said no, or something failed (see `status`). */
export type TopupOutcome = 'done' | 'cancelled' | 'failed';

export interface UseStonkTopupParams {
  /** The $STONK mint the host pays in; null keeps the hook quiet. */
  quoteMint: string | null;
  quoteSymbol: string;
  quoteDecimals: number;
  /** What the host's action needs, in whole units. */
  needed: number;
  /** What the wallet holds, in whole units. */
  balance: number;
  /** SOL the host's own action still needs after the swap (rent, fee, gas), and what to call it. */
  reserve?: { sol: number; label: string };
  /** False keeps the hook quiet: no quotes. */
  enabled?: boolean;
  /** Called once the swap has landed and the balance covers the need. */
  onSwapped?: (signature: string) => void;
}

/** Whole units short of the need, rounded to the mint; 0 when covered. Pure. */
export function shortfallOf(needed: number, balance: number, decimals: number): number {
  if (!Number.isFinite(needed) || needed <= 0) return 0;
  const short = needed - Math.max(0, Number.isFinite(balance) ? balance : 0);
  return short > 0 ? Number(short.toFixed(decimals)) : 0;
}

/** The $STONK asked of Jupiter: the shortfall plus the buffer. Pure. */
export function topupTarget(shortfall: number): number {
  return shortfall * (1 + TOPUP_BUFFER_BPS / 10_000);
}

/** An ExactOut quote as the notice reads it. Pure. */
export function topupQuoteView(quote: JupiterQuote, quoteDecimals: number, now: number = Date.now()): TopupQuote {
  const solIn = fromRawUnits(quote.inAmount, SOL_DECIMALS);
  const stonkOut = fromRawUnits(quote.outAmount, quoteDecimals);
  return {
    solIn,
    maxSolIn: fromRawUnits(quote.otherAmountThreshold, SOL_DECIMALS),
    stonkOut,
    rate: solIn > 0 ? stonkOut / solIn : 0,
    priceImpactPct: quote.priceImpactPct,
    route: routeLabel(quote),
    quotedAt: now,
    raw: quote,
  };
}

const fmtSol = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 });

export function useStonkTopup({
  quoteMint,
  quoteSymbol,
  quoteDecimals,
  needed,
  balance,
  reserve,
  enabled = true,
  onSwapped,
}: UseStonkTopupParams) {
  const wallet = useWalletService();
  const queryClient = useQueryClient();
  const [quote, setQuote] = useState<TopupQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [status, setStatus] = useState<TopupStatus>({ kind: 'idle' });
  const quoteRef = useRef<TopupQuote | null>(null);
  quoteRef.current = quote;
  // The balance wait reads the latest need, not the one `run()` closed over.
  const neededRef = useRef(needed);
  neededRef.current = needed;

  const shortfall = shortfallOf(needed, balance, quoteDecimals);
  const rawOut = shortfall > 0 ? toRawUnits(topupTarget(shortfall), quoteDecimals) : null;

  // Off unless this build trades on mainnet and the wallet, if it says, is there too.
  const walletCluster = normalizeCluster(wallet.network);
  const onMainnet = config.cluster === 'mainnet' && (walletCluster == null || walletCluster === 'mainnet');
  const canTopUp = enabled && onMainnet && wallet.connected && Boolean(wallet.publicKey) && quoteMint != null && rawOut != null;

  const askQuote = useCallback(
    async (signal?: AbortSignal): Promise<TopupQuote> => {
      if (quoteMint == null || rawOut == null) throw new Error('Nothing to top up.');
      const fresh = await fetchJupiterQuote(
        { inputMint: WRAPPED_SOL_MINT, outputMint: quoteMint, amount: rawOut, slippageBps: DEFAULT_SLIPPAGE_BPS, swapMode: 'ExactOut' },
        signal,
      );
      return topupQuoteView(fresh, quoteDecimals);
    },
    [quoteMint, rawOut, quoteDecimals],
  );

  // Quote a beat after the shortfall settles, then keep it fresh while it is shown.
  useEffect(() => {
    if (!canTopUp) {
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
        setQuoteError(classifySwapError(err, 'SOL').message);
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
  }, [canTopUp, askQuote]);

  // The swap's SOL, the fee reserve and what the host's own action still needs, against what the wallet holds.
  const solNeeded = quote ? quote.maxSolIn + FEE_RESERVE_SOL + (reserve?.sol ?? 0) : null;
  const solInsufficient: string | null =
    canTopUp && quote && solNeeded != null && wallet.balance != null && wallet.balance < solNeeded
      ? `This wallet holds ${fmtSol(wallet.balance)} SOL; the swap needs about ${fmtSol(quote.maxSolIn)} SOL` +
        (reserve && reserve.sol > 0 ? `, plus about ${fmtSol(reserve.sol + FEE_RESERVE_SOL)} SOL for ${reserve.label}.` : ' and a little for fees.')
      : null;

  /** Re-read the $STONK balance until it covers the need, or give up after `BALANCE_WAIT_MS`. */
  const waitForBalance = useCallback(async (): Promise<boolean> => {
    const key = holderBalanceQueryKey(quoteMint, wallet.publicKey);
    const deadline = Date.now() + BALANCE_WAIT_MS;
    for (;;) {
      await queryClient.refetchQueries({ queryKey: key, exact: true });
      const raw = queryClient.getQueryData<number>(key);
      const whole = raw != null ? raw / 10 ** quoteDecimals : 0;
      if (whole >= neededRef.current) return true;
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, BALANCE_POLL_MS));
    }
  }, [queryClient, quoteMint, wallet.publicKey, quoteDecimals]);

  const run = useCallback(async (): Promise<TopupOutcome> => {
    if (shortfall <= 0) return 'done';
    const fail = (error: SwapError): TopupOutcome => {
      setStatus({ kind: 'error', error });
      return 'failed';
    };
    if (!canTopUp || !wallet.publicKey) return fail({ kind: 'unknown', message: `Cannot swap for $${quoteSymbol} here.` });
    if (solInsufficient) return fail({ kind: 'insufficient', message: solInsufficient });

    let signature: string | null = null;
    try {
      setStatus({ kind: 'pending', step: 'quote' });
      const held = quoteRef.current;
      const usable = held != null && held.raw.outAmount === rawOut && Date.now() - held.quotedAt <= STALE_QUOTE_MS;
      const current = usable ? held : await askQuote();
      if (!usable) setQuote(current);

      setStatus({ kind: 'pending', step: 'build' });
      const built = await fetchJupiterSwap({ quote: current.raw, userPublicKey: wallet.publicKey });
      if (built.simulationError) throw new Error(`Simulation failed: ${built.simulationError.message}`);
      const tx = await decodeSwapTransaction(built.swapTransaction);

      setStatus({ kind: 'pending', step: 'sign' });
      // The wallet signs and sends; if its send fails it signs only and our RPC sends.
      signature = await submitViaWallet(wallet, tx, signed => sendSignedSwap(signed));

      setStatus({ kind: 'pending', step: 'confirm' });
      await confirmSwap(signature, { blockhash: tx.message.recentBlockhash, lastValidBlockHeight: built.lastValidBlockHeight });
    } catch (err) {
      const error = classifySwapError(err, 'SOL');
      if (error.kind === 'rejected') {
        setStatus({ kind: 'idle' });
        return 'cancelled';
      }
      return fail(error);
    }

    // The swap landed; an RPC read can trail it by a few seconds.
    setStatus({ kind: 'pending', step: 'balance' });
    void wallet.fetchBalance();
    const covered = await waitForBalance();
    if (!covered) {
      return fail({
        kind: 'unknown',
        message: `The swap landed (${signature.slice(0, 8)}...) but the $${quoteSymbol} balance has not caught up yet. Try again in a moment.`,
      });
    }
    setStatus({ kind: 'idle' });
    onSwapped?.(signature);
    return 'done';
  }, [shortfall, canTopUp, wallet, quoteSymbol, solInsufficient, rawOut, askQuote, waitForBalance, onSwapped]);

  const reset = useCallback(() => setStatus({ kind: 'idle' }), []);

  return useMemo(
    () => ({ shortfall, canTopUp, quote, quoting, quoteError, solInsufficient, status, run, reset }),
    [shortfall, canTopUp, quote, quoting, quoteError, solInsufficient, status, run, reset],
  );
}

export type StonkTopupController = ReturnType<typeof useStonkTopup>;
