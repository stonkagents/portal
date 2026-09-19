/**
 * Purpose: Transfer page sections — completed and failed transfers from real daemon data
 */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, Button } from '@/components/ui';
import { formatBytesShort } from '@/lib/api/transformers';
import type { Transfer } from '@/lib/types';

/** Convert raw daemon error messages to user-friendly text. */
function friendlyError(raw: string): string {
  if (raw.includes('all dials failed') || raw.includes('dial backoff') || raw.includes('connection to')) {
    return 'Could not connect to the seeder. They may be offline or behind a firewall. Try again later.';
  }
  if (raw.includes('chunk download failed') && raw.includes('chunks incomplete')) {
    return 'Download failed: unable to retrieve all file pieces from available peers.';
  }
  if (raw.includes('no peers found') || raw.includes('peer discovery failed')) {
    return 'No peers found seeding this file. The uploader may be offline.';
  }
  if (raw.includes('context deadline exceeded') || raw.includes('timeout')) {
    return 'Download timed out: the connection was too slow or the peer stopped responding.';
  }
  if (raw.includes('CID mismatch') || raw.includes('verification failed')) {
    return 'File integrity check failed: the downloaded data did not match the expected content.';
  }
  if (raw.includes('tracker') && raw.includes('failed')) {
    return 'Could not reach the tracker to find peers. Check your internet connection.';
  }
  // Fallback: truncate overly long technical messages
  if (raw.length > 120) {
    return raw.slice(0, 117) + '...';
  }
  return raw;
}

interface TransferSectionsProps {
  activeTab: string;
  showCards: boolean;
  completedTransfers: Transfer[];
  failedTransfers: Transfer[];
  onRetry?: (cid: string) => void;
}

export function TransferSections({
  activeTab,
  showCards,
  completedTransfers,
  failedTransfers,
  onRetry,
}: TransferSectionsProps) {
  const [failedExpanded, setFailedExpanded] = useState(false);

  return (
    <>
      {/* Completed Transfers */}
      {(activeTab === 'all' || activeTab === 'completed') && showCards && (
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wide shrink-0">Completed</span>
            <div className="flex-1 h-px bg-border-default" />
          </div>
          <div className="flex flex-col gap-2" data-testid="completed-transfers">
            {completedTransfers.length === 0 && (
              <div className="text-center py-4 text-text-tertiary text-xs">No completed transfers</div>
            )}
            {completedTransfers.map(t => (
              <div
                key={t.id}
                className="bg-bg-secondary border border-border-default rounded-lg p-3 opacity-70 hover:opacity-100 transition-opacity flex items-center justify-between gap-2 flex-wrap"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn('text-xs font-bold', t.direction === 'upload' ? 'text-accent-green' : 'text-accent-blue')}>
                    {t.direction === 'upload' ? '\u2191' : '\u2193'}
                  </span>
                  <span className="text-sm font-semibold text-text-primary truncate" title={t.assetName}>
                    {t.assetName}
                  </span>
                  <span className="text-[11px] text-text-tertiary">{formatBytesShort(t.size)}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {t.completedAt && (
                    <span className="text-[11px] text-text-tertiary">
                      Completed{' '}
                      {new Date(t.completedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Failed Transfers */}
      {(activeTab === 'all' || activeTab === 'failed') && showCards && failedTransfers.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setFailedExpanded(e => !e)}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide bg-transparent border-none cursor-pointer min-h-[44px] px-0"
            data-testid="failed-toggle"
            aria-expanded={failedExpanded}
          >
            <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded border text-accent-red bg-accent-red/12 border-accent-red/30">
              Failed
            </span>
            <span className="text-text-secondary">{failedTransfers.length} failed transfers</span>
            <Icon
              name="chevron-down"
              size="sm"
              className={cn('transition-transform text-text-tertiary', failedExpanded && 'rotate-180')}
            />
          </button>
          {failedExpanded && (
            <div className="flex flex-col gap-2 mt-2" data-testid="failed-transfers">
              {failedTransfers.map(t => (
                <div key={t.id} className="bg-bg-secondary border border-accent-red/20 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-text-primary">{t.assetName}</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded border text-accent-red bg-accent-red/12 border-accent-red/30">
                      Failed
                    </span>
                  </div>
                  {t.errorMessage && <p className="text-xs text-accent-red mb-2">{friendlyError(t.errorMessage)}</p>}
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden opacity-50">
                        <div className="h-full rounded-full bg-accent-red" style={{ width: `${t.progress}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-accent-red opacity-50">{t.progress}%</span>
                    {onRetry && (
                      <Button variant="ghost" size="sm" data-testid={`failed-retry-${t.id}`} onClick={() => onRetry(t.id)}>
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
