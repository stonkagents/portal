/**
 * Purpose: "Update your agent" banner showing the update lifecycle — AVAILABLE through COMPLETE/FAILED.
 *          The local daemon is "your agent" in copy. Rendered by LayoutShell only while connected.
 */
'use client';

import { Icon } from '@/components/ui/Icon';
import type { UpdateStatus } from '@/lib/api/hooks/use-update-status';

/** States that show nothing — banner hides */
const HIDDEN_STATES = new Set(['IDLE', 'CANCELLED']);

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Format bytes to human-readable string (e.g. 5242880 → "5.0 MB") */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value.toFixed(1)} ${SIZE_UNITS[unitIdx]}`;
}

export interface UpdateBannerProps {
  status: UpdateStatus;
  onStartUpdate: () => void;
  onCancelUpdate: () => void;
  onDismiss?: () => void;
}

export function UpdateBanner({ status, onStartUpdate, onCancelUpdate, onDismiss }: UpdateBannerProps) {
  if (HIDDEN_STATES.has(status.state)) return null;

  return (
    <div
      data-testid="update-banner"
      className={`w-full border-b px-4 py-3 ${borderColor(status)}`}
      /* animation-tier: 2 — functional: update state change */
    >
      {/* Text first; on a phone the buttons take the next line instead of squeezing the text into a column. */}
      <div className="mx-auto flex max-w-[var(--container-max)] flex-wrap items-center justify-between gap-3">
        <BannerContent status={status} />
        <BannerActions status={status} onStartUpdate={onStartUpdate} onCancelUpdate={onCancelUpdate} onDismiss={onDismiss} />
      </div>
    </div>
  );
}

/**
 * One line next to the title: the first sentence of the release notes, without
 * the "StonkAgents 2.4.1:" lead-in, cut at 90 characters. Exported for tests.
 */
export function releaseOneLiner(notes: string): string {
  let text = notes.trim().replace(/^StonkAgents\s+[\w.]+(?:\s*\([^)]*\))?\s*:\s*/i, '');
  const stop = text.search(/[.;](\s|$)/);
  if (stop > 0) text = text.slice(0, stop);
  text = text.trim();
  if (text.length > 90) text = text.slice(0, 89).replace(/\s+\S*$/, '') + '...';
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

function borderColor(status: UpdateStatus): string {
  if (status.force) return 'border-accent-yellow bg-bg-secondary';
  if (status.state === 'FAILED') return 'border-accent-red bg-bg-secondary';
  if (status.state === 'COMPLETE') return 'border-accent-green bg-bg-secondary';
  return 'border-accent-blue bg-bg-secondary';
}

function BannerContent({ status }: { status: UpdateStatus }) {
  switch (status.state) {
    case 'AVAILABLE':
      return (
        <div className="flex min-w-0 basis-full items-start gap-2 sm:flex-1">
          <Icon name="package" size="sm" className="mt-0.5 shrink-0 text-accent-blue" />
          <div className="min-w-0">
            <p className="text-sm text-text-primary">
              {status.force
                ? `Your agent v${status.currentVersion} is no longer supported. Update to v${status.latestVersion}.`
                : `Update your agent to v${status.latestVersion}`}
              {status.releaseNotes && releaseOneLiner(status.releaseNotes) && (
                <span className="text-text-secondary" data-testid="update-release-notes">
                  {' '}
                  {releaseOneLiner(status.releaseNotes)}
                </span>
              )}
            </p>
            {status.manualInstall && status.installerUrl && (
              <p className="text-xs text-text-tertiary mt-0.5" data-testid="update-manual-hint">
                Run the installer; it updates your agent in place.
              </p>
            )}
          </div>
        </div>
      );
    case 'DOWNLOADING':
      return (
        <div className="flex min-w-0 basis-full flex-wrap items-center gap-3 sm:flex-1">
          <Icon name="download" size="sm" className="text-accent-blue" />
          <span className="text-sm text-text-secondary">
            Downloading... {status.progress}%
            {status.bytesTotal > 0 && ` (${formatBytes(status.bytesDownloaded)} / ${formatBytes(status.bytesTotal)})`}
          </span>
          <div className="h-2 min-w-[8rem] flex-1 rounded-full bg-bg-tertiary">
            <div
              data-testid="update-progress-bar"
              className="h-2 rounded-full bg-accent-blue transition-[width] duration-250 ease-in-out"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      );
    case 'VERIFYING':
      return <BannerSpinner text="Verifying update..." warn />;
    case 'INSTALLING':
      return <BannerSpinner text="Installing..." warn />;
    case 'RESTARTING':
      return <BannerSpinner text="Restarting your agent..." warn />;
    case 'COMPLETE':
      return (
        <div className="flex items-center gap-2">
          <Icon name="check-circle" size="sm" className="text-accent-green" />
          <p className="text-sm text-accent-green">Your agent is now v{status.latestVersion}</p>
        </div>
      );
    case 'FAILED':
      return (
        <div className="flex items-center gap-2">
          <Icon name="alert-triangle" size="sm" className="text-accent-red" />
          <p className="text-sm text-accent-red">
            Update failed. Your agent was rolled back{status.error ? `: ${status.error}` : ''}
          </p>
        </div>
      );
    default:
      return null;
  }
}

function BannerSpinner({ text, warn }: { text: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        data-testid="update-spinner"
        className="h-4 w-4 animate-spin rounded-full border-2 border-accent-blue border-t-transparent"
        /* animation-tier: 3 — ambient: activity indicator */
      />
      <span className="text-sm text-text-secondary">{text}</span>
      {warn && <span className="text-xs text-accent-yellow">Do not close StonkAgents</span>}
    </div>
  );
}

function BannerActions({
  status,
  onStartUpdate,
  onCancelUpdate,
  onDismiss,
}: {
  status: UpdateStatus;
  onStartUpdate: () => void;
  onCancelUpdate: () => void;
  onDismiss?: () => void;
}) {
  switch (status.state) {
    case 'AVAILABLE':
      return (
        <div className="flex gap-2">
          {status.manualInstall && status.installerUrl ? (
            // Windows: the controller cannot update in place. Hand the user the
            // installer; running it performs a major upgrade over this install.
            <a
              data-testid="update-download-link"
              href={status.installerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] min-w-[44px] items-center rounded-md bg-accent-green px-4 py-2 text-sm font-medium text-bg-primary hover:opacity-90"
            >
              Download
            </a>
          ) : (
            <button
              data-testid="update-start-button"
              onClick={onStartUpdate}
              className="min-h-[44px] min-w-[44px] rounded-md bg-accent-green px-4 py-2 text-sm font-medium text-bg-primary hover:opacity-90"
            >
              Update your agent
            </button>
          )}
          {!status.force && (
            <button
              data-testid="update-later-button"
              onClick={onDismiss}
              className="min-h-[44px] min-w-[44px] rounded-md px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            >
              Later
            </button>
          )}
        </div>
      );
    case 'DOWNLOADING':
      return (
        <button
          data-testid="update-cancel-button"
          onClick={onCancelUpdate}
          className="min-h-[44px] min-w-[44px] rounded-md px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      );
    case 'FAILED':
      return (
        <button
          data-testid="update-dismiss-button"
          onClick={onDismiss}
          className="min-h-[44px] min-w-[44px] rounded-md px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
        >
          Dismiss
        </button>
      );
    default:
      return null;
  }
}
