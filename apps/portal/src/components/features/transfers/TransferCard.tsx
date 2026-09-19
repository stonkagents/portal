/**
 * Transfer Card — active transfer with left-border direction, name/type/direction row,
 *   CID|speed|peers|ETA meta row, progress bar + percent, status badge + action buttons
 *   __top (name, type badge, direction), __meta (CID|Speed|Peers|ETA),
 *   __progress-row (bar + percent), __bottom (status badge + actions)
 */
'use client';

import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui';
import { useToast } from '@/providers/ToastProvider';
import type { Transfer } from '@/lib/types';
import { assetTypeLabel } from '@/lib/utils/asset-type-label';

interface TransferCardProps {
  transfer: Transfer;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onCancel?: (id: string) => void;
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** Type badge color classes matching transfers.html */
const typeBadgeStyles: Record<string, string> = {
  '.claw-skill': 'text-accent-green border-accent-green/30 bg-accent-green/8',
  '.claw-memory': 'text-accent-blue border-accent-blue/15 bg-accent-blue/8',
  '.claw-prompt': 'text-accent-yellow border-accent-yellow/20 bg-accent-yellow/8',
  '.claw-workflow': 'text-accent-purple border-accent-purple/30 bg-accent-purple/8',
};

/** Status badge styles matching transfers.html */
const statusBadges: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  active: {
    label: 'Active',
    dotClass: 'bg-accent-green shadow-[0_0_6px_currentColor]',
    badgeClass: 'text-accent-green bg-accent-green/12 border-accent-green/30',
  },
  completed: {
    label: 'Complete',
    dotClass: 'bg-accent-green',
    badgeClass: 'text-accent-green bg-accent-green/12 border-accent-green/30',
  },
  queued: {
    label: 'Paused',
    dotClass: 'bg-accent-yellow',
    badgeClass: 'text-accent-yellow bg-accent-yellow/8 border-accent-yellow/20',
  },
  failed: { label: 'Failed', dotClass: 'bg-accent-red', badgeClass: 'text-accent-red bg-accent-red/12 border-accent-red/30' },
};

export function TransferCard({ transfer: t, onPause, onResume, onCancel }: TransferCardProps) {
  const { addToast } = useToast();
  const isUpload = t.direction === 'upload';
  const isPaused = t.status === 'queued';
  const isSeeding = t.progress === 100 && t.status === 'active';
  const badge = isSeeding
    ? { label: 'Seeding', dotClass: 'bg-accent-blue', badgeClass: 'text-accent-blue bg-accent-blue/12 border-accent-blue/15' }
    : (statusBadges[t.status] ?? statusBadges.active);
  const typeStyle = typeBadgeStyles[t.assetType] ?? 'text-text-secondary border-border-default bg-bg-tertiary';

  return (
    <div
      className={cn(
        'bg-bg-secondary border border-border-default rounded-lg p-4 mb-3',
        'transition-colors',
        /* Left border — 3px colored by direction (matches data-transfer-direction) */
        isUpload ? 'border-l-[3px] border-l-accent-green' : 'border-l-[3px] border-l-accent-blue',
      )}
      data-testid={`transfer-card-${t.id}`}
    >
      {/* Top — .transfer-card__top: name, type badge, direction label */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-base font-bold text-text-primary">{t.assetName}</span>
        <span
          className={cn('inline-flex items-center px-2 py-0.5 text-xs font-bold rounded border uppercase tracking-wide', typeStyle)}
        >
          {assetTypeLabel(t.assetType)}
        </span>
        <span className={cn('ml-auto text-xs font-bold', isUpload ? 'text-accent-green' : 'text-accent-blue')}>
          {isUpload ? '↑ Share' : '↓ Install'}
        </span>
      </div>

      {/* Meta — .transfer-card__meta: CID | Speed | Peers | ETA (separated by pipes) */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-text-secondary font-mono mb-3">
        <span className="text-text-tertiary">
          CID: {t.id.slice(0, 8)}...{t.id.slice(-4)}
        </span>
        <span className="text-text-tertiary">|</span>
        <span>Speed: {t.speed.toFixed(1)} MB/s</span>
        <span className="text-text-tertiary">|</span>
        <span>Peers: {t.peerCount > 0 ? t.peerCount : '-'}</span>
        <span className="text-text-tertiary">|</span>
        <span>ETA: {formatEta(t.eta)}</span>
      </div>

      {/* Progress — .transfer-card__progress-row: bar + percentage */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <div className={cn('h-1 bg-bg-tertiary rounded-full overflow-hidden', isPaused && 'opacity-50')}>
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-[var(--transition-base)]',
                isUpload ? 'bg-accent-green' : 'bg-accent-blue',
              )}
              style={{ width: `${t.progress}%` }}
            />
          </div>
        </div>
        <span
          className={cn(
            'text-xs font-bold tabular-nums',
            isPaused && 'opacity-50',
            isUpload ? 'text-accent-green' : 'text-accent-blue',
          )}
        >
          {t.progress}%
        </span>
      </div>

      {/* Bottom — .transfer-card__bottom: status badge + action buttons */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Status badge with dot */}
        <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded border', badge.badgeClass)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', badge.dotClass)} />
          {badge.label}
        </span>

        {/* Action buttons */}
        <div className="flex gap-2">
          {isPaused ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => onResume?.(t.id)} data-testid={`transfer-resume-${t.id}`}>
                Resume
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onCancel?.(t.id)} data-testid={`transfer-cancel-${t.id}`}>
                Cancel
              </Button>
            </>
          ) : isSeeding ? (
            <Button variant="ghost" size="sm" onClick={() => onPause?.(t.id)} data-testid={`transfer-stop-${t.id}`}>
              Stop Seeding
            </Button>
          ) : t.status === 'active' ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => onPause?.(t.id)} data-testid={`transfer-pause-${t.id}`}>
                Pause
              </Button>
              {/* Giving up on a download should not take a pause first. */}
              <Button variant="ghost" size="sm" onClick={() => onCancel?.(t.id)} data-testid={`transfer-cancel-${t.id}`}>
                Cancel
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            data-testid={`transfer-copy-${t.id}`}
            onClick={() => {
              navigator.clipboard.writeText(t.id);
              addToast({ title: 'CID copied', variant: 'success', autoDismiss: true, duration: 2000 });
            }}
          >
            Copy CID
          </Button>
        </div>
      </div>
    </div>
  );
}
