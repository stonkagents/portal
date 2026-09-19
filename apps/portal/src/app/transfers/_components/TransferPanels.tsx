/**
 * Purpose: Transfer tab panels — Library with real storage data, History with real daemon records
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon, Button, ProgressBar, EmptyState } from '@/components/ui';
import { useLibrary, useTransferHistory } from '@/lib/api/hooks/use-transfers';
import { formatBytesShort } from '@/lib/api/transformers';
import type { DaemonHistoryRecord, DaemonLibraryFile } from '@/lib/types/backend';

const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

export function LibraryPanel() {
  const { data } = useLibrary();
  const files = data?.files ?? [];
  const storage = data?.storage ?? { used_bytes: 0, file_count: 0 };
  const usedPercent = STORAGE_LIMIT_BYTES > 0 ? Math.round((storage.used_bytes / STORAGE_LIMIT_BYTES) * 100) : 0;

  return (
    <div data-testid="library-panel">
      <h3 className="text-sm font-semibold text-accent-green mb-3">Local Library</h3>
      <p className="text-xs text-text-secondary mb-4">Assets you are sharing with the swarm.</p>
      <div className="bg-bg-secondary border border-border-default rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-text-secondary">Storage Used</span>
          <span className="text-text-primary font-mono">
            {formatBytesShort(storage.used_bytes)} of {formatBytesShort(STORAGE_LIMIT_BYTES)}
          </span>
        </div>
        <ProgressBar value={usedPercent} color="green" />
      </div>
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 opacity-25">
            <Icon name="folder" size="xl" />
          </div>
          <h3 className="text-base font-bold text-text-primary mb-1">No assets in your library</h3>
          <p className="text-xs text-text-secondary mb-4">Share skills, prompts, and memories with the network.</p>
          <Link href="/gallery">
            <Button variant="primary" icon="sparkles">
              Browse Knowledge Hub
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {files.map((f: DaemonLibraryFile) => (
            <div
              key={f.cid}
              className="bg-bg-secondary border border-border-default rounded-lg p-3 flex items-center justify-between hover:border-border-accent/30 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="file" size="sm" className="text-text-tertiary shrink-0" />
                <span className="text-sm font-semibold text-text-primary truncate" title={f.filename}>
                  {f.filename}
                </span>
                <span className="text-[11px] text-text-tertiary shrink-0">{f.file_type}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-[11px] text-text-secondary">
                <span>{formatBytesShort(f.size)}</span>
                <span>
                  {f.leechers} leecher{f.leechers !== 1 ? 's' : ''}
                </span>
                <span>&uarr; {formatBytesShort(f.total_uploaded)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const HISTORY_PAGE_SIZE = 50;

export function HistoryPanel() {
  const [limit, setLimit] = useState(HISTORY_PAGE_SIZE);
  const { data } = useTransferHistory(limit);
  const records = data?.records ?? [];
  const hasMore = data != null && data.total > records.length;

  return (
    <div data-testid="history-panel">
      <h3 className="text-sm font-semibold text-accent-green mb-3">Transfer History</h3>
      {records.length === 0 ? (
        <EmptyState
          icon="clock"
          title="No transfer history yet."
          description="Completed transfers will appear here."
          data-testid="history-empty"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((r: DaemonHistoryRecord) => (
            <div key={r.id} className="bg-bg-secondary border border-border-default rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs font-bold ${r.direction === 'upload' ? 'text-accent-green' : 'text-accent-blue'}`}>
                  {r.direction === 'upload' ? '\u2191' : '\u2193'}
                </span>
                <span className="text-sm font-semibold text-text-primary truncate" title={r.filename}>
                  {r.filename}
                </span>
                <span className="text-[11px] text-text-tertiary">{formatBytesShort(r.total_size)}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {r.state === 'failed' && r.error_message && (
                  <span className="text-[11px] text-accent-red truncate max-w-[200px]" title={r.error_message}>
                    {r.error_message}
                  </span>
                )}
                <span className={`text-[11px] font-semibold ${r.state === 'completed' ? 'text-accent-green' : 'text-accent-red'}`}>
                  {r.state}
                </span>
                <span className="text-[11px] text-text-tertiary">
                  {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : '-'}
                </span>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="flex flex-col items-center gap-1 py-2">
              <p className="text-xs text-text-tertiary">
                Showing {records.length} of {data.total} records
              </p>
              <Button
                variant="ghost"
                size="sm"
                data-testid="history-load-more"
                onClick={() => setLimit(prev => prev + HISTORY_PAGE_SIZE)}
              >
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
