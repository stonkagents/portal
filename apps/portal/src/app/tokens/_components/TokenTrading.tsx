/**
 * Token detail: buy and sell on the LaunchLab curve, in the app.
 *
 * Quotes come from Raydium's own curve maths against the live pool, with the
 * fee rates the pool and its platform config carry — ours for a launch from
 * this site, stonk.fun's for $AGENT; the pool account names which. The wallet
 * signs; we send on our RPC. Nothing here touches a venue API.
 */

'use client';

import { solscanTxUrl } from '@/lib/token-launch/constants';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { explorerUrl } from '@/config';
import { Button } from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import { useWalletService } from '@/lib/wallet';
import { useHolderBalance } from '@/lib/api/hooks';
import { confirmSignature, isMockLaunch, sendSigned } from '@/lib/launchlab/build-launch';
import { submitViaWallet } from '@/lib/wallet/submit';
import { DEFAULT_SLIPPAGE_BPS, WRAPPED_SOL_MINT } from '@/lib/launchlab/constants';
import type { LaunchPoolState } from '@/lib/launchlab/pool-state';
import { bpsToPercent } from '@/lib/launchlab/pricing';
import { buildBuy, buildSell, classifyTradeError, quoteBuy, quoteSell, type TradeQuote } from '@/lib/launchlab/trading';
import { cn } from '@/lib/utils/cn';
import { formatUsd, type GalleryToken } from '../_lib/gallery-token';
import { formatTokenAmount, shortAddress } from '../_lib/detail-format';
import { feeSplit, feeSplitLine, holdersShareLine } from '../_lib/fees';
import { AGENT_MINT, AGENT_QUOTE_MINT } from '@/lib/agent-token';
import { JupiterSwapPanel } from './JupiterSwapPanel';
import { SlippageControl } from './SlippageControl';
import { Notice, VenueLinks } from './TradeNotices';
import { useScrollToHash } from './use-scroll-to-hash';

type Side = 'buy' | 'sell';

/** Quick amounts for a buy, in whole quote tokens. */
const BUY_QUICK_AMOUNTS = [10, 50, 100, 500] as const;
/** Quick amounts for a sell, as a share of the wallet's balance. */
const SELL_QUICK_PERCENTS = [25, 50, 75, 100] as const;
const QUOTE_DEBOUNCE_MS = 250;
/** Price impact colour thresholds, in percent. */
const WARN_IMPACT_PCT = 2;
const HIGH_IMPACT_PCT = 5;
/** Slippage outside this band gets a warning. */
const TIGHT_SLIPPAGE_BPS = 50;
const WIDE_SLIPPAGE_BPS = 500;

interface TokenTradingProps {
  token: GalleryToken;
  pool?: LaunchPoolState;
  poolError?: string | null;
  poolLoading?: boolean;
  quoteSymbol: string | null;
  /** USD price of one quote token; enables the USD input on a buy. */
  quoteUsd?: number | null;
  /** Called after a trade lands, so the page can re-read the pool. */
  onTraded?: () => void;
  /** Where the token trades when it has no pool on this network (e.g. the $AGENT venue). */
  externalHref?: string | null;
  /**
   * Trade through Jupiter's Swap API in the app instead of the curve: the
   * Network token via stonkfun, which has no pool this site reads. The pair is
   * `AGENT_QUOTE_MINT` -> `AGENT_MINT`; `externalHref` stays as a second door.
   */
  inAppSwap?: boolean;
}

type TradeStatus =
  | { kind: 'idle' }
  | { kind: 'pending'; step: 'sign' | 'confirm' }
  | { kind: 'confirmed'; signature: string }
  | { kind: 'error'; message: string };

const fmt = (value: number, digits = 4): string =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '-';

export function TokenTrading({
  token,
  pool,
  poolError,
  poolLoading,
  quoteSymbol,
  quoteUsd,
  onTraded,
  externalHref,
  inAppSwap = false,
}: TokenTradingProps) {
  const wallet = useWalletService();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [side, setSide] = useState<Side>('buy');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  /** Buy input in the quote asset or in USD (converted at the quote price). */
  const [inputDenom, setInputDenom] = useState<'quote' | 'usd'>('quote');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [status, setStatus] = useState<TradeStatus>({ kind: 'idle' });

  const symbol = quoteSymbol ?? 'quote';
  const quoteIsSol = pool?.quoteMint === WRAPPED_SOL_MINT;

  const { balance: rawTokenBalance } = useHolderBalance(pool?.mint ?? null, wallet.publicKey ?? null, { ataOnly: true });
  const { balance: rawQuoteBalance } = useHolderBalance(pool && !quoteIsSol ? pool.quoteMint : null, wallet.publicKey ?? null);
  const tokenBalance = pool ? rawTokenBalance / 10 ** pool.baseDecimals : 0;
  const quoteBalance = pool ? (quoteIsSol ? (wallet.balance ?? 0) : rawQuoteBalance / 10 ** pool.quoteDecimals) : 0;

  const typed = Number.parseFloat(amount);
  const usdInput = side === 'buy' && inputDenom === 'usd' && quoteUsd != null && quoteUsd > 0;
  // What the curve is quoted with: quote tokens on a buy (USD converted), base tokens on a sell.
  const parsed = usdInput ? typed / (quoteUsd as number) : typed;
  const amountValid = Number.isFinite(parsed) && parsed > 0;
  const balance = side === 'buy' ? quoteBalance : tokenBalance;
  const insufficient = wallet.connected && amountValid && parsed > balance;
  const loading = status.kind === 'pending';

  // Re-quote as the amount changes, a beat after the last keystroke.
  useEffect(() => {
    if (!pool || !amountValid) {
      setQuote(null);
      return;
    }
    let live = true;
    setQuoting(true);
    const timer = setTimeout(() => {
      const run = side === 'buy' ? quoteBuy(pool, parsed, slippageBps) : quoteSell(pool, parsed, slippageBps);
      run
        .then(result => {
          if (live) setQuote(result);
        })
        .catch(() => {
          if (live) setQuote(null);
        })
        .finally(() => {
          if (live) setQuoting(false);
        });
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [pool, side, parsed, amountValid, slippageBps]);

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['holder-balance', token.mint] });
    if (pool && !quoteIsSol) void queryClient.invalidateQueries({ queryKey: ['holder-balance', pool.quoteMint] });
    void wallet.fetchBalance();
    onTraded?.();
  }, [queryClient, token.mint, pool, quoteIsSol, wallet, onTraded]);

  const switchSide = (next: Side) => {
    setSide(next);
    setAmount('');
    setStatus({ kind: 'idle' });
  };

  const setQuoteAmount = (quoteTokens: number) =>
    setAmount(usdInput ? String(quoteTokens * (quoteUsd as number)) : String(quoteTokens));

  const trade = useCallback(async () => {
    if (!pool || !wallet.publicKey) {
      addToast({ title: 'Connect your wallet', variant: 'error', autoDismiss: true });
      return;
    }
    if (!amountValid) {
      addToast({ title: `Enter a valid ${side === 'buy' ? symbol : token.symbol} amount`, variant: 'error', autoDismiss: true });
      return;
    }
    if (side === 'sell' && parsed > tokenBalance) {
      addToast({ title: `You hold ${fmt(tokenBalance)} ${token.symbol}.`, variant: 'error', autoDismiss: true });
      return;
    }
    setStatus({ kind: 'pending', step: 'sign' });
    try {
      const params = { pool, wallet: wallet.publicKey, amount: parsed, slippageBps };
      const tx = side === 'buy' ? await buildBuy(params) : await buildSell(params);
      // The wallet signs and sends; if its send fails it signs only and our RPC sends.
      const signature = await submitViaWallet(wallet, tx, signed => sendSigned(signed));
      setStatus({ kind: 'pending', step: 'confirm' });
      await confirmSignature(signature);
      setAmount('');
      setStatus({ kind: 'confirmed', signature });
      addToast({
        title: side === 'buy' ? `Bought ${token.symbol} for ${fmt(parsed)} ${symbol}` : `Sold ${fmt(parsed)} ${token.symbol}`,
        description: `${signature.slice(0, 8)}…${signature.slice(-6)}`,
        action: { label: 'View tx ↗', href: solscanTxUrl(signature) },
        variant: 'success',
        autoDismiss: true,
      });
      refresh();
    } catch (err) {
      const message = classifyTradeError(err);
      setStatus({ kind: 'error', message });
      addToast({ title: message, variant: 'error', autoDismiss: true });
    }
  }, [pool, wallet, amountValid, side, symbol, token.symbol, parsed, tokenBalance, slippageBps, addToast, refresh]);

  const split = useMemo(() => (pool ? feeSplit(token, pool) : null), [pool, token]);
  // A pool under another platform's config (stonk.fun for $AGENT) is traded like ours — the
  // instructions name the platform the pool account does — but the fee line names that platform.
  const platformName = token.source === 'external' ? (pool?.platformName ?? 'the platform') : null;
  const holdersLine = split ? holdersShareLine(split, quoteSymbol) : null;
  // A "Buy" from another page lands on #trade; the panel renders after the pool is read, so scroll then.
  useScrollToHash('trade', Boolean(pool) && !inAppSwap);

  if (token.source === 'legacy') {
    return (
      <Notice title="Trade">
        <p className="text-sm text-text-tertiary">This token predates the launchpad. Trade it on its own venue.</p>
      </Notice>
    );
  }

  if (isMockLaunch()) {
    return (
      <Notice title="Trade">
        <p className="text-sm text-text-tertiary">Trading is off in this build. It needs a real wallet.</p>
      </Notice>
    );
  }

  // The in-app swap is only asked for on the Network token's own page, which exists once the mint is configured.
  if (inAppSwap && AGENT_MINT) {
    return (
      <JupiterSwapPanel
        token={token}
        tokenMint={AGENT_MINT}
        quoteMint={AGENT_QUOTE_MINT}
        quoteSymbol={quoteSymbol}
        externalHref={externalHref}
        onSwapped={onTraded}
      />
    );
  }

  if (poolLoading && !pool) {
    return (
      <Notice title="Trade">
        <div className="h-40 animate-pulse rounded bg-bg-tertiary" data-testid="token-trading-loading" />
      </Notice>
    );
  }

  if (!pool && externalHref) {
    return (
      <Notice title="Trade">
        <p className="mb-3 text-sm text-text-tertiary" data-testid="token-trading-external-note">
          {poolError ? `Could not read the ${token.symbol} pool here: ${poolError}` : `${token.symbol} trades off this network.`}
        </p>
        <a
          href={externalHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="token-trading-external"
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-5 text-sm font-bold uppercase tracking-wider text-black no-underline transition-shadow hover:shadow-[0_0_20px_rgba(0,255,0,0.4)]"
        >
          Buy {token.symbol} ↗
        </a>
      </Notice>
    );
  }

  if (!pool) {
    return (
      <Notice title="Trade">
        <p className="mb-3 text-sm text-text-tertiary" data-testid="token-trading-unavailable">
          {poolError ? `Could not read the pool: ${poolError}` : 'The pool is not on this network yet.'}
        </p>
        <VenueLinks token={token} />
      </Notice>
    );
  }

  if (pool.graduated) {
    return (
      <Notice title="Graduated">
        <p className="mb-3 text-sm text-text-tertiary">The curve is complete. {token.symbol} trades on its Raydium pool now.</p>
        <VenueLinks token={token} quoteMint={pool.quoteMint} />
      </Notice>
    );
  }

  const inputUnit = side === 'buy' ? symbol : token.symbol;
  const outputUnit = side === 'buy' ? token.symbol : symbol;
  const holderTaxBps = split?.holderTaxBps ?? 0;
  // The holders' share is collected by the token itself on delivery, so a buy lands less.
  const received = quote ? (side === 'buy' ? quote.amountOut * (1 - holderTaxBps / 10_000) : quote.amountOut) : null;
  const minReceived = quote ? (side === 'buy' ? quote.minAmountOut * (1 - holderTaxBps / 10_000) : quote.minAmountOut) : null;
  const highImpact = quote != null && quote.priceImpactPct >= HIGH_IMPACT_PCT;
  const warnImpact = quote != null && !highImpact && quote.priceImpactPct >= WARN_IMPACT_PCT;
  const isBuy = side === 'buy';
  const typedUnit = usdInput ? 'USD' : inputUnit;
  const receivedUsd = received != null && quoteUsd != null && quote ? (isBuy ? quote.amountIn * quoteUsd : received * quoteUsd) : null;
  const slippageNote =
    slippageBps < TIGHT_SLIPPAGE_BPS
      ? 'That tight, the swap may not clear.'
      : slippageBps > WIDE_SLIPPAGE_BPS
        ? 'That is a wide door. Bots love a wide door.'
        : null;

  const ctaLabel = !wallet.connected
    ? 'Connect wallet'
    : insufficient
      ? `Insufficient ${inputUnit}`
      : !amountValid
        ? `Enter ${typedUnit} amount`
        : isBuy
          ? `Buy ${token.symbol}`
          : `Sell ${token.symbol}`;
  const ctaDisabled = wallet.connected && (loading || !amountValid || quoting || insufficient);

  return (
    <section
      className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary"
      data-testid="token-trading"
      id="trade"
    >
      <div className="grid grid-cols-2 border-b border-border-default" role="tablist" aria-label="Trade side">
        {(['buy', 'sell'] as const).map(option => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={side === option}
            onClick={() => switchSide(option)}
            data-testid={`tab-${option}`}
            className={cn(
              'h-12 text-sm font-bold uppercase tracking-wide transition-colors',
              side === option
                ? option === 'buy'
                  ? 'border-b-2 border-accent-green bg-accent-green/10 text-accent-green'
                  : 'border-b-2 border-accent-red bg-accent-red/10 text-accent-red'
                : 'text-text-tertiary hover:text-text-primary',
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-text-tertiary">
          <span>
            {wallet.connected ? (
              <>
                Balance <span className="font-mono text-text-secondary">{formatTokenAmount(balance, 4)}</span> {inputUnit}
              </>
            ) : (
              'Wallet not connected'
            )}
          </span>
          <span className="flex items-center gap-1.5">
            {isBuy && quoteUsd != null && quoteUsd > 0 && (
              <span className="inline-flex rounded-md bg-bg-tertiary p-0.5" role="radiogroup" aria-label="Input denomination">
                {(['quote', 'usd'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={inputDenom === option}
                    onClick={() => {
                      if (option === inputDenom) return;
                      setInputDenom(option);
                      if (amountValid) setAmount(option === 'usd' ? String(parsed * quoteUsd) : String(parsed));
                    }}
                    className={cn(
                      'rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase transition-colors',
                      inputDenom === option ? 'bg-bg-secondary text-text-primary' : 'text-text-tertiary hover:text-text-primary',
                    )}
                    data-testid={`trade-denom-${option}`}
                  >
                    {option === 'quote' ? symbol : 'usd'}
                  </button>
                ))}
              </span>
            )}
            <SlippageControl valueBps={slippageBps} onChange={setSlippageBps} />
          </span>
        </div>

        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={e => {
              // Digits and one decimal point, typed freely; a comma reads as a point. No browser spinner.
              const raw = e.target.value.replace(',', '.');
              if (/^\d*\.?\d*$/.test(raw)) setAmount(raw);
            }}
            disabled={!wallet.connected || loading}
            aria-label={`Amount in ${typedUnit}`}
            data-testid="trade-amount"
            className={cn(
              'no-spinner h-14 w-full rounded-lg border bg-bg-input pl-3 pr-28 font-mono text-xl text-text-primary placeholder:text-text-tertiary',
              'focus:outline-none focus:ring-2',
              isBuy
                ? 'border-border-default focus:border-accent-green focus:ring-accent-green/40'
                : 'border-border-default focus:border-accent-red focus:ring-accent-red/40',
              insufficient && 'border-accent-red',
              'disabled:opacity-60',
            )}
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {!isBuy && (
              <button
                type="button"
                onClick={() => setAmount(tokenBalance > 0 ? String(tokenBalance) : '')}
                disabled={!wallet.connected || tokenBalance <= 0}
                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-accent-green hover:bg-accent-green/10 disabled:opacity-40"
                data-testid="trade-max"
              >
                MAX
              </button>
            )}
            <span className="rounded-md bg-bg-tertiary px-2 py-1 font-mono text-xs font-semibold text-text-primary">{typedUnit}</span>
          </div>
        </div>
        {usdInput && amountValid && (
          <p className="mt-1 text-right text-[11px] text-text-tertiary" data-testid="trade-converted">
            ≈ {formatTokenAmount(parsed, 4)} {symbol}
          </p>
        )}

        <div className="mt-2 grid grid-cols-4 gap-1.5" data-testid="trade-quick-amounts">
          {isBuy
            ? BUY_QUICK_AMOUNTS.map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQuoteAmount(value)}
                  disabled={!wallet.connected || loading}
                  className="h-8 rounded-md border border-border-default bg-bg-tertiary font-mono text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-40"
                >
                  {value} {symbol}
                </button>
              ))
            : SELL_QUICK_PERCENTS.map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setAmount(tokenBalance > 0 ? String((tokenBalance * pct) / 100) : '')}
                  disabled={!wallet.connected || loading || tokenBalance <= 0}
                  className="h-8 rounded-md border border-border-default bg-bg-tertiary font-mono text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-40"
                >
                  {pct}%
                </button>
              ))}
        </div>

        <div className="mt-3 space-y-1.5 rounded-lg border border-border-default bg-bg-primary p-3 text-xs" data-testid="trade-quote">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-text-tertiary">You receive, quoted</span>
            <span className="text-right">
              <span className="font-mono text-sm font-semibold text-text-primary" data-testid="trade-receive">
                {quoting ? '…' : received != null ? `~${fmt(received)} ${outputUnit}` : `- ${outputUnit}`}
              </span>
              {!quoting && receivedUsd != null && (
                <span className="block text-[11px] text-text-tertiary">≈ {formatUsd(receivedUsd)}</span>
              )}
            </span>
          </div>
          {quote && (
            <div className="flex justify-between gap-2">
              <span className="text-text-tertiary">Price</span>
              <span className="font-mono text-text-secondary">
                {fmt(quote.priceQuote, 8)} {symbol} / {token.symbol}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <span className="text-text-tertiary">Min. received</span>
            <span className="font-mono text-text-secondary">{minReceived != null ? `${fmt(minReceived)} ${outputUnit}` : '-'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-tertiary">Max slippage</span>
            <span className="font-mono text-text-secondary">{bpsToPercent(slippageBps)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-tertiary">Price impact</span>
            <span
              className={cn('font-mono', highImpact ? 'text-accent-red' : warnImpact ? 'text-accent-yellow' : 'text-text-secondary')}
              data-testid="trade-impact"
            >
              {quote ? `${quote.priceImpactPct.toFixed(2)}%` : '-'}
            </span>
          </div>
          {quote && (
            <div className="flex justify-between gap-2">
              <span className="text-text-tertiary">LP fee</span>
              <span className="font-mono text-text-secondary" data-testid="trade-lp-fee">
                {fmt(quote.feeQuote, 6)} {symbol}
              </span>
            </div>
          )}
          {split && (
            <p className="border-t border-border-default pt-1.5 text-[11px] leading-4 text-text-tertiary" data-testid="trade-fee-line">
              {feeSplitLine(split, platformName)}
              {holdersLine && <span className="block text-text-tertiary/80">{holdersLine}</span>}
            </p>
          )}
        </div>

        {highImpact && <p className="mt-2 text-[11px] text-accent-red">This trade moves the curve by more than {HIGH_IMPACT_PCT}%.</p>}
        {slippageNote && (
          <p className="mt-2 text-[11px] text-accent-yellow" data-testid="trade-slippage-note">
            {slippageNote}
          </p>
        )}

        {wallet.connected ? (
          <Button
            variant={isBuy ? 'primary' : 'danger'}
            size="lg"
            onClick={() => void trade()}
            disabled={ctaDisabled}
            loading={loading}
            className="mt-3 w-full"
            data-testid="trade-submit"
          >
            {loading ? (status.kind === 'pending' && status.step === 'sign' ? 'Confirm in wallet…' : 'Confirming…') : ctaLabel}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            onClick={() => void wallet.connect()}
            className="mt-3 w-full"
            data-testid="trade-connect"
            loading={wallet.connecting}
          >
            Connect wallet
          </Button>
        )}

        {status.kind === 'confirmed' && (
          <p
            className="mt-2 flex items-center justify-between gap-2 rounded-md border border-accent-green/30 bg-accent-green/10 px-3 py-2 text-xs text-accent-green"
            data-testid="trade-status"
          >
            <span>Trade confirmed.</span>
            <a href={explorerUrl('tx', status.signature)} target="_blank" rel="noopener noreferrer" className="font-mono underline">
              {shortAddress(status.signature, 6, 4)} ↗
            </a>
          </p>
        )}
        {status.kind === 'error' && (
          <p
            className="mt-2 rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-xs text-accent-red"
            data-testid="trade-status"
          >
            {status.message}
          </p>
        )}
      </div>
    </section>
  );
}
