/**
 * Node Hero Card — local node status with green top border, status, metrics grid, health
 *   7-metric grid (2→4→7 cols), health indicators (NAT, DHT, mDNS, Relay)
 */
'use client';

import { cn } from '@/lib/utils/cn';

interface NodeHealth {
  nat: string;
  dht: string;
  mdns: string;
  relay: string;
}

interface NodeHeroCardProps {
  peerId: string;
  /** The owner's display name (Settings > Identity); shown beside the id when set. */
  displayName?: string | null;
  uploadSpeed: number;
  downloadSpeed: number;
  connectedPeers: number;
  shareRatio: number;
  reputation: number;
  uptime: string;
  totalShared: string;
  health: NodeHealth;
  connected?: boolean;
  onToggleConnection?: () => void;
  className?: string;
}

export function NodeHeroCard({
  peerId,
  displayName,
  uploadSpeed,
  downloadSpeed,
  connectedPeers,
  shareRatio,
  reputation,
  uptime,
  totalShared,
  health,
  connected = true,
  onToggleConnection,
  className,
}: NodeHeroCardProps) {
  return (
    <div
      className={cn('relative bg-bg-secondary border border-border-default rounded-lg p-4 mb-4 overflow-hidden', className)}
      data-testid="node-hero"
    >
      {/* Top green/red border — .node-hero::before */}
      <div
        className={cn(
          'absolute top-0 left-0 right-0 h-[3px]',
          connected ? 'bg-accent-green shadow-[0_0_10px_rgba(0,255,65,0.3)]' : 'bg-accent-red shadow-[0_0_10px_rgba(255,68,68,0.3)]',
        )}
      />

      {/* Top row: status + disconnect/connect button — .node-hero__top */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="flex items-center gap-2">
          {/* Pulsing dot — .node-hero__dot */}
          <span
            className={cn(
              'w-2.5 h-2.5 rounded-full shrink-0',
              connected && 'animate-pulse',
              connected
                ? 'bg-accent-green shadow-[0_0_8px_var(--color-accent-green)]'
                : 'bg-accent-red shadow-[0_0_8px_var(--color-accent-red)]',
            )}
          />
          {/* Status text — .node-hero__status-text (sm, 700, uppercase, tracking) */}
          <span className={cn('text-sm font-bold uppercase tracking-wide', connected ? 'text-accent-green' : 'text-accent-red')}>
            {connected ? 'Connected to the Network' : 'Disconnected'}
          </span>
        </div>

        {/* Action button — .node-hero__action-btn (border style, not filled) */}
        {connected ? (
          <button
            onClick={onToggleConnection}
            className="inline-flex items-center gap-1 px-3 min-h-[44px] text-xs font-semibold font-mono border rounded bg-transparent cursor-pointer transition-colors duration-150 border-accent-red text-accent-red hover:bg-accent-red/12"
            data-testid="hero-disconnect"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onToggleConnection}
            className="inline-flex items-center gap-1 px-3 min-h-[44px] text-xs font-semibold font-mono border rounded bg-transparent cursor-pointer transition-colors duration-150 border-accent-green text-accent-green hover:bg-accent-green/8"
            data-testid="hero-reconnect"
          >
            Reconnect
          </button>
        )}
      </div>

      {/* Display name (when set) + Agent ID: .node-hero__peer-id */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-text-secondary font-mono mb-3">
        {displayName && (
          <span className="font-sans text-sm font-bold text-text-primary" data-testid="node-hero-display-name">
            {displayName}
          </span>
        )}
        <span>
          Agent ID: <code className="text-text-primary bg-bg-tertiary px-1 py-0.5 rounded">{peerId}</code>
        </span>
      </div>

      {/* Metrics Grid — .node-hero__grid (2→4→7 cols) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* ↑ Share MB/s — green */}
        <div className="text-center">
          <div className="text-lg font-bold text-accent-green leading-tight">↑ {uploadSpeed}</div>
          <div className="text-xs text-text-secondary uppercase tracking-wide mt-0.5">Share MB/s</div>
        </div>
        {/* ↓ Install MB/s — blue */}
        <div className="text-center">
          <div className="text-lg font-bold text-accent-blue leading-tight">↓ {downloadSpeed}</div>
          <div className="text-xs text-text-secondary uppercase tracking-wide mt-0.5">Install MB/s</div>
        </div>
        {/* Peers */}
        <div className="text-center">
          <div className="text-lg font-bold text-text-primary leading-tight">{connectedPeers}</div>
          <div className="text-xs text-text-secondary uppercase tracking-wide mt-0.5">Peers</div>
        </div>
        {/* Ratio */}
        <div className="text-center">
          <div className="text-lg font-bold text-text-primary leading-tight">{shareRatio.toFixed(2)}</div>
          <div className="text-xs text-text-secondary uppercase tracking-wide mt-0.5">Ratio</div>
        </div>
        {/* Reputation — green */}
        <div className="text-center">
          <div className="text-lg font-bold text-accent-green leading-tight">{reputation.toFixed(1)}</div>
          <div className="text-xs text-text-secondary uppercase tracking-wide mt-0.5">Reputation</div>
        </div>
        {/* Uptime */}
        <div className="text-center">
          <div className="text-lg font-bold text-text-primary leading-tight">{uptime}</div>
          <div className="text-xs text-text-secondary uppercase tracking-wide mt-0.5">Uptime</div>
        </div>
        {/* Shared */}
        <div className="text-center">
          <div className="text-lg font-bold text-text-primary leading-tight">{totalShared}</div>
          <div className="text-xs text-text-secondary uppercase tracking-wide mt-0.5">Shared</div>
        </div>
      </div>

      {/* Health indicators — .node-hero__health */}
      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border-default">
        <span className="flex items-center gap-1 text-xs text-text-secondary">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', health.nat === 'Open' ? 'bg-accent-green' : 'bg-accent-red')} />
          NAT: {health.nat}
        </span>
        <span className="flex items-center gap-1 text-xs text-text-secondary">
          <span
            className={cn('w-1.5 h-1.5 rounded-full shrink-0', health.dht.includes('Healthy') ? 'bg-accent-green' : 'bg-accent-red')}
          />
          DHT: {health.dht}
        </span>
        <span className="flex items-center gap-1 text-xs text-text-secondary">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', health.mdns === 'Active' ? 'bg-accent-green' : 'bg-accent-red')} />
          mDNS: {health.mdns}
        </span>
        <span className="flex items-center gap-1 text-xs text-text-secondary">
          <span
            className={cn('w-1.5 h-1.5 rounded-full shrink-0', health.relay === 'Not needed' ? 'bg-accent-green' : 'bg-accent-yellow')}
          />
          Relay: {health.relay}
        </span>
      </div>
    </div>
  );
}
