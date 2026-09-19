/**
 * Purpose: Time-grouped event timeline showing all ClawEvents with triage
 *          indicators, agent actions, and category labels.
 */
'use client';

import { useMemo } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils/cn';
import { CATEGORY_META } from '@/lib/types/claw-event';
import { formatDateTime } from '@/lib/utils/format';
import type { ClawEvent, ClawEventAction } from '@/lib/types/claw-event';

type TimeGroup = 'Today' | 'Yesterday' | 'Earlier';

interface ActivityTimelineProps {
  events: ClawEvent[];
  now: string;
}

const TRIAGE_INDICATOR: Record<string, string> = {
  alert: 'bg-accent-red',
  nudge: 'bg-accent-green',
  digest: 'bg-accent-blue',
  silent: 'bg-text-tertiary',
};

function getTimeGroup(timestamp: string, now: string): TimeGroup {
  const eventDate = new Date(timestamp);
  const nowDate = new Date(now);
  const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
  const nowDay = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const diffMs = nowDay.getTime() - eventDay.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return 'Earlier';
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function ActivityTimeline({ events, now }: ActivityTimelineProps) {
  const grouped = useMemo(() => {
    const groups: Record<TimeGroup, ClawEvent[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const event of events) {
      const group = getTimeGroup(event.timestamp, now);
      groups[group].push(event);
    }
    return groups;
  }, [events, now]);

  if (events.length === 0) {
    return (
      <div data-testid="activity-timeline">
        <EmptyState
          data-testid="activity-empty"
          title="No activity yet."
          description="Events from your agent and the Network will show here."
        />
      </div>
    );
  }

  const groupOrder: TimeGroup[] = ['Today', 'Yesterday', 'Earlier'];

  return (
    <div data-testid="activity-timeline" className="flex flex-col">
      {groupOrder.map(group => {
        const items = grouped[group];
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <h3 className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-text-tertiary bg-bg-primary sticky top-[calc(56px+env(safe-area-inset-top))]">
              {group}
            </h3>
            {items.map(event => {
              const catMeta = CATEGORY_META[event.category];
              return (
                <div
                  key={event.id}
                  data-testid={`activity-item-${event.id}`}
                  className="flex items-start gap-3 px-4 py-3 border-b border-border-default hover:bg-bg-tertiary/30"
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TRIAGE_INDICATOR[event.triage]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 text-sm font-medium text-text-primary">{event.title}</span>
                      <time
                        dateTime={event.timestamp}
                        title={formatDateTime(event.timestamp)}
                        className="shrink-0 text-[11px] font-mono tabular-nums text-text-tertiary"
                      >
                        {formatTime(event.timestamp)}
                      </time>
                    </div>
                    {event.agentAction && <p className="text-xs text-text-secondary mt-0.5">Agent: {event.agentAction}</p>}
                    <span className="inline-block mt-1 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                      {catMeta.label}
                    </span>
                    {event.actions && event.actions.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {event.actions.map((action: ClawEventAction, idx: number) =>
                          action.href ? (
                            <a
                              key={action.label}
                              href={action.href}
                              data-testid={`action-${event.id}-${idx}`}
                              className={cn(
                                'inline-flex items-center px-3 py-1 text-xs font-medium rounded transition-colors min-h-[32px]',
                                action.variant === 'primary'
                                  ? 'bg-accent-green/10 text-accent-green border border-accent-green/20 hover:bg-accent-green/20'
                                  : 'bg-bg-tertiary text-text-secondary border border-border-default hover:text-text-primary',
                              )}
                            >
                              {action.label}
                            </a>
                          ) : (
                            <button
                              key={action.label}
                              data-testid={`action-${event.id}-${idx}`}
                              className={cn(
                                'inline-flex items-center px-3 py-1 text-xs font-medium rounded transition-colors min-h-[32px] cursor-pointer',
                                action.variant === 'primary'
                                  ? 'bg-accent-green/10 text-accent-green border border-accent-green/20 hover:bg-accent-green/20'
                                  : 'bg-bg-tertiary text-text-secondary border border-border-default hover:text-text-primary',
                              )}
                            >
                              {action.label}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
