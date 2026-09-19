'use client';

/**
 * The launch modal.
 *
 * A thin shell around `LaunchForm`: overlay, header, close button, and the
 * mapping from a `LaunchResult` to the `LaunchedToken` the home page and the
 * profile already store. The component keeps its old name and its `onClose`
 * contract so `src/app/page.tsx` and the gallery keep working unchanged.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Icon } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { LaunchForm } from '@/components/features/launch';
import type { LaunchResult } from '@/components/features/launch';
import type { LaunchedToken } from './types';

export interface TokenWizardProps {
  /**
   * Fires when the modal closes. Carries the launch when there was one, so the
   * caller can move to Step 2; undefined when the creator left without launching.
   */
  onClose: (launched?: LaunchedToken) => void;
  /** Fires with the full launch result the moment the creator continues past the success screen. */
  onLaunched?: (result: LaunchResult) => void;
  /** Symbols already on the Network, for the collision warning. */
  existingSymbols?: string[];
}

/** The launch as the rest of the portal stores it. */
export function toLaunchedToken(result: LaunchResult): LaunchedToken {
  return {
    name: result.name,
    ticker: result.symbol,
    imageDataUrl: null,
    contractAddr: result.mint,
    imageUrl: result.imageUrl,
    ...(result.imageThumbUrl ? { imageThumbUrl: result.imageThumbUrl } : {}),
    poolId: result.poolId,
    quoteMint: result.quote.quoteMint,
    quoteSymbol: result.quoteSymbol,
    txSignature: result.txSignature,
    metadataUri: result.metadataUri,
  };
}

export function TokenWizard({ onClose, onLaunched, existingSymbols }: TokenWizardProps) {
  // A launch that is live but not yet "continued" still travels with a close.
  const confirmed = useRef<LaunchResult | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const close = useCallback(() => {
    onClose(confirmed.current ? toLaunchedToken(confirmed.current) : undefined);
  }, [onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const handleLaunched = useCallback(
    (result: LaunchResult) => {
      confirmed.current = result;
      onLaunched?.(result);
      onClose(toLaunchedToken(result));
    },
    [onClose, onLaunched],
  );

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center max-sm:items-end" data-testid="token-wizard">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-[6px] animate-[splash-fade-in_0.25s_ease-out]"
        onClick={close}
        onKeyDown={e => {
          if (e.key === 'Enter') close();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close launch form"
      />
      <div
        className={cn(
          'relative z-10 mx-4 flex max-h-[92vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-lg border border-border-default bg-bg-secondary',
          'shadow-[var(--shadow-lg)] animate-[token-wizard-in_0.25s_ease-out]',
          'max-sm:mx-0 max-sm:max-h-[94vh] max-sm:rounded-b-none',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-modal-title"
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-accent-green" />
        <span aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border-hover sm:hidden" />

        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border-default px-5 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary">New token · Raydium LaunchLab</p>
            <h2 id="launch-modal-title" className="text-lg font-semibold leading-6 text-text-primary">
              Launch Agent
            </h2>
          </div>
          <button
            onClick={close}
            className={cn(
              'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent text-text-secondary',
              'transition-colors duration-150 hover:border-border-hover hover:bg-bg-tertiary hover:text-text-primary active:scale-95 motion-safe:transition-transform',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
            )}
            aria-label="Close"
            data-testid="tw-close"
          >
            <Icon name="x" size="default" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
          <LaunchForm
            onLaunched={handleLaunched}
            onConfirmed={result => {
              confirmed.current = result;
            }}
            existingSymbols={existingSymbols}
          />
        </div>
      </div>
    </div>
  );
}
