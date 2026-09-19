/**
 * Token detail: buy and sell the Network token through Jupiter, in the app.
 *
 * The stonkfun-sourced Network token has no pool this site trades directly;
 * Jupiter's Swap API routes it (Raydium CLMM today). The panel wears the
 * curve trade panel's clothes: the same tabs, input, quick amounts, slippage
 * picker and quote box, with Jupiter's numbers in them. The wallet signs; we
 * send on our RPC. The daemon is never involved.
 */

'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { explorerUrl } from '@/config';
import { useToast } from '@/providers/ToastProvider';
import { stonkfunKeys } from '@/lib/api/hooks/use-stonkfun-token';
import { bpsToPercent } from '@/lib/launchlab/pricing';
import { SWAP_SLIPPAGE_PRESETS_BPS, useJupiterSwap, type SwapResult } from '@/lib/jupiter/use-jupiter-swap';
import { useWalletService } from '@/lib/wallet';
import { solscanTxUrl } from '@/lib/token-launch/constants';
import { cn } from '@/lib/utils/cn';
import type { GalleryToken } from '../_lib/gallery-token';
import { formatTokenAmount, shortAddress } from '../_lib/detail-format';
import { SlippageControl } from './SlippageControl';
import { useScrollToHash } from './use-scroll-to-hash';

/** Quick amounts for a buy, in whole quote tokens. */
const BUY_QUICK_AMOUNTS = [10, 50, 100, 500] as const;
/** Quick amounts for a sell, as a share of the wallet's balance. */
const SELL_QUICK_PERCENTS = [25, 50, 75, 100] as const;
/** Price impact colour thresholds, in percent. */
const WARN_IMPACT_PCT = 2;
const HIGH_IMPACT_PCT = 5;

const fmt = (value: number, digits = 4): string =>
  Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: digits }) : '-';

interface JupiterSwapPanelProps {
  token: GalleryToken;
  tokenMint: string;
  quoteMint: string;
  quoteSymbol: string | null;
  /** Jupiter's own swap page for the pair, kept as a second door. */
  externalHref?: string | null;
  /** Called after a swap lands, so the page can re-read what it shows. */
  onSwapped?: () => void;
}

export function JupiterSwapPanel({ token, tokenMint, quoteMint, quoteSymbol, externalHref, onSwapped }: JupiterSwapPanelProps) {
  const wallet = useWalletService();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const handleSwapped = useCallback(
    (result: SwapResult) => {
      addToast({
        title: `Swapped ${fmt(result.amountIn)} ${result.inSymbol} for ~${fmt(result.amountOut)} ${result.outSymbol}`,
        description: `${result.signature.slice(0, 8)}…${result.signature.slice(-6)}`,
        action: { label: 'View tx ↗', href: solscanTxUrl(result.signature) },
        variant: 'success',
        autoDismiss: true,
      });
      // stonkfun's figures for the token (price, volume, cap) move with the trade.
      void queryClient.invalidateQueries({ queryKey: stonkfunKeys.token(tokenMint) });
      onSwapped?.();
    },
    [addToast, queryClient, tokenMint, onSwapped],
  );

  const swap = useJupiterSwap({
    tokenMint,
    quoteMint,
    tokenSymbol: token.symbol,
    quoteSymbol: quoteSymbol ?? 'quote',
    onSwapped: handleSwapped,
  });
  useScrollToHash('trade', true);

  const { side, quote, status, inSymbol, outSymbol, balanceIn, amountValid, insufficient, blocked } = swap;
  const isBuy = side === 'buy';
  const loading = status.kind === 'pending';
  const highImpact = quote != null && quote.priceImpactPct >= HIGH_IMPACT_PCT;
  const warnImpact = quote != null && !highImpact && quote.priceImpactPct >= WARN_IMPACT_PCT;
  const taxPct = token.transferFeeBps != null && token.transferFeeBps > 0 ? token.transferFeeBps / 100 : null;

  const onSwap = async () => {
    const outcome = await swap.swap();
    if (!outcome.ok) addToast({ title: outcome.error.message, variant: 'error', autoDismiss: true });
  };

  const ctaLabel =
    blocked && wallet.connected
      ? 'Swap unavailable'
      : insufficient
        ? `Insufficient ${inSymbol}`
        : !amountValid
          ? `Enter ${inSymbol} amount`
          : swap.quoteError
            ? 'No quote'
            : isBuy
              ? `Buy ${token.symbol}`
              : `Sell ${token.symbol}`;
  const ctaDisabled = loading || Boolean(blocked) || !amountValid || swap.quoting || insufficient || !quote;
  const pendingLabel =
    status.kind === 'pending'
      ? status.step === 'sign'
        ? 'Confirm in wallet…'
        : status.step === 'confirm'
          ? 'Confirming…'
          : 'Preparing…'
      : null;

  return (
    <section
      className="overflow-hidden rounded-xl border border-border-default bg-bg-secondary"
      data-testid="token-trading"
      data-source="jupiter"
      id="trade"
    >
      <div className="grid grid-cols-2 border-b border-border-default" role="tablist" aria-label="Trade side">
        {(['buy', 'sell'] as const).map(option => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={side === option}
            onClick={() => swap.setSide(option)}
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
                Balance <span className="font-mono text-text-secondary">{formatTokenAmount(balanceIn, 4)}</span> {inSymbol}
              </>
            ) : (
              'Wallet not connected'
            )}
          </span>
          <SlippageControl valueBps={swap.slippageBps} onChange={swap.setSlippageBps} presets={SWAP_SLIPPAGE_PRESETS_BPS} />
        </div>

        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={swap.amount}
            onChange={e => {
              // Digits and one decimal point, typed freely; a comma reads as a point. No browser spinner.
              const raw = e.target.value.replace(',', '.');
              if (/^\d*\.?\d*$/.test(raw)) swap.setAmount(raw);
            }}
            disabled={!wallet.connected || loading}
            aria-label={`Amount in ${inSymbol}`}
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
            <button
              type="button"
              onClick={swap.setMax}
              disabled={!wallet.connected || loading || balanceIn <= 0}
              className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-accent-green hover:bg-accent-green/10 disabled:opacity-40"
              data-testid="trade-max"
            >
              MAX
            </button>
            <span className="rounded-md bg-bg-tertiary px-2 py-1 font-mono text-xs font-semibold text-text-primary">{inSymbol}</span>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5" data-testid="trade-quick-amounts">
          {isBuy
            ? BUY_QUICK_AMOUNTS.map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => swap.setAmount(String(value))}
                  disabled={!wallet.connected || loading}
                  className="h-8 rounded-md border border-border-default bg-bg-tertiary font-mono text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-40"
                >
                  {value} {inSymbol}
                </button>
              ))
            : SELL_QUICK_PERCENTS.map(pct => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => swap.setAmount(balanceIn > 0 ? String((balanceIn * pct) / 100) : '')}
                  disabled={!wallet.connected || loading || balanceIn <= 0}
                  className="h-8 rounded-md border border-border-default bg-bg-tertiary font-mono text-xs text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-40"
                >
                  {pct}%
                </button>
              ))}
        </div>

        <div className="mt-3 space-y-1.5 rounded-lg border border-border-default bg-bg-primary p-3 text-xs" data-testid="trade-quote">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-text-tertiary">You receive, quoted</span>
            <span className="font-mono text-sm font-semibold text-text-primary" data-testid="trade-receive">
              {swap.quoting && !quote ? '…' : quote ? `~${fmt(quote.amountOut)} ${outSymbol}` : `- ${outSymbol}`}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-tertiary">Rate</span>
            <span className="font-mono text-text-secondary" data-testid="trade-rate">
              {quote ? `~${fmt(quote.rate)} ${outSymbol} for 1 ${inSymbol}` : '-'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-tertiary">Min. received</span>
            <span className="font-mono text-text-secondary" data-testid="trade-min-received">
              {quote ? `${fmt(quote.minReceived)} ${outSymbol}` : '-'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-tertiary">Max slippage</span>
            <span className="font-mono text-text-secondary">{bpsToPercent(swap.slippageBps)}</span>
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
          <div className="flex justify-between gap-2">
            <span className="text-text-tertiary">Route</span>
            <span className="font-mono text-text-secondary" data-testid="trade-route">
              {quote ? `via Jupiter (${quote.route})` : 'via Jupiter'}
            </span>
          </div>
          {taxPct != null && (
            <p className="border-t border-border-default pt-1.5 text-[11px] leading-4 text-text-tertiary" data-testid="trade-tax-line">
              {token.symbol} charges a {taxPct}% transfer tax on every transfer.
            </p>
          )}
        </div>

        {highImpact && (
          <p className="mt-2 text-[11px] text-accent-red" data-testid="trade-impact-note">
            This swap moves the price by more than {HIGH_IMPACT_PCT}%. Consider a smaller amount.
          </p>
        )}
        {warnImpact && (
          <p className="mt-2 text-[11px] text-accent-yellow" data-testid="trade-impact-note">
            This swap moves the price by more than {WARN_IMPACT_PCT}%.
          </p>
        )}
        {swap.quoteError && amountValid && (
          <p className="mt-2 text-[11px] text-accent-red" data-testid="trade-quote-error">
            {swap.quoteError}
          </p>
        )}
        {blocked && wallet.connected && (
          <p className="mt-2 text-[11px] text-accent-yellow" data-testid="trade-blocked">
            {blocked}
          </p>
        )}

        {wallet.connected ? (
          <Button
            variant={isBuy ? 'primary' : 'danger'}
            size="lg"
            onClick={() => void onSwap()}
            disabled={ctaDisabled}
            loading={loading}
            className="mt-3 w-full"
            data-testid="trade-submit"
          >
            {pendingLabel ?? ctaLabel}
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
            <span>
              Swapped {fmt(status.result.amountIn)} {status.result.inSymbol} for ~{fmt(status.result.amountOut)}{' '}
              {status.result.outSymbol}.
            </span>
            <a
              href={explorerUrl('tx', status.result.signature)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-mono underline"
              data-testid="trade-status-link"
            >
              {shortAddress(status.result.signature, 6, 4)} ↗
            </a>
          </p>
        )}
        {status.kind === 'error' && (
          <p
            className="mt-2 rounded-md border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-xs text-accent-red"
            data-testid="trade-status"
          >
            {status.error.message}
          </p>
        )}

        {externalHref && (
          <a
            href={externalHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md border border-border-default px-4 text-xs font-medium text-text-secondary no-underline hover:border-border-hover hover:text-text-primary"
            data-testid="trade-open-jupiter"
          >
            Open on Jupiter ↗
          </a>
        )}
      </div>
    </section>
  );
}
