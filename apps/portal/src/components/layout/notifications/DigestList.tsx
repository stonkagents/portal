/**
 * Purpose: The weekly digest rows inside the bell: "Weekly digest posted", the
 *          post's title ("<SYMBOL> weekly digest, <period>"), how long ago,
 *          and an Open link into the digest thread in the token's room.
 *          Clicking a row marks it read in this browser.
 */
'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { timeAgo } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { AutopilotEvent } from '@/lib/types/community';
import type { DigestRow } from './use-digest-rows';

export const DIGEST_POSTED_TITLE = 'Weekly digest posted';

/** The digest thread inside the token's room; the room alone when the daemon named no post. */
export function digestHref(event: Pick<AutopilotEvent, 'mint' | 'postId'>): string {
  const params = new URLSearchParams();
  if (event.mint) params.set('room', event.mint);
  if (event.postId) params.set('post', event.postId);
  const qs = params.toString();
  return qs ? `/community?${qs}` : '/community';
}

interface DigestListProps {
  rows: DigestRow[];
  onRead: (id: string) => void;
  /** Called after a row is opened, once the read is recorded (closes the popover). */
  onNavigate?: () => void;
  now?: number;
}

export function DigestList({ rows, onRead, onNavigate, now }: DigestListProps) {
  return (
    <div data-testid="digest-list">
      {rows.map((row, index) => (
        <div
          key={row.id}
          data-testid={`digest-item-${row.id}`}
          data-unread={row.read ? undefined : 'true'}
          className={cn(
            'flex gap-2.5 px-3 py-2.5 border-l-2 hover:bg-bg-tertiary/30 transition-colors',
            row.read ? 'border-l-transparent' : 'border-l-accent-green',
            index < rows.length - 1 && 'border-b border-b-border-default',
          )}
        >
          <div className="w-7 h-7 rounded flex items-center justify-center shrink-0 bg-accent-purple/8 text-accent-purple">
            <Icon name="calendar" size="sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn('text-[13px] leading-tight', row.read ? 'text-text-secondary' : 'font-medium text-text-primary')}>
              {DIGEST_POSTED_TITLE}
            </p>
            {row.title && (
              <p className="text-[11px] text-text-tertiary mt-0.5 line-clamp-1" data-testid={`digest-item-${row.id}-title`}>
                {row.title}
              </p>
            )}
            <p className="text-[11px] text-text-tertiary mt-0.5 flex items-center gap-2">
              <span>{timeAgo(row.createdAt, now)}</span>
              <Link
                href={digestHref(row)}
                className="text-accent-green hover:text-accent-green/80 font-medium no-underline"
                data-testid={`digest-item-${row.id}-open`}
                onClick={() => {
                  if (!row.read) onRead(row.id);
                  onNavigate?.();
                }}
              >
                Open
              </Link>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
