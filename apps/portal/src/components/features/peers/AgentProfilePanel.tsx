/**
 * Purpose: Agent Profile Slide-In Panel — peer detail with EigenTrust + badges + Trust/Block
 */
'use client';

import { cn } from '@/lib/utils/cn';
import { truncateAgentId } from '@/lib/utils/format';
import { Badge, Button, Icon, ProgressBar, type IconName } from '@/components/ui';
import { PeerAssetsSection } from './PeerAssetsSection';
import { PeerActivitySection } from './PeerActivitySection';
import { AgentRequiredNotice } from '@/components/features/onboarding/AgentRequiredNotice';
import type { Peer, PeerReputation } from '@/lib/types';

interface AgentProfilePanelProps {
  peer: Peer | null;
  open: boolean;
  onClose: () => void;
  onTrust?: (peerId: string) => void;
  onBlock?: (peerId: string) => void;
  reputation?: PeerReputation;
  /** The reputation fetch failed; the skeleton gives way to a line. */
  reputationFailed?: boolean;
  /** Trust and Block are recorded by the agent; false swaps the buttons for the notice. */
  agentConnected?: boolean;
}

export function AgentProfilePanel({
  peer,
  open,
  onClose,
  onTrust,
  onBlock,
  reputation,
  reputationFailed = false,
  agentConnected = true,
}: AgentProfilePanelProps) {
  if (!peer) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[300] bg-black/50 transition-opacity duration-250',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 bottom-0 z-[301] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          'w-full md:w-[400px] bg-bg-secondary border-l border-border-default',
          'transition-transform duration-250 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-label="Agent Profile"
        data-testid="agent-profile-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border-default shrink-0">
          <h3 className="text-base font-bold text-text-primary">Agent Profile</h3>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-[44px] h-[44px] bg-transparent border-none text-text-secondary cursor-pointer rounded hover:bg-bg-tertiary"
            aria-label="Close profile"
            data-testid="agent-profile-close"
          >
            <Icon name="x" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {/* Identity */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-green/12 text-accent-green">
              <Icon name="user" />
            </div>
            <div>
              <div className="text-sm font-bold text-text-primary">{peer.displayName}</div>
              <div className="text-[11px] text-text-tertiary font-mono" title={peer.agentId}>
                {truncateAgentId(peer.agentId)}
              </div>
            </div>
          </div>

          {/* Status + Location */}
          <div className="flex items-center gap-2 mb-4">
            <Badge variant={peer.status === 'online' || peer.status === 'seeding' ? 'online' : 'offline'} dot>
              {peer.status}
            </Badge>
            <span className="text-xs text-text-secondary">{peer.country}</span>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="text-center p-3 rounded bg-bg-tertiary">
              <div className="text-lg font-bold text-accent-green font-mono">
                {reputation ? reputation.clout : peer.reputation.toFixed(1)}
              </div>
              <div className="text-[11px] text-text-tertiary">Clout Score</div>
            </div>
            <div className="text-center p-3 rounded bg-bg-tertiary">
              <div className="flex items-center justify-center gap-1">
                <div className="text-lg font-bold text-text-primary capitalize">{reputation ? reputation.rank : peer.rank}</div>
                {reputation?.trend != null && (
                  <span
                    className={cn('text-xs font-mono', reputation.trend >= 0 ? 'text-accent-green' : 'text-accent-red')}
                    data-testid="reputation-trend"
                  >
                    {reputation.trend >= 0 ? '+' : ''}
                    {reputation.trend.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-[11px] text-text-tertiary">Rank</div>
            </div>
          </div>

          {/* Weekly Bonus */}
          {reputation && reputation.weeklyBonus > 0 && (
            <div className="mb-4 px-3 py-2 rounded bg-accent-green/8 border border-accent-green/20 text-xs text-accent-green">
              +{reputation.weeklyBonus} credits/week bonus
            </div>
          )}

          {/* EigenTrust Factors */}
          {reputation ? (
            <div className="mb-5">
              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-3">EigenTrust Factors</h4>
              <div className="flex flex-col gap-3">
                {reputation.factors.map(f => (
                  <ProgressBar key={f.name} value={f.value} max={10} color={f.color} label={f.name} showValue />
                ))}
              </div>
            </div>
          ) : reputationFailed ? (
            <div data-testid="reputation-failed" className="mb-5">
              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-3">EigenTrust Factors</h4>
              <p className="text-xs text-text-tertiary">Couldn&apos;t load reputation.</p>
            </div>
          ) : (
            <div data-testid="reputation-loading" className="mb-5">
              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-3">EigenTrust Factors</h4>
              <div className="flex flex-col gap-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-6 rounded bg-bg-tertiary animate-pulse" />
                ))}
              </div>
            </div>
          )}

          {/* Badges */}
          {reputation && reputation.badges.length > 0 && (
            <div className="mb-5" data-testid="badges-section">
              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-3">Badges</h4>
              <div className="flex flex-wrap gap-2">
                {reputation.badges.map(b => (
                  <div
                    key={b.id}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border',
                      b.status === 'earned' && 'bg-accent-green/10 border-accent-green/30 text-accent-green',
                      b.status === 'rare' && 'bg-accent-purple/10 border-accent-purple/30 text-accent-purple',
                      b.status === 'locked' && 'bg-bg-tertiary border-border-default text-text-tertiary opacity-60',
                    )}
                  >
                    <Icon name={b.icon as IconName} size="sm" />
                    <span>{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shared Assets */}
          <PeerAssetsSection peerId={peer.id} />

          {/* Activity Timeline */}
          <PeerActivitySection peerId={peer.id} />

          {/* Token Info (conditional) */}
          {peer.tokenTicker && (
            <div className="mb-5 p-3 rounded bg-bg-tertiary border border-border-default">
              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-2">Token</h4>
              <div className="text-sm font-bold text-accent-green">{peer.tokenTicker}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 border-t border-border-default shrink-0">
          {!agentConnected && <AgentRequiredNotice className="flex-1" data-testid="agent-profile-agent-required" />}
          {agentConnected && (
            <>
              <Button
                variant="primary"
                size="sm"
                icon="check-circle"
                onClick={() => onTrust?.(peer.id)}
                data-testid="agent-profile-trust"
                className="flex-1"
              >
                Trust
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon="slash"
                onClick={() => onBlock?.(peer.id)}
                data-testid="agent-profile-block"
                className="flex-1"
              >
                Block
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
