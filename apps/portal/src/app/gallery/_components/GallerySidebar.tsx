/**
 * Purpose: Gallery sidebar — Your Agent card, transfer summary (from agent stats), quick actions
 */
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { agentLabel } from '@/lib/agent-name';
import { Icon, Button, Badge } from '@/components/ui';
import { useDaemon } from '@/providers/DaemonProvider';
import { useTransferStats } from '@/lib/api/hooks/use-transfers';
import { usePeerReputation } from '@/lib/api/hooks/use-peers';
import { useAgentIdentity } from '@/lib/api/hooks/use-agent-identity';
import { AgentRequiredNotice, useAgentRequired } from '@/components/features/onboarding/AgentRequiredNotice';

interface GallerySidebarProps {
  onSearchOpen: () => void;
  onShareOpen: () => void;
}

export function GallerySidebar({ onSearchOpen, onShareOpen }: GallerySidebarProps) {
  const { connected, health } = useDaemon();
  /* Sharing uploads through the agent: the button is disabled offline with the notice under it. */
  const { title: agentTitle } = useAgentRequired();
  const { data: stats } = useTransferStats();
  const { data: repData } = usePeerReputation(health?.peerId ?? '');
  const { data: identity } = useAgentIdentity();

  const peerId = connected ? agentLabel(identity?.displayName, health?.peerId) : 'Agent offline';
  const isOnline = connected;

  return (
    <aside className="w-full border-t border-border-default md:w-[300px] md:shrink-0 md:border-t-0 md:border-l p-4 flex flex-col gap-4">
      {/* Your Agent card */}
      <div className="bg-bg-secondary border border-border-default rounded-lg p-3" data-testid="your-agent-card">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2 flex items-center gap-2">
          <Icon name="user" size="sm" className="text-accent-green" /> Your Agent
        </h4>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-semibold text-accent-green truncate min-w-0">{peerId}</span>
          <span className="shrink-0">
            <Badge variant={isOnline ? 'online' : 'offline'} dot>
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </span>
        </div>
        <div className="flex gap-3">
          <div className="flex-1 text-center p-2 bg-bg-tertiary rounded">
            <div className="text-xl font-bold text-text-primary font-mono leading-tight">
              {(connected && stats?.shareRatio != null ? stats.shareRatio : 0).toFixed(2)}
            </div>
            <div className="text-[11px] text-text-tertiary uppercase tracking-wide mt-0.5">Share Ratio</div>
          </div>
          <div className="flex-1 text-center p-2 bg-bg-tertiary rounded">
            <div className="text-xl font-bold text-accent-green font-mono leading-tight">
              {((repData?.clout ?? 0) / 10).toFixed(1)}
            </div>
            <div className="text-[11px] text-text-tertiary uppercase tracking-wide mt-0.5">Rep Score</div>
          </div>
        </div>
      </div>

      {/* Transfer Summary */}
      <div className="bg-bg-secondary border border-border-default rounded-lg" data-testid="transfer-summary">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide px-3 pt-3 mb-2 flex items-center gap-2">
          <Icon name="arrow-up-down" size="sm" className="text-accent-green" /> Transfers
        </h4>
        {!connected && (
          <div className="px-3 pb-2 text-xs text-text-tertiary" data-testid="daemon-offline-notice">
            Start your agent to see live transfers
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {[
            { label: 'Downloading', count: connected ? (stats?.downloading ?? 0) : 0, dotClass: 'bg-accent-blue' },
            { label: 'Uploading', count: connected ? (stats?.uploading ?? 0) : 0, dotClass: 'bg-accent-green' },
            {
              label: 'Seeding',
              count: connected ? (stats?.seeding ?? 0) : 0,
              dotClass: 'bg-accent-blue shadow-[0_0_6px_var(--color-accent-blue)]',
            },
            {
              label: 'My Library',
              count: connected ? (stats?.library ?? 0) : 0,
              dotClass: 'bg-accent-green shadow-[0_0_6px_var(--color-accent-green)]',
            },
          ].map(row => (
            <Link key={row.label} href="/transfers" className="block">
              <div className="flex items-center justify-between px-3 py-2 text-sm text-text-secondary border-b border-border-default last:border-b-0 hover:bg-accent-green/8 transition-colors min-h-[44px]">
                <span className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full shrink-0', row.dotClass)} />
                  {row.label}
                </span>
                <span className="font-bold text-base text-text-primary">{row.count}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col gap-2" data-testid="quick-actions">
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1 flex items-center gap-2">
          <Icon name="zap" size="sm" className="text-accent-green" /> Quick Actions
        </h4>
        <Button
          variant="primary"
          icon="share-2"
          className="w-full"
          onClick={() => connected && onShareOpen()}
          disabled={!connected}
          title={agentTitle}
          data-testid="share-asset-btn"
        >
          Share Asset
        </Button>
        <AgentRequiredNotice className="justify-center" data-testid="share-asset-agent-required" />
        <Button variant="secondary" icon="search" className="w-full" onClick={onSearchOpen}>
          Search Network
        </Button>
        <Link href="/transfers">
          <Button variant="ghost" icon="arrow-up-down" className="w-full">
            View Transfers
          </Button>
        </Link>
      </div>
    </aside>
  );
}
