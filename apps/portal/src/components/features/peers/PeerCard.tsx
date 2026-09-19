/**
 * Purpose: Peer Card — connected agent with transfers, speeds, ratio, trust/block actions
 */
'use client';

import { cn } from '@/lib/utils/cn';
import { truncateAgentId } from '@/lib/utils/format';
import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';

interface PeerTransfer {
  direction: 'up' | 'down';
  name: string;
  speed: number;
}

interface PeerCardProps {
  displayName: string;
  agentId: string;
  connectionType: 'direct' | 'relayed' | 'mdns';
  country: string;
  latency: number;
  reputation: number;
  bandwidthUp: number;
  bandwidthDown: number;
  transfers: PeerTransfer[];
  trusted?: boolean;
  onClick?: () => void;
  onTrust?: () => void;
  onBlock?: () => void;
  className?: string;
}

const connStyles: Record<string, { icon: IconName; label: string; border: string; bg: string; text: string }> = {
  direct: { icon: 'zap', label: 'Direct', border: 'border-accent-green/30', bg: 'bg-accent-green/8', text: 'text-accent-green' },
  relayed: {
    icon: 'shuffle',
    label: 'Relayed',
    border: 'border-accent-yellow/20',
    bg: 'bg-accent-yellow/8',
    text: 'text-accent-yellow',
  },
  mdns: { icon: 'wifi', label: 'Local', border: 'border-accent-purple/30', bg: 'bg-accent-purple/8', text: 'text-accent-purple' },
};

function latencyClass(ms: number) {
  if (ms < 100) return 'text-accent-green';
  if (ms < 300) return 'text-accent-yellow';
  return 'text-accent-red';
}

function reputationClass(rep: number) {
  if (rep >= 7) return { bg: 'bg-accent-green/8', text: 'text-accent-green', border: 'border-accent-green/30' };
  if (rep >= 4) return { bg: 'bg-accent-yellow/8', text: 'text-accent-yellow', border: 'border-accent-yellow/20' };
  return { bg: 'bg-accent-red/12', text: 'text-accent-red', border: 'border-[rgba(255,68,68,0.3)]' };
}

export function PeerCard({
  displayName,
  agentId,
  connectionType,
  country,
  latency,
  reputation,
  bandwidthUp,
  bandwidthDown,
  transfers,
  trusted,
  onClick,
  onTrust,
  onBlock,
  className,
}: PeerCardProps) {
  const ratio = bandwidthDown > 0 ? (bandwidthUp / bandwidthDown).toFixed(2) : '∞';
  const conn = connStyles[connectionType] ?? connStyles.direct;
  const repStyles = reputationClass(reputation);

  return (
    <div
      className={cn(
        'bg-bg-secondary border border-border-default rounded-lg p-4 mb-3',
        'transition-colors hover:border-[rgba(0,255,65,0.3)] cursor-pointer',
        className,
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
      data-testid={`peer-card-${displayName}`}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-base font-bold text-text-primary">{displayName}</span>
        <span className="text-xs font-mono text-text-tertiary" title={agentId}>
          {truncateAgentId(agentId)}
        </span>
        {trusted && (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded border border-accent-green/30 bg-accent-green/8 text-accent-green"
            data-testid="peer-trusted-badge"
          >
            <Icon name="shield" size="sm" /> Trusted
          </span>
        )}
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wide border',
            conn.bg,
            conn.text,
            conn.border,
          )}
        >
          <Icon name={conn.icon} size="sm" /> {conn.label}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs text-text-secondary mb-3">
        <span className="flex items-center gap-1">
          <Icon name="map-pin" size="sm" /> {country}
        </span>
        <span className="text-text-tertiary">|</span>
        <span className={latencyClass(latency)}>{latency}ms</span>
      </div>

      {transfers.length > 0 && (
        <div className="px-3 py-2 bg-bg-tertiary rounded mb-3 text-xs text-text-secondary">
          <div className="font-semibold text-text-primary uppercase tracking-wide text-xs mb-1">Active Transfers</div>
          {transfers.map(t => (
            <div key={t.name} className="flex items-center gap-2 py-0.5">
              <span className={cn('font-bold min-w-[14px]', t.direction === 'up' ? 'text-accent-green' : 'text-accent-blue')}>
                {t.direction === 'up' ? '↑' : '↓'}
              </span>
              <span className="truncate">{t.name}</span>
              <span className={cn('ml-auto shrink-0 font-mono', t.direction === 'up' ? 'text-accent-green' : 'text-accent-blue')}>
                {t.speed} MB/s
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-4 flex-wrap">
          <span className="text-xs text-text-secondary">
            ↑ <span className="font-bold text-accent-green">{bandwidthUp} MB/s</span>
          </span>
          <span className="text-xs text-text-secondary">
            ↓ <span className="font-bold text-accent-blue">{bandwidthDown} MB/s</span>
          </span>
          <span className="text-xs text-text-secondary">
            Ratio: <span className={cn('font-bold', parseFloat(ratio) >= 1 ? 'text-text-primary' : 'text-accent-red')}>{ratio}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onTrust && (
            <button
              onClick={e => {
                e.stopPropagation();
                onTrust();
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded border border-accent-green/30 text-accent-green hover:bg-accent-green/8 transition-colors min-h-[44px]"
              data-testid={`peer-trust-${displayName}`}
            >
              <Icon name="shield" size="sm" /> Trust
            </button>
          )}
          {onBlock && (
            <button
              onClick={e => {
                e.stopPropagation();
                onBlock();
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded border border-accent-red/30 text-accent-red hover:bg-accent-red/8 transition-colors min-h-[44px]"
              data-testid={`peer-block-${displayName}`}
            >
              <Icon name="slash" size="sm" /> Block
            </button>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border',
              repStyles.bg,
              repStyles.text,
              repStyles.border,
            )}
          >
            ★ {reputation.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  );
}
