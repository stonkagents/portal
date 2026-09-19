'use client';

/**
 * The token is live. One button forward, everything else is a link.
 *
 * When the tracker did not record the launch, the notice says why: a wallet
 * that already has an agent is pointed at it, anything else gets the tracker's
 * own error and a retry that re-sends the same record.
 */

import Link from 'next/link';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { explorerUrl } from '@/lib/launchlab/build-launch';
import { jupiterSwapUrl, raydiumTokenUrl } from '@/lib/launchlab/venues';
import { mono } from './FieldChrome';
import { TokenPreviewCard } from './TokenPreviewCard';
import type { LaunchResult, RecordFailure } from './types';

interface LaunchSuccessProps {
  result: LaunchResult;
  onContinue: (result: LaunchResult) => void;
  /** Re-sends `POST /api/launch/record` with the body that failed. */
  onRetryRecord?: () => void | Promise<void>;
  /** True while a retry is in flight. */
  retrying?: boolean;
}

const linkClass = 'underline underline-offset-2 hover:text-text-primary';

/** The notice under the links when the tracker did not record a live token. */
function RecordNotice({ failure, onRetry, retrying }: { failure: RecordFailure; onRetry?: () => void; retrying?: boolean }) {
  if (failure.kind === 'exists') {
    const label = failure.name ?? failure.mint;
    return (
      <p
        className="rounded-md border border-accent-red/40 px-3 py-2 text-xs text-accent-red"
        role="alert"
        data-testid="launch-record-exists"
      >
        This wallet already has an agent:{' '}
        <Link href={`/tokens/${failure.mint}/`} className={linkClass} data-testid="launch-record-exists-link">
          {label}
          {failure.symbol ? ` ($${failure.symbol.toUpperCase()})` : ''}
        </Link>
        . One agent per wallet: the tracker will not list this token, and it is not bound to an agent.
      </p>
    );
  }

  // A request that never reached the tracker, tried more than once: a listing delay, not a refusal.
  const delayed = failure.transient && failure.attempts > 1;
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border px-3 py-2 text-xs',
        delayed ? 'border-accent-yellow/40 text-accent-yellow' : 'border-accent-red/40 text-accent-red',
      )}
      role={delayed ? 'status' : 'alert'}
      data-testid={delayed ? 'launch-record-pending' : 'launch-record-failed'}
    >
      <span>
        {delayed
          ? 'The token is on chain, but the tracker could not be reached to list it. It will appear in Agents once it does.'
          : `The token is on chain, but the tracker did not record it${failure.code ? ` (${failure.code})` : ''}: ${failure.message}`}
      </span>
      {onRetry && failure.retryable && (
        <Button
          variant="secondary"
          onClick={() => void onRetry()}
          loading={retrying}
          disabled={retrying}
          className="h-9 self-start text-xs"
          data-testid="launch-record-retry"
        >
          {delayed ? 'Try listing it again' : 'Retry'}
        </Button>
      )}
    </div>
  );
}

function LinkRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="shrink-0 text-xs text-text-secondary">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={cn(
            mono,
            'min-w-0 max-w-[60%] truncate rounded-sm text-xs text-accent-green hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
          )}
        >
          {value}
        </a>
      ) : (
        <span className={cn(mono, 'min-w-0 max-w-[60%] truncate text-xs text-text-primary')}>{value}</span>
      )}
    </div>
  );
}

export function LaunchSuccess({ result, onContinue, onRetryRecord, retrying = false }: LaunchSuccessProps) {
  const failure = !result.mock && !result.recorded ? (result.recordError ?? null) : null;
  // A second launch for a wallet that has an agent: the way forward is that agent, not this token.
  const existing = failure?.kind === 'exists' ? failure : null;
  return (
    <div
      data-testid="launch-success"
      className="mx-auto flex w-full max-w-[560px] flex-col gap-6 rounded-lg border border-accent-green bg-bg-primary p-6 shadow-[var(--shadow-glow)] animate-[fade-in_0.25s_ease-out] sm:p-8"
    >
      <div className="flex flex-col gap-2">
        <p className={cn(mono, 'flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-accent-green')}>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-green" />
          Live
        </p>
        <p className="text-xl font-semibold leading-7 text-text-primary">
          <span className={mono}>${result.symbol.toUpperCase()}</span> is live and trading.
        </p>
        <p className="text-sm text-text-secondary">
          It trades against $STONK on the curve until it graduates.{existing ? '' : ' Next, run the agent behind it.'}
        </p>
      </div>

      <TokenPreviewCard
        name={result.name}
        symbol={result.symbol}
        imageDataUrl={result.imageUrl || null}
        quoteSymbol={result.quoteSymbol}
      />

      <div className="divide-y divide-border-default rounded-md border border-border-default bg-bg-secondary px-4">
        <LinkRow label="Mint" value={result.mint} href={explorerUrl('address', result.mint)} />
        <LinkRow label="Pool" value="Raydium LaunchLab" href={raydiumTokenUrl(result.mint)} />
        <LinkRow label="Trade" value="Jupiter" href={jupiterSwapUrl(result.quote.quoteMint, result.mint)} />
        {result.txSignature && <LinkRow label="Transaction" value={result.txSignature} href={explorerUrl('tx', result.txSignature)} />}
      </div>

      {failure && <RecordNotice failure={failure} onRetry={onRetryRecord} retrying={retrying} />}

      <div className="flex flex-col gap-2 sm:flex-row">
        {existing ? (
          <Link
            href={`/tokens/${existing.mint}/`}
            data-testid="launch-open-existing"
            className={cn(
              'inline-flex h-12 flex-1 items-center justify-center rounded-md bg-accent-green px-4 text-sm font-semibold text-black no-underline',
              'shadow-[var(--shadow-md)] active:translate-y-px motion-safe:transition-transform',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
            )}
          >
            Open your agent{existing.symbol ? ` · $${existing.symbol.toUpperCase()}` : ''}
          </Link>
        ) : (
          <Button
            onClick={() => onContinue(result)}
            data-testid="launch-continue"
            className="h-12 flex-1 text-sm font-semibold shadow-[var(--shadow-md)] active:translate-y-px motion-safe:transition-transform"
          >
            Continue → Run your agent
          </Button>
        )}
        <Link
          href={`/tokens/${result.mint}`}
          className={cn(
            'inline-flex h-12 items-center justify-center rounded-md border border-border-default px-4 text-sm text-text-secondary',
            'transition-colors duration-150 hover:border-border-hover hover:text-text-primary',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green',
          )}
          data-testid="launch-view-token"
        >
          View token page
        </Link>
      </div>
    </div>
  );
}
