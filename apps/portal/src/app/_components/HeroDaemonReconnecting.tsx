/**
 * Purpose: Daemon reconnecting hero — shown during auto-reconnect attempts.
 *          Yellow accent, animated progress bar, attempt counter, cancel button.
 */
'use client';

import { Icon } from '@/components/ui';

interface HeroDaemonReconnectingProps {
  attempt: number;
  maxAttempts: number;
  onCancel: () => void;
}

export function HeroDaemonReconnecting({ attempt, maxAttempts, onCancel }: HeroDaemonReconnectingProps) {
  return (
    <div
      className="space-y-4 animate-fade-in-up border-t-[3px] border-t-accent-yellow -mx-6 -mt-6 px-6 pt-6 md:-mx-8 md:-mt-8 md:px-8 md:pt-8 rounded-t-lg"
      data-testid="hero-daemon-reconnecting"
    >
      {/* Heading with yellow pulse dot + typing dots */}
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-accent-yellow shadow-[0_0_8px_var(--color-accent-yellow)] animate-daemon-pulse" />
        <h2 className="text-xl font-bold text-text-primary m-0">
          Reconnecting
          <span className="inline-flex gap-0.5 ml-1 align-baseline">
            <span className="w-1 h-1 rounded-full bg-text-secondary animate-bounce motion-reduce:animate-none [animation-delay:0ms]" />
            <span className="w-1 h-1 rounded-full bg-text-secondary animate-bounce motion-reduce:animate-none [animation-delay:150ms]" />
            <span className="w-1 h-1 rounded-full bg-text-secondary animate-bounce motion-reduce:animate-none [animation-delay:300ms]" />
          </span>
        </h2>
      </div>

      {/* Attempt counter */}
      <p className="text-sm text-text-secondary">
        Attempt <span className="text-accent-yellow font-bold">{attempt}</span> of {maxAttempts}
      </p>

      {/* Animated indeterminate progress bar */}
      <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
        <div className="h-full bg-accent-yellow rounded-full w-[30%] animate-[indeterminate_1.5s_ease-in-out_infinite] motion-reduce:animate-none" />
      </div>

      {/* Data safe message */}
      <div className="flex items-center gap-1 text-xs text-accent-green">
        <Icon name="check" size="sm" />
        Your data is safe
      </div>

      {/* Cancel button */}
      <button
        data-testid="cancel-reconnect-button"
        onClick={onCancel}
        className="text-xs text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-secondary transition-colors px-2 min-h-[44px]"
      >
        Cancel
      </button>
    </div>
  );
}
