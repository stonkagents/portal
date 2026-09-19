/**
 * Purpose: "Command tools" status chip next to the agent's status. The Windows
 *          installer (2.6.0+) leaves the command tools (the stonkagents CLI and
 *          the OpenClaw gateway) to a background job after setup; this chip
 *          shows that job: setting up (phase, npm counter, elapsed time), ready
 *          (for a minute), or failed with a Retry button. Hidden for agents
 *          without such a job (2.5.x, macOS) and once a ready job is old news.
 */
'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';
import type { CommandToolsStatus } from '@/lib/api/daemon-command-tools';
import { commandToolsVisible, useCommandTools, useRetryCommandTools } from '@/lib/api/hooks/use-command-tools';

/** m:ss (h:mm:ss from an hour) between two instants; empty when either is unknown. Exported for tests. */
export function elapsedBetween(startedAt: string | null, endAt: string | number | null): string {
  if (!startedAt || endAt === null) return '';
  const start = Date.parse(startedAt);
  const end = typeof endAt === 'number' ? endAt : Date.parse(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  const s = Math.max(0, Math.floor((end - start) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** One line for the chip's title attribute and the failed text. */
export function shortError(error: string | null): string {
  const text = (error ?? '').trim();
  if (!text) return 'see the log file';
  return text.length > 120 ? text.slice(0, 119).replace(/\s+\S*$/, '') + '...' : text;
}

export interface CommandToolsChipViewProps {
  status: CommandToolsStatus;
  /** The clock, for the elapsed time of a running job. */
  now: number;
  onRetry: () => void;
  retrying: boolean;
  retryError?: string | null;
  className?: string;
}

/** The chip for a given status (no data fetching; the tests render this). */
export function CommandToolsChipView({ status, now, onRetry, retrying, retryError, className }: CommandToolsChipViewProps) {
  const base = 'inline-flex max-w-[26rem] items-center gap-1.5 rounded-md border px-2 py-1 text-xs min-h-[28px]';
  if (status.state === 'running') {
    const elapsed = elapsedBetween(status.startedAt, now);
    const parts = [status.detail, elapsed].filter(Boolean).join(', ');
    return (
      <span
        className={cn(base, 'border-accent-blue/40 bg-accent-blue/10 text-text-secondary', className)}
        title={`${status.phase || 'Working'}${status.logPath ? `. Log: ${status.logPath}` : ''}`}
        data-testid="command-tools-chip"
        data-state="running"
      >
        <span
          className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-accent-blue border-t-transparent"
          /* animation-tier: 3 (ambient: activity indicator) */
        />
        <span className="truncate">
          Command tools: setting up{parts ? ` (${parts})` : ''}
        </span>
      </span>
    );
  }
  if (status.state === 'failed') {
    const error = shortError(status.error);
    return (
      <span
        className={cn(base, 'border-accent-red/40 bg-accent-red/10 text-accent-red', className)}
        title={`${error}${status.logPath ? `. Log: ${status.logPath}` : ''}`}
        data-testid="command-tools-chip"
        data-state="failed"
      >
        <Icon name="alert-triangle" size="sm" className="shrink-0" />
        <span className="truncate">Command tools failed: {error}</span>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="ml-1 shrink-0 rounded border border-accent-red/50 px-1.5 py-0.5 text-[11px] font-semibold text-accent-red hover:bg-accent-red/10 disabled:opacity-60"
          data-testid="command-tools-retry"
          title={retryError ?? 'Run the command tools setup again'}
        >
          {retrying ? 'Retrying' : 'Retry'}
        </button>
      </span>
    );
  }
  return (
    <span
      className={cn(base, 'border-accent-green/40 bg-accent-green/10 text-accent-green', className)}
      title="The stonkagents CLI and the OpenClaw gateway are installed"
      data-testid="command-tools-chip"
      data-state="ready"
    >
      <Icon name="check-circle" size="sm" className="shrink-0" />
      <span className="truncate">Command tools ready</span>
    </span>
  );
}

/** The chip wired to the controller; renders nothing when there is nothing to say. */
export function CommandToolsChip({ className }: { className?: string }) {
  const { data } = useCommandTools();
  const retry = useRetryCommandTools();
  /* A ticking clock only while a job runs, so the elapsed time moves between polls. */
  const [now, setNow] = useState(() => Date.now());
  const running = data?.state === 'running';
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!data || !commandToolsVisible(data)) return null;
  return (
    <CommandToolsChipView
      status={data}
      now={now}
      onRetry={() => retry.mutate()}
      retrying={retry.isPending}
      retryError={retry.error?.message ?? null}
      className={className}
    />
  );
}
