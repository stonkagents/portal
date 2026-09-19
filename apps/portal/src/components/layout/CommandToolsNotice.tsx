/**
 * Purpose: The notice a tool-dependent feature shows while the background
 *          command tools job (Windows, agent 2.6.0+) is not done. The agent is
 *          live minutes after the install, but the OpenClaw CLI and gateway
 *          install afterwards, for up to 10 minutes; a disabled control alone
 *          reads as broken. Setting up: the sentence plus the job's phase and
 *          detail. Failed: the error and the Retry that starts the job again.
 *          Nothing for agents without such a job (2.5.x, macOS), and nothing
 *          once the job is ready; the hook polls, so the notice goes on its own.
 */
'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';
import type { CommandToolsStatus } from '@/lib/api/daemon-command-tools';
import { useCommandToolsPending, useRetryCommandTools, type CommandToolsPending } from '@/lib/api/hooks/use-command-tools';
import { useTranslation } from '@/providers/I18nProvider';
import { shortError } from './CommandToolsChip';

export interface CommandToolsNoticeViewProps {
  status: CommandToolsStatus;
  pending: CommandToolsPending;
  onRetry: () => void;
  retrying: boolean;
  retryError?: string | null;
  className?: string;
}

/** "(phase, detail)" for a running job; empty when the job has said nothing yet. */
export function pendingProgress(status: CommandToolsStatus): string {
  return [status.phase, status.detail].filter(Boolean).join(', ');
}

/** The notice for a given status (no data fetching; the tests render this). */
export function CommandToolsNoticeView({ status, pending, onRetry, retrying, retryError, className }: CommandToolsNoticeViewProps) {
  const { t } = useTranslation();
  const base = 'flex items-start gap-3 rounded-md border px-3 py-2.5 text-xs leading-relaxed';
  if (pending === 'failed') {
    return (
      <div
        role="alert"
        className={cn(base, 'border-accent-red/40 bg-accent-red/10 text-text-primary', className)}
        data-testid="command-tools-notice"
        data-state="failed"
      >
        <Icon name="alert-triangle" size="sm" className="mt-0.5 shrink-0 text-accent-red" />
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-accent-red">{t('commandTools.failed')}</span>: {shortError(status.error)}.
          {status.logPath && <span className="block text-text-tertiary">Log: {status.logPath}</span>}
          {retryError && (
            <span className="block text-accent-red" data-testid="command-tools-notice-retry-error">
              {retryError}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="shrink-0 rounded border border-accent-red/50 px-2.5 py-1 text-[11px] font-semibold text-accent-red hover:bg-accent-red/10 disabled:opacity-60 min-h-[32px]"
          data-testid="command-tools-notice-retry"
        >
          {retrying ? t('commandTools.retrying') : t('commandTools.retry')}
        </button>
      </div>
    );
  }
  const progress = pendingProgress(status);
  /* A job that never started has nothing to wait for; offer the same start as a retry. */
  const canStart = status.state === 'not_started';
  return (
    <div
      role="status"
      className={cn(base, 'border-accent-blue/40 bg-accent-blue/10 text-text-primary', className)}
      data-testid="command-tools-notice"
      data-state="running"
    >
      <span
        className="mt-1 h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-accent-blue border-t-transparent"
        /* animation-tier: 3 (ambient: activity indicator) */
      />
      <div className="min-w-0 flex-1">
        {t('commandTools.pending')}
        {progress && (
          <span className="block text-text-secondary" data-testid="command-tools-notice-progress">
            {progress}
          </span>
        )}
        {retryError && (
          <span className="block text-accent-red" data-testid="command-tools-notice-retry-error">
            {retryError}
          </span>
        )}
      </div>
      {canStart && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="shrink-0 rounded border border-accent-blue/50 px-2.5 py-1 text-[11px] font-semibold text-accent-blue hover:bg-accent-blue/10 disabled:opacity-60 min-h-[32px]"
          data-testid="command-tools-notice-retry"
        >
          {retrying ? t('commandTools.retrying') : t('commandTools.retry')}
        </button>
      )}
    </div>
  );
}

/** The notice wired to the controller; renders nothing when there is nothing to wait for. */
export function CommandToolsNotice({ className }: { className?: string }) {
  const { status, pending } = useCommandToolsPending();
  const retry = useRetryCommandTools();
  if (!status || !pending) return null;
  return (
    <CommandToolsNoticeView
      status={status}
      pending={pending}
      onRetry={() => retry.mutate()}
      retrying={retry.isPending}
      retryError={retry.error?.message ?? null}
      className={className}
    />
  );
}
