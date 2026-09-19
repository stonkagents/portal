/**
 * Purpose: Peer assets sub-section — top shared files with type, size, download count
 */
'use client';

import { Icon, EmptyState } from '@/components/ui';
import { usePeerAssets } from '@/lib/api/hooks/use-peers';

interface PeerAssetsSectionProps {
  peerId: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function PeerAssetsSection({ peerId }: PeerAssetsSectionProps) {
  const { data: assets, isLoading, isError } = usePeerAssets(peerId);

  return (
    <div className="mb-5">
      <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-3">Shared Assets</h4>

      {isLoading && (
        <div data-testid="peer-assets-loading" className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 rounded bg-bg-tertiary animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && isError && !assets && (
        <EmptyState size="sm" title="Couldn't load shared assets." data-testid="peer-assets-failed" />
      )}

      {!isLoading && !isError && (!assets || assets.length === 0) && (
        <EmptyState size="sm" title="No shared assets yet." data-testid="peer-assets-empty" />
      )}

      {!isLoading && assets && assets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {assets.map(asset => (
            <div key={asset.cid} className="flex items-center gap-2 px-3 py-2 rounded bg-bg-tertiary text-xs">
              <Icon name="file" size="sm" className="text-text-tertiary shrink-0" />
              <span className="text-text-primary truncate flex-1">{asset.filename}</span>
              <span className="px-1.5 py-0.5 rounded bg-bg-secondary text-text-tertiary text-[11px] uppercase font-mono shrink-0">
                {asset.file_type}
              </span>
              <span className="text-text-secondary shrink-0">{formatBytes(asset.size_bytes)}</span>
              <span className="flex items-center gap-0.5 text-text-tertiary shrink-0">
                <Icon name="download" size="sm" /> {asset.download_count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
