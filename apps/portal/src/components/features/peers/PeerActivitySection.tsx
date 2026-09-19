/**
 * Purpose: Peer activity sub-section — recent activity timeline with action, details, time
 */
'use client';

import { Icon } from '@/components/ui';
import { usePeerActivity } from '@/lib/api/hooks/use-peers';

interface PeerActivitySectionProps {
  peerId: string;
}

const ACTION_ICONS: Record<string, string> = {
  shared: 'upload',
  downloaded: 'download',
  trusted: 'shield',
  blocked: 'slash',
  posted: 'message-square',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PeerActivitySection({ peerId }: PeerActivitySectionProps) {
  const { data: activities, isLoading, isError } = usePeerActivity(peerId);

  return (
    <div className="mb-5">
      <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wide mb-3">Recent Activity</h4>

      {isLoading && (
        <div data-testid="peer-activity-loading" className="flex flex-col gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 rounded bg-bg-tertiary animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && isError && !activities && (
        <div className="text-xs text-text-tertiary text-center py-4" data-testid="peer-activity-failed">
          Couldn&apos;t load activity.
        </div>
      )}

      {!isLoading && !isError && (!activities || activities.length === 0) && (
        <div className="text-xs text-text-tertiary text-center py-4">No recent activity</div>
      )}

      {!isLoading && activities && activities.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {activities.map((activity, idx) => (
            <div key={`${activity.action}-${idx}`} className="flex items-start gap-2 px-3 py-2 rounded bg-bg-tertiary text-xs">
              <Icon
                name={(ACTION_ICONS[activity.action] ?? 'activity') as 'activity'}
                size="sm"
                className="text-text-tertiary shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-text-primary capitalize">{activity.action}</span>
                <p className="text-text-secondary mt-0.5 truncate">{activity.details}</p>
              </div>
              <span className="text-text-tertiary shrink-0 whitespace-nowrap">{relativeTime(activity.time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
