/**
 * Purpose: Notification bell button with badge + anchored dropdown popover
 *          showing the 5 most recent agent-curated alerts (nudge + alert,
 *          the autopilot suggestions nudge among them) and, below them, what
 *          happened to the owner on the board (replies, awards, upvotes,
 *          expiring bounties) and the weekly digests the owner's agent
 *          posted (from the daemon, read state kept in this browser). The
 *          badge counts unread alerts plus unread board activity plus unread
 *          digests. Silent and digest-triage events are excluded; they live
 *          in /activity. Every row carries a relative time ("2m ago", the
 *          full date and time on hover) that refreshes each minute while the
 *          panel is open, so a stale alert reads as stale.
 */
'use client';

import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
import { getUnreadAlertCount } from '@/lib/api/hooks/use-events';
import { formatDateTime, timeAgo } from '@/lib/utils/format';
import { CATEGORY_META } from '@/lib/types/claw-event';
import type { ClawEvent } from '@/lib/types/claw-event';
import type { BoardActivityItem } from '@/lib/types/community';
import { ActivityList } from './ActivityList';
import { DigestList } from './DigestList';
import type { DigestRow } from './use-digest-rows';

const MAX_DROPDOWN_ITEMS = 5;
/** How often the "2m ago" labels refresh while the panel is open. */
const CLOCK_TICK_MS = 60_000;

interface NotificationBellProps {
  events: ClawEvent[];
  /** Marks the alerts and the board activity read together. */
  onMarkAllRead?: () => void;
  /** Board activity, newest first; every fetched row is listed (the popover scrolls). Absent while the agent is offline. */
  activity?: BoardActivityItem[];
  /** Unread board activity, from the tracker (may exceed the rows shown). */
  activityUnread?: number;
  onActivityRead?: (id: string) => void;
  /** Round 2: the "what the bell shows" switches, mounted by the navbar while the agent is connected. */
  prefsPanel?: ReactNode;
  /** Weekly digests the owner's agent posted, newest first; absent while the agent is offline. */
  digests?: DigestRow[];
  onDigestRead?: (id: string) => void;
  className?: string;
}

export function NotificationBell({
  events,
  onMarkAllRead,
  activity = [],
  activityUnread = 0,
  onActivityRead,
  prefsPanel,
  digests = [],
  onDigestRead,
  className,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  /* The clock the relative labels read: reset on open, then once a minute while open. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [open]);

  const alertEvents = useMemo(() => events.filter(e => e.triage === 'alert' || e.triage === 'nudge'), [events]);
  const visibleEvents = useMemo(() => alertEvents.slice(0, MAX_DROPDOWN_ITEMS), [alertEvents]);
  const hasMore = alertEvents.length > MAX_DROPDOWN_ITEMS;

  const digestUnread = useMemo(() => digests.filter(d => !d.read).length, [digests]);
  const unreadCount = useMemo(
    () => getUnreadAlertCount(events) + activityUnread + digestUnread,
    [events, activityUnread, digestUnread],
  );
  const anything = alertEvents.length > 0 || activity.length > 0 || digests.length > 0;

  // Click-outside to dismiss
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div className={`relative ${className ?? ''}`} ref={containerRef}>
      <button
        data-testid="notification-bell"
        className="relative inline-flex items-center justify-center w-11 h-11 rounded-md hover:bg-bg-tertiary transition-colors"
        onClick={() => setOpen(v => !v)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg className="w-5 h-5 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-full bg-accent-red text-white text-[11px] font-bold font-mono leading-none"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Anchored dropdown popover */}
      {open && (
        <div
          data-testid="notification-panel"
          role="menu"
          className="absolute right-0 top-full mt-2 w-[340px] max-sm:fixed max-sm:inset-x-4 max-sm:top-[calc(56px+env(safe-area-inset-top))] max-sm:mt-1 max-sm:w-auto bg-bg-secondary border border-border-default rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.4)] z-[301] overflow-hidden animate-[fade-in_0.15s_ease-out]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-default">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wide">Alerts</h2>
              {alertEvents.length > 0 && (
                <span className="flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-accent-red/12 text-accent-red text-[11px] font-bold">
                  {alertEvents.length}
                </span>
              )}
            </div>
            {onMarkAllRead && anything && (
              <button
                data-testid="notification-mark-all"
                className="text-[11px] text-text-tertiary hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                onClick={onMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {/* Alerts */}
            {!anything && (
              <div data-testid="notification-empty" className="flex flex-col items-center justify-center py-8 text-text-tertiary">
                <svg className="w-8 h-8 mb-2 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <p className="text-xs font-medium">All clear</p>
                <p className="text-[11px] mt-0.5 text-text-tertiary/70">No alerts right now</p>
              </div>
            )}
            {visibleEvents.map((event, index) => {
              const catMeta = CATEGORY_META[event.category];
              return (
                <div
                  key={event.id}
                  data-testid={`notif-item-${event.id}`}
                  className={`flex gap-2.5 px-3 py-2.5 border-l-2 hover:bg-bg-tertiary/30 transition-colors ${
                    event.triage === 'alert' ? 'border-l-accent-red' : 'border-l-accent-green'
                  } ${index < visibleEvents.length - 1 ? 'border-b border-b-border-default' : ''}`}
                >
                  <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 text-[11px] ${catMeta.colorClass}`}>
                    {catMeta.icon.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <p
                        className={`flex-1 min-w-0 text-[13px] truncate leading-tight m-0 ${!event.read ? 'font-medium text-text-primary' : 'text-text-secondary'}`}
                      >
                        {event.title}
                      </p>
                      <time
                        dateTime={event.timestamp}
                        title={formatDateTime(event.timestamp)}
                        data-testid={`notif-time-${event.id}`}
                        className="text-[11px] text-text-tertiary shrink-0 whitespace-nowrap"
                      >
                        {timeAgo(event.timestamp, now)}
                      </time>
                    </div>
                    <p className="text-[11px] text-text-tertiary mt-0.5 line-clamp-1">{event.description}</p>
                  </div>
                </div>
              );
            })}

            {/* Weekly digests the agent posted */}
            {digests.length > 0 && (
              <section data-testid="notification-digests">
                <div className="flex items-center gap-2 px-3 py-2 border-y border-border-default bg-bg-tertiary/30">
                  <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wide">Weekly digests</h3>
                  {digestUnread > 0 && (
                    <span
                      className="flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-accent-green/12 text-accent-green text-[11px] font-bold"
                      data-testid="notification-digests-unread"
                    >
                      {digestUnread}
                    </span>
                  )}
                </div>
                <DigestList rows={digests} onRead={id => onDigestRead?.(id)} onNavigate={() => setOpen(false)} now={now} />
              </section>
            )}

            {/* Board activity */}
            {activity.length > 0 && (
              <section data-testid="notification-activity">
                <div className="flex items-center gap-2 px-3 py-2 border-y border-border-default bg-bg-tertiary/30">
                  <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wide">Board activity</h3>
                  {activityUnread > 0 && (
                    <span
                      className="flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-accent-green/12 text-accent-green text-[11px] font-bold"
                      data-testid="notification-activity-unread"
                    >
                      {activityUnread}
                    </span>
                  )}
                </div>
                <ActivityList items={activity} onRead={id => onActivityRead?.(id)} onNavigate={() => setOpen(false)} now={now} />
              </section>
            )}

            {/* Round 2: which board activity kinds the bell shows (the navbar mounts it while the agent is connected) */}
            {prefsPanel}
          </div>

          {/* Footer */}
          <div className="border-t border-border-default px-3 py-2">
            <a
              data-testid="notification-view-all"
              href="/activity"
              className="flex items-center justify-center gap-1 text-[11px] text-accent-green hover:text-accent-green/80 font-medium transition-colors"
              onClick={() => setOpen(false)}
            >
              {hasMore ? `View all ${alertEvents.length} alerts` : 'View all activity'} →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
