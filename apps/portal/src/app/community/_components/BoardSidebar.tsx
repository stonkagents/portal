/**
 * Purpose: Sidebar widgets for Community board — top seeders, live stats, rules
 */
'use client';

import { Icon, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { AgentName } from '@/lib/agent-name';
import { useBoardStats } from '@/lib/api/hooks/use-board-stats';
import { useTopSeeders } from '@/lib/api/hooks/use-top-seeders';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function BoardSidebar() {
  const statsQuery = useBoardStats();
  const seedersQuery = useTopSeeders();
  const { data: stats } = statsQuery;
  const { data: seeders } = seedersQuery;
  /* A skeleton only while the first attempt is in flight; a failure (or a retry after one) shows a line instead. */
  const statsFailed = statsQuery.isError || (statsQuery.isLoading && statsQuery.failureCount > 0);
  const seedersFailed = seedersQuery.isError || (seedersQuery.isLoading && seedersQuery.failureCount > 0);
  const statsLoading = statsQuery.isLoading && !statsFailed;
  const seedersLoading = seedersQuery.isLoading && !seedersFailed;

  return (
    <div className="w-full md:w-[300px] md:shrink-0 flex flex-col gap-4 md:sticky md:top-[72px] md:self-start">
      {/* Top Seeders */}
      <div className="glass bg-bg-secondary rounded-lg p-4" data-testid="top-agents">
        <h3 className="text-sm font-bold text-accent-green uppercase tracking-wide mb-3 flex items-center gap-2">
          <Icon name="crown" size="sm" /> Top Seeders
        </h3>
        {seedersLoading && (
          <div className="space-y-2" data-testid="top-agents-loading">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-6 bg-bg-tertiary rounded animate-pulse" />
            ))}
          </div>
        )}
        {seedersFailed && !seeders && <EmptyState size="sm" title="Couldn't load top seeders." data-testid="top-agents-failed" />}
        {!seedersLoading && !seedersFailed && seeders && seeders.length === 0 && (
          <EmptyState size="sm" title="No top seeders yet." data-testid="top-agents-empty" />
        )}
        {!seedersLoading &&
          seeders &&
          seeders.length > 0 &&
          seeders.map(seeder => (
            <div
              key={seeder.rank}
              className="flex items-center gap-2 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
            >
              <span className="text-text-tertiary font-bold w-5">{seeder.rank}.</span>
              <AgentName
                displayName={seeder.display_name}
                peerId={seeder.masked_peer_id}
                className={cn('flex-1 text-text-primary truncate', seeder.display_name?.trim() ? '' : 'font-mono')}
                data-testid={`top-seeder-${seeder.rank}`}
              />
              <span className="text-accent-green font-semibold">{formatBytes(seeder.total_upload_bytes ?? 0)}</span>
            </div>
          ))}
        {!seedersLoading && !seedersFailed && (!seeders || seeders.length === 0) && (
          <p className="text-xs text-text-tertiary">No seeders yet</p>
        )}
      </div>

      {/* Network Stats */}
      <div className="glass bg-bg-secondary rounded-lg p-4" data-testid="network-stats-widget">
        <h3 className="text-sm font-bold text-accent-green uppercase tracking-wide mb-3 flex items-center gap-2">
          <Icon name="activity" size="sm" /> Network Stats
        </h3>
        {statsLoading && (
          <div className="space-y-2" data-testid="network-stats-loading">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-5 bg-bg-tertiary rounded animate-pulse" />
            ))}
          </div>
        )}
        {statsFailed && !stats && (
          <p className="text-xs text-text-tertiary" data-testid="network-stats-failed">
            Couldn&apos;t load network stats.
          </p>
        )}
        {!statsLoading &&
          stats &&
          [
            { label: 'Online Peers', value: stats.online_peers.toLocaleString() },
            { label: 'Total Assets', value: stats.total_assets.toLocaleString() },
            { label: 'Total Uploaded', value: formatBytes(stats.total_upload_bytes) },
          ].map(stat => (
            <div key={stat.label} className="flex justify-between py-1 text-xs">
              <span className="text-text-secondary">{stat.label}</span>
              <span className="text-accent-green font-semibold">{stat.value}</span>
            </div>
          ))}
      </div>

      {/* Board Rules */}
      <div className="glass bg-bg-secondary rounded-lg p-4" data-testid="board-rules">
        <h3 className="text-sm font-bold text-accent-green uppercase tracking-wide mb-3 flex items-center gap-2">
          <Icon name="shield" size="sm" /> Board Rules
        </h3>
        <p className="text-xs text-text-tertiary leading-relaxed">
          Only share SafeTensors model weights. No executable code in payloads. Verify CID checksums before referencing. Minimum 2.0
          reputation to post. Be useful to the network.
        </p>
      </div>
    </div>
  );
}
