/**
 * Compact list of install/download activity on Knowledge Hub — shares cache with Transfers via useTransfers.
 */
'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useTransfers } from '@/lib/api/hooks/use-transfers';
import { useDaemon } from '@/providers/DaemonProvider';
import { formatBytesShort } from '@/lib/api/transformers';
import { cn } from '@/lib/utils/cn';
import type { Transfer } from '@/lib/types/transfer';

const MAX_ROWS = 5;

function sortDownloads(a: Transfer, b: Transfer): number {
  const pri = (t: Transfer) => {
    if (t.status === 'active' || t.status === 'queued') return 0;
    if (t.status === 'failed') return 2;
    return 1;
  };
  const pa = pri(a);
  const pb = pri(b);
  if (pa !== pb) return pa - pb;
  const ta = new Date(a.completedAt ?? a.startedAt ?? 0).getTime();
  const tb = new Date(b.completedAt ?? b.startedAt ?? 0).getTime();
  return tb - ta;
}

export function GalleryRecentDownloads() {
  const { connected } = useDaemon();
  const { data, isLoading, isError, failureCount } = useTransfers();

  if (!connected) return null;

  const downloads = (data?.transfers ?? [])
    .filter(t => t.direction === 'download')
    .sort(sortDownloads)
    .slice(0, MAX_ROWS);

  if (!isLoading && downloads.length === 0) return null;
  /* The first answer is still pending but at least one attempt failed: say so instead of pulsing. */
  const stalled = isLoading && downloads.length === 0 && (isError || failureCount > 0);

  return (
    <div
      className="rounded-lg border border-border-default bg-bg-secondary p-3 animate-fade-in-up"
      data-testid="gallery-recent-downloads"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-2">
          <Icon name="download" size="sm" className="text-accent-blue" />
          Recent downloads
        </h3>
        <Link href="/transfers" className="text-[11px] text-accent-green hover:underline font-medium">
          View all
        </Link>
      </div>
      {stalled ? (
        <p className="text-xs text-text-tertiary" data-testid="gallery-recent-downloads-stalled">
          Couldn&apos;t load recent downloads. Retrying.
        </p>
      ) : isLoading && downloads.length === 0 ? (
        <div className="h-16 rounded bg-bg-tertiary animate-pulse" data-testid="gallery-recent-downloads-loading" />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {downloads.map(t => (
            <li
              key={`${t.id}-${t.status}`}
              className="flex items-center justify-between gap-2 text-xs min-h-[36px] rounded px-2 py-1.5 bg-bg-tertiary/80 border border-border-default/60"
            >
              <span className="font-medium text-text-primary truncate min-w-0" title={t.assetName}>
                {t.assetName}
              </span>
              <span className="shrink-0 flex items-center gap-2">
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase',
                    t.status === 'active' || t.status === 'queued'
                      ? 'text-accent-blue'
                      : t.status === 'failed'
                        ? 'text-accent-red'
                        : 'text-text-tertiary',
                  )}
                >
                  {t.status === 'active' || t.status === 'queued' ? `${t.progress}%` : t.status === 'failed' ? 'Failed' : 'Done'}
                </span>
                <span className="text-text-tertiary font-mono">{formatBytesShort(t.size)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
