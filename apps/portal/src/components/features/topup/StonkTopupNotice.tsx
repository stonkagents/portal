'use client';

/**
 * The line under a launch or a buy the wallet's $STONK does not cover, and the
 * label its button wears while the top-up runs: "Swap ~0.42 SOL for 1,250
 * $STONK and continue". Both hosts render this and keep their own button; the
 * hook in `lib/jupiter/use-stonk-topup.ts` does the work. Spans only: the
 * launch summary renders it inside a paragraph.
 */

import { cn } from '@/lib/utils/cn';
import type { StonkTopupController } from '@/lib/jupiter/use-stonk-topup';

const fmt = (n: number, digits = 2) => n.toLocaleString('en-US', { maximumFractionDigits: digits });
const fmtSol = (n: number) => fmt(n, 3);

/** What the primary button says while a top-up is offered or running. */
export function topupCtaLabel(topup: StonkTopupController, quoteSymbol: string): string {
  const { status, quote } = topup;
  if (status.kind === 'pending') {
    switch (status.step) {
      case 'quote':
        return 'Quoting swap…';
      case 'build':
        return 'Preparing swap…';
      case 'sign':
        return 'Confirm swap in wallet…';
      case 'confirm':
        return 'Swapping…';
      case 'balance':
        return 'Confirming…';
    }
  }
  if (quote) return `Swap ~${fmtSol(quote.solIn)} SOL for ${fmt(quote.stonkOut)} $${quoteSymbol} and continue`;
  if (topup.quoteError) return 'Swap unavailable';
  return 'Quoting swap…';
}

/** True while the button must wait: no quote yet, no route, or not enough SOL. */
export function topupBlocked(topup: StonkTopupController): boolean {
  return topup.canTopUp && (topup.quote == null || Boolean(topup.solInsufficient));
}

interface StonkTopupNoticeProps {
  topup: StonkTopupController;
  quoteSymbol: string;
  /** What continues after the swap, in prose: "the launch", "the buy". */
  action: string;
  className?: string;
}

export function StonkTopupNotice({ topup, quoteSymbol, action, className }: StonkTopupNoticeProps) {
  if (!topup.canTopUp) return null;
  const { quote, status } = topup;
  const problem = status.kind === 'error' ? status.error.message : (topup.solInsufficient ?? topup.quoteError);
  return (
    <span className={cn('block text-[11px] leading-4', className)} data-testid="stonk-topup">
      <span className="block text-text-secondary">
        {quote ? (
          <>
            Short {fmt(topup.shortfall)} ${quoteSymbol}. One click swaps ~{fmtSol(quote.solIn)} SOL for {fmt(quote.stonkOut)} ${quoteSymbol} via
            Jupiter (about {fmt(quote.rate, 0)} ${quoteSymbol} per SOL, at most {fmtSol(quote.maxSolIn)} SOL), then {action} continues. You
            sign twice.
          </>
        ) : topup.quoteError ? (
          <>Short {fmt(topup.shortfall)} ${quoteSymbol}, and Jupiter could not quote a swap for it.</>
        ) : (
          <>Short {fmt(topup.shortfall)} ${quoteSymbol}. Asking Jupiter what that costs in SOL…</>
        )}
      </span>
      {problem && (
        <span className="mt-1 block text-accent-red" role="alert" data-testid="stonk-topup-problem">
          {problem}
        </span>
      )}
    </span>
  );
}
