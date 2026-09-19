'use client';

/**
 * What the launch form shows before it can be a form: the launchpad is not
 * answering (or has no $STONK quote), or its configuration is still loading.
 */

import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { LaunchConfigError, QUOTE_NOT_ALLOWED_CODE } from '@/lib/launchlab/launch-config';
import { mono } from './FieldChrome';

interface LaunchpadOfflineProps {
  /** The tracker answered, but with no $STONK quote to launch against. */
  noStonkQuote: boolean;
  /** The config request's error, when that is what went wrong. */
  error: unknown;
  onRetry: () => void;
}

export function LaunchpadOffline({ noStonkQuote, error, onRetry }: LaunchpadOfflineProps) {
  // The tracker answered and meant it: the quote asked for is not $STONK.
  const quoteRefused = error instanceof LaunchConfigError && error.code === QUOTE_NOT_ALLOWED_CODE;
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg border border-border-default bg-bg-primary p-6"
      data-testid="launch-config-error"
      role="alert"
    >
      <p className={cn(mono, 'text-[11px] uppercase tracking-[0.14em] text-accent-red')}>
        {quoteRefused ? 'Quote refused' : 'Launchpad offline'}
      </p>
      <p className="text-sm font-semibold text-text-primary" data-testid="launch-config-error-title">
        {noStonkQuote
          ? 'The launchpad has no $STONK quote.'
          : quoteRefused
            ? 'The launchpad refused the quote.'
            : 'The launchpad is not answering.'}
      </p>
      <p className="text-xs text-text-secondary">
        {noStonkQuote
          ? 'Agents launch against $STONK only. This tracker offers no $STONK quote to launch against.'
          : error instanceof Error
            ? error.message
            : 'Could not load the launch configuration.'}
      </p>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function LaunchpadLoading() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_368px] lg:gap-10" data-testid="launch-config-loading" aria-busy="true">
      <div className="flex flex-col gap-4">
        <div className="h-4 w-24 animate-pulse rounded-sm bg-bg-tertiary" />
        <div className="h-11 animate-pulse rounded-md bg-bg-input" />
        <div className="h-11 animate-pulse rounded-md bg-bg-input" />
        <div className="h-[88px] animate-pulse rounded-md bg-bg-input" />
        <div className="h-[88px] animate-pulse rounded-lg bg-bg-input" />
        <p className={cn(mono, 'text-[11px] uppercase tracking-[0.14em] text-text-tertiary')}>Loading the launchpad…</p>
      </div>
      <div className="hidden h-80 animate-pulse rounded-lg border border-border-default bg-bg-primary lg:block" />
    </div>
  );
}
