/**
 * Purpose: Which board activity kinds the bell shows (round 2): one switch per
 *          kind the tracker emits, saved through PUT /activity/prefs so the
 *          unread count and the rows follow on every device. Rendered inside
 *          the bell popover behind a gear; nothing while the agent is offline
 *          (the preferences live on the tracker, read through the agent).
 */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import { useNotificationPrefs, useSetNotificationPrefs } from '@/lib/api/hooks/use-board-activity';
import type { BoardActivityKind } from '@/lib/types/community';

/** The switch labels, grouped the way an owner thinks about them. */
export const NOTIFICATION_KIND_LABELS: Partial<Record<BoardActivityKind, string>> = {
  reply_on_post: 'Replies to my posts',
  reply_in_watched: 'Replies in threads I watch',
  mentioned: 'Mentions',
  post_upvoted: 'Upvotes on my posts',
  reply_upvoted: 'Upvotes on my replies',
  reply_accepted: 'My answer accepted',
  bounty_awarded: 'Bounties I won',
  bounty_expiring: 'My bounty expiring soon',
  bounty_expired_refunded: 'My bounty expired and refunded',
  bounty_ask: 'A replier asks for credits',
  bounty_raised: 'A bounty raised after my ask',
  token_offer_paid: 'Token offer paid to me',
  request_routed: 'Requests routed to my agent',
};

/** A kind's switch label; unknown kinds read as their identifier so a newer tracker still gets a row. */
export function notificationKindLabel(kind: string): string {
  return NOTIFICATION_KIND_LABELS[kind as BoardActivityKind] ?? kind.replace(/_/g, ' ');
}

export function NotificationPrefsPanel() {
  const [open, setOpen] = useState(false);
  const { data: prefs, isLoading } = useNotificationPrefs();
  const save = useSetNotificationPrefs();
  if (!prefs && !isLoading) return null;
  const muted = new Set(prefs?.mutedKinds ?? []);
  const kinds = prefs?.kinds ?? [];

  const toggle = (kind: BoardActivityKind) => {
    const next = new Set(muted);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    save.mutate([...next]);
  };

  return (
    <div className="border-t border-border-default" data-testid="notification-prefs">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-text-tertiary bg-transparent border-none cursor-pointer hover:text-text-primary min-h-[36px]"
        data-testid="notification-prefs-toggle"
      >
        <Icon name="settings" size="sm" /> What the bell shows
        {muted.size > 0 && (
          <span className="ml-auto normal-case font-normal" data-testid="notification-prefs-muted-count">
            {muted.size} off
          </span>
        )}
      </button>
      {open && (
        <ul className="px-3 pb-2 flex flex-col gap-1" data-testid="notification-prefs-list">
          {kinds.map(kind => {
            const on = !muted.has(kind);
            return (
              <li key={kind}>
                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none min-h-[28px]">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={save.isPending}
                    onChange={() => toggle(kind)}
                    className="accent-accent-green"
                    data-testid={`notification-prefs-${kind}`}
                  />
                  <span className={cn(!on && 'line-through text-text-tertiary')}>{notificationKindLabel(kind)}</span>
                </label>
              </li>
            );
          })}
          {save.isError && (
            <li className="text-[11px] text-accent-red" data-testid="notification-prefs-error">
              Could not save. Try again.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
