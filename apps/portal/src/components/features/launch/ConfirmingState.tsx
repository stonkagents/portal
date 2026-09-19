'use client';

/**
 * The wait between signing and a live pool.
 *
 * One signature, then this. The hash is on screen the moment it exists, and
 * the three steps that follow are already listed so the wait reads as progress
 * rather than a pause. A rail on the left fills step by step; the only motion
 * is the rail (transform) and the active spinner (transform).
 */

import { cn } from '@/lib/utils/cn';
import { explorerUrl } from '@/lib/launchlab/build-launch';
import { mono } from './FieldChrome';
import type { LaunchPhase } from './types';

interface ConfirmingStateProps {
  phase: LaunchPhase;
  txSignature?: string | null;
  name: string;
  symbol: string;
}

const STEPS: { key: LaunchPhase; label: string }[] = [
  { key: 'uploading', label: 'Storing the image and metadata' },
  { key: 'signing', label: 'Waiting for your signature' },
  { key: 'confirming', label: 'Confirming on Solana' },
  { key: 'recording', label: 'Listing it in Agents' },
];

const NEXT_STEPS = ['Run your agent', 'Tell it what to do', 'Share it with the Network'];

export function ConfirmingState({ phase, txSignature, name, symbol }: ConfirmingStateProps) {
  const current = STEPS.findIndex(step => step.key === phase);
  const progress = Math.max(0, current) / STEPS.length;

  return (
    <div
      data-testid="launch-confirming"
      className="mx-auto flex w-full max-w-[560px] flex-col gap-6 rounded-lg border border-border-default bg-bg-primary p-6 animate-[fade-in_0.25s_ease-out] sm:p-8"
      aria-live="polite"
    >
      <div className="flex flex-col gap-2">
        <p className={cn(mono, 'flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-accent-green')}>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-green" />
          Launching
        </p>
        <p className="text-xl font-semibold leading-7 text-text-primary">
          {name || 'Your token'} <span className={cn(mono, 'text-base font-normal text-text-secondary')}>${symbol.toUpperCase()}</span>
        </p>
        <p className="text-sm text-text-secondary">This takes a few seconds. Leave the tab open.</p>
      </div>

      <div className="h-0.5 w-full overflow-hidden rounded-full bg-bg-tertiary" aria-hidden="true">
        <div
          className="h-full origin-left bg-accent-green transition-transform duration-[250ms] ease-out"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>

      <ol className="relative flex flex-col gap-4">
        <span aria-hidden="true" className="absolute bottom-3 left-[11px] top-3 w-px bg-border-default" />
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step.key} className="relative flex items-center gap-4">
              <span
                className={cn(
                  mono,
                  'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px]',
                  done && 'border-accent-green bg-accent-green text-black',
                  active && 'border-accent-green bg-bg-primary text-accent-green',
                  !done && !active && 'border-border-hover bg-bg-primary text-text-tertiary',
                )}
              >
                {done ? (
                  <svg
                    viewBox="0 0 20 20"
                    width="12"
                    height="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden="true"
                  >
                    <path d="m5 10.5 3.2 3.2L15 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  'flex-1 text-sm',
                  active ? 'font-medium text-text-primary' : done ? 'text-text-secondary' : 'text-text-tertiary',
                )}
              >
                {step.label}
              </span>
              {active && (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent-green/30 border-t-accent-green"
                />
              )}
              {done && <span className={cn(mono, 'text-[10px] uppercase tracking-[0.12em] text-text-tertiary')}>done</span>}
            </li>
          );
        })}
      </ol>

      {txSignature && (
        <div className="rounded-md border border-border-default bg-bg-secondary px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className={cn(mono, 'text-[10px] uppercase tracking-[0.12em] text-text-tertiary')}>Transaction</p>
            <a
              href={explorerUrl('tx', txSignature)}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm text-xs text-accent-green hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green"
            >
              View on the explorer
            </a>
          </div>
          <p className={cn(mono, 'mt-1 truncate text-xs text-text-primary')} data-testid="launch-tx">
            {txSignature}
          </p>
        </div>
      )}

      <div className="border-t border-border-default pt-5">
        <p className={cn(mono, 'text-[11px] uppercase tracking-[0.14em] text-text-tertiary')}>Next, in three steps</p>
        <ol className="mt-2 flex flex-col gap-1.5">
          {NEXT_STEPS.map((step, index) => (
            <li key={step} className="flex items-baseline gap-3 text-sm text-text-secondary">
              <span className={cn(mono, 'w-5 shrink-0 text-xs text-text-tertiary')}>0{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
