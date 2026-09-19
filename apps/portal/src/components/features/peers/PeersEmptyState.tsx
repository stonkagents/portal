/**
 * Purpose: Disconnected/empty state for peers page — daemon offline guidance
 */
'use client';

import Link from 'next/link';
import { Icon, Button, useToast } from '@/components/ui';
import { getProfile } from '@/lib/user-profile';
import { config } from '@/config';

/** Host of the configured tracker (config, never a hardcoded guess); falls back to the local dev port. */
function trackerHost(): string {
  const raw = config.api.trackerUrl;
  if (!raw) return 'localhost:7842';
  try {
    return new URL(raw).host;
  } catch {
    return raw;
  }
}

interface PeersEmptyStateProps {
  onStartDaemon: () => void;
}

export function PeersEmptyState({ onStartDaemon }: PeersEmptyStateProps) {
  const { addToast } = useToast();

  const handleStartDaemon = () => {
    const installed = getProfile()?.hasInstalledDaemon === true;
    if (!installed) {
      addToast({
        title: "Your agent isn't installed yet.",
        description: 'Install it to join the network.',
        variant: 'warning',
        autoDismiss: true,
      });
      return;
    }
    onStartDaemon();
  };
  return (
    <div className="bg-bg-secondary border border-border-default rounded-lg p-8" data-testid="peers-empty-state">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="mb-4 opacity-25">
          <Icon name="wifi-off" size="xl" />
        </div>
        <h3 className="text-lg font-bold text-text-primary mb-2">Your agent is offline.</h3>
        <p className="text-sm text-text-secondary max-w-md mb-4">Start it to discover and connect with agents on the network.</p>
        <ul className="text-xs text-text-tertiary text-left max-w-sm mb-6 space-y-2">
          <li className="flex items-start gap-2">
            <Icon name="terminal" size="sm" className="shrink-0 mt-0.5" /> Ensure port{' '}
            <code className="text-text-secondary">7841</code> is open and not blocked
          </li>
          <li className="flex items-start gap-2">
            <Icon name="globe" size="sm" className="shrink-0 mt-0.5" /> If behind NAT, enable UPnP or forward the port manually
          </li>
          <li className="flex items-start gap-2">
            <Icon name="file-text" size="sm" className="shrink-0 mt-0.5" /> Check your agent&apos;s logs at{' '}
            <code className="text-text-secondary">{`${config.paths.agentHome}/data/logs/daemon.log`}</code>
          </li>
          <li className="flex items-start gap-2">
            <Icon name="link" size="sm" className="shrink-0 mt-0.5" /> Verify tracker URL:{' '}
            <code className="text-text-secondary" data-testid="peers-tracker-host">
              {trackerHost()}
            </code>
          </li>
        </ul>
        <div className="flex gap-3">
          <Button type="button" variant="primary" className="cursor-pointer" icon="power" onClick={handleStartDaemon}>
            Start your agent
          </Button>
          <Link href="/">
            <Button type="button" variant="ghost" className="cursor-pointer" icon="book-open">
              Setup Guide
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
