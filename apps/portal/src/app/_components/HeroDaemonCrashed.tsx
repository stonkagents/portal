/**
 * Purpose: Daemon crashed hero — shown when the agent goes offline after being connected.
 *          Red alert dot, the real last-seen time when the caller has one, restart button,
 *          data-safe reassurance. Nothing here is made up: no placeholder error text, no
 *          inert "View logs".
 */
'use client';

import { Icon } from '@/components/ui';
import { formatDateTime } from '@/lib/utils/format';

interface HeroDaemonCrashedProps {
  onRestart: () => void;
  /** When the agent last answered a health check (ISO string or epoch ms). Omitted = unknown, nothing is shown. */
  lastSeenAt?: string | number | null;
}

/** What to do when Restart gives up: the controller service that restarts the agent may be down as well. */
export const CRASHED_RESTART_HINT =
  'If Restart does not bring it back within a minute, open StonkAgents from the Start Menu, or open Windows Services and start the StonkAgents services.';

export function formatLastSeen(value: string | number, now = Date.now()): string {
  const then = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.floor((now - then) / 60_000);
  if (mins < 1) return 'less than a minute ago';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function HeroDaemonCrashed({ onRestart, lastSeenAt }: HeroDaemonCrashedProps) {
  const lastSeen = lastSeenAt != null ? formatLastSeen(lastSeenAt) : '';

  return (
    <div className="space-y-4 animate-fade-in-up" data-testid="hero-daemon-crashed">
      {/* Heading with a steady red dot — nothing pulses for something that is offline */}
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-accent-red shadow-[0_0_8px_var(--color-accent-red)]" />
        <h2 className="text-xl font-bold text-text-primary m-0">Your Agent went offline</h2>
      </div>

      {lastSeen && (
        <p className="text-sm text-text-secondary" data-testid="hero-daemon-last-seen">
          Last seen{' '}
          <span className="text-text-primary font-semibold" title={formatDateTime(lastSeenAt)}>
            {lastSeen}
          </span>
        </p>
      )}

      {/* Restart button */}
      <button
        data-testid="restart-daemon-button"
        onClick={onRestart}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-4 text-base font-bold bg-accent-green text-black rounded-lg border-none cursor-pointer hover:shadow-[0_0_25px_rgba(0,255,0,0.5)] hover:-translate-y-0.5 transition-[box-shadow,transform] min-h-[44px]"
      >
        <Icon name="play" size="sm" />
        Restart Your Agent
      </button>

      <span className="flex items-center gap-1 text-xs text-accent-green">
        <Icon name="check" size="sm" />
        Your data is safe
      </span>

      {/* Restart asks the controller service; when that is down too, the person needs the way in by hand. */}
      <p className="text-xs text-text-tertiary m-0" data-testid="hero-daemon-crashed-hint">
        {CRASHED_RESTART_HINT}
      </p>
    </div>
  );
}
