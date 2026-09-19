/**
 * Purpose: Loading skeleton and error states for the profile page.
 *          Extracted from page.tsx to stay under 200-line component limit.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { mapErrorToUserMessage } from '@/lib/api/error-mapper';
import { OfflineState } from '@/app/chat/_components/offline-state';

interface ProfileErrorProps {
  onRetry: () => void;
  error?: unknown;
  /** Daemon reachability. The profile is proxied through the daemon, so an unreachable daemon is a setup problem, not a network one. */
  daemonConnected?: boolean;
}

/** `fetch` rejects with a TypeError when nothing answers on localhost:7841 — that is the daemon, not the user's internet. */
function isDaemonUnreachable(error: unknown, daemonConnected: boolean | undefined): boolean {
  return daemonConnected === false || error instanceof TypeError;
}

/** animation-tier: 2 — functional: profile skeleton loading placeholder.
 *  `retrying`: the first fetch failed and a retry is in flight — the pulse stops and a line says so. */
export function ProfileSkeleton({ retrying = false }: { retrying?: boolean }) {
  return (
    <div className={retrying ? 'space-y-6 p-6' : 'animate-pulse space-y-6 p-6'} data-testid="profile-loading">
      {retrying && (
        <p className="text-xs text-text-tertiary" data-testid="profile-loading-retrying">
          Still trying to reach your agent.
        </p>
      )}
      {/* Profile card skeleton */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-bg-tertiary" />
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-bg-tertiary" />
          <div className="h-3 w-20 rounded bg-bg-tertiary" />
        </div>
      </div>
      {/* Stats grid skeleton — matches page.tsx grid: 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 rounded-lg bg-bg-tertiary" />
        ))}
      </div>
      {/* Content area skeleton — matches page.tsx 2-col layout on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="h-48 rounded-lg bg-bg-tertiary" />
          <div className="h-32 rounded-lg bg-bg-tertiary" />
        </div>
        <div className="h-64 rounded-lg bg-bg-tertiary" />
      </div>
    </div>
  );
}

/** animation-tier: 2 — functional: profile error with retry action */
export function ProfileError({ onRetry, error, daemonConnected }: ProfileErrorProps) {
  if (isDaemonUnreachable(error, daemonConnected)) {
    return (
      <div className="flex-1 min-h-[400px]" data-testid="profile-offline">
        <OfflineState onConnect={onRetry} />
      </div>
    );
  }

  const msg = error ? mapErrorToUserMessage(error, 'profile') : null;

  return (
    <div className="flex items-center justify-center min-h-[400px]" data-testid="profile-error">
      <div className="text-center">
        <Icon name="alert-triangle" className="text-accent-red mx-auto mb-3" />
        <p className="text-sm font-semibold text-text-primary mb-1" data-testid="profile-error-title">
          {msg?.title ?? 'Failed to load profile'}
        </p>
        <p className="text-sm text-text-secondary mb-3" data-testid="profile-error-description">
          {msg?.description ?? 'Something went wrong. Please try again.'}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="min-h-[44px] min-w-[44px]"
          onClick={onRetry}
          data-testid="profile-retry-button"
        >
          Retry
        </Button>
      </div>
    </div>
  );
}
