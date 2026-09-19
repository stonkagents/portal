/**
 * The two home steps as a numbered rail: the badge carries the step's number
 * (the only place it appears), a line joins the two, the live step is lit green
 * with a one-time ring on arrival.
 * On Step 2 the first badge shows a check, so the rail reads as progress.
 */
import { cn } from '@/lib/utils/cn';

const DEFAULT_QUOTE_SYMBOL = 'STONK';

const STEP_LINES = [`Tokenize against $${DEFAULT_QUOTE_SYMBOL}`, 'Run your agent'] as const;

function Check() {
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
      <path d="m5 10.5 3.2 3.2L15 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StepBullets({ active, className }: { active: 1 | 2; className?: string }) {
  return (
    <ol className={cn('m-0 flex list-none flex-col p-0', className)} data-testid="step-bullets" data-active={active}>
      {STEP_LINES.map((line, i) => {
        const step = i + 1;
        const current = step === active;
        const done = step < active;
        const last = i === STEP_LINES.length - 1;
        return (
          <li
            key={line}
            className="relative flex items-center gap-3 py-1"
            data-testid={`step-bullet-${step}`}
            data-state={current ? 'current' : done ? 'done' : 'next'}
            aria-current={current ? 'step' : undefined}
          >
            {!last && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-[13px] top-[calc(50%+14px)] h-[calc(100%-20px)] w-px',
                  done
                    ? 'bg-accent-green/60'
                    : current
                      ? 'bg-gradient-to-b from-accent-green/60 to-border-default'
                      : 'bg-border-default',
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold tabular-nums',
                current && 'border-accent-green bg-accent-green/15 text-accent-green shadow-[0_0_10px_rgba(0,255,0,0.35)]',
                done && 'border-accent-green/50 bg-accent-green/10 text-accent-green',
                !current && !done && 'border-border-hover bg-bg-tertiary text-text-tertiary',
              )}
            >
              {current && (
                <span className="absolute inset-0 rounded-full border border-accent-green/70 animate-step-ring motion-reduce:hidden" />
              )}
              {done ? <Check /> : step}
            </span>
            <span
              className={cn(
                'min-w-0 truncate text-[0.9375rem] leading-snug tracking-tight',
                current ? 'font-semibold text-text-primary' : done ? 'text-text-secondary' : 'text-text-tertiary',
              )}
            >
              {line}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
