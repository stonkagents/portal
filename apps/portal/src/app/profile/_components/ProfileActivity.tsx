/**
 * Purpose: Profile right column — Top Drops list and Recent Activity feed
 */

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import type { Drop, ActivityItem } from '@/lib/types';

const DROP_TYPE_COLOR: Record<string, string> = {
  '.at-vec': 'bg-accent-green/12 text-accent-green',
  '.at-raw': 'bg-accent-blue/12 text-accent-blue',
  '.at-traj': 'bg-accent-yellow/12 text-accent-yellow',
};

const DOT_COLOR: Record<string, string> = {
  green: 'bg-accent-green',
  blue: 'bg-accent-blue',
  yellow: 'bg-accent-yellow',
  red: 'bg-accent-red',
};

interface ProfileActivityProps {
  drops: Drop[];
  dropsTotal: number;
  activity: ActivityItem[];
}

export function ProfileActivity({ drops, dropsTotal, activity }: ProfileActivityProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Top Drops */}
      <div className="bg-bg-secondary border border-border-default rounded-lg p-4" data-testid="profile-drops-list">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Icon name="hard-drive" size="sm" /> Top Drops
          </h3>
          <span className="text-xs text-text-tertiary">{dropsTotal} total</span>
        </div>
        {drops.map(drop => (
          <div key={drop.name} className="flex items-center gap-3 py-2 border-b border-border-default last:border-b-0">
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 text-[11px] font-bold rounded shrink-0',
                DROP_TYPE_COLOR[drop.type] ?? 'bg-bg-tertiary text-text-secondary',
              )}
            >
              {drop.type}
            </span>
            <span className="flex-1 text-sm text-text-primary font-mono min-w-0 truncate" title={drop.name}>
              {drop.name}
            </span>
            <span className="text-xs text-text-secondary shrink-0">{drop.peers} peers</span>
          </div>
        ))}
        <Link
          href="/gallery"
          className="flex items-center justify-center gap-2 w-full mt-3 min-h-[44px] py-2 text-xs text-text-secondary hover:text-accent-green transition-colors"
          data-testid="profile-view-all-drops"
        >
          <Icon name="arrow-up-down" size="sm" /> View All Drops
        </Link>
      </div>

      {/* Activity Feed */}
      <div className="bg-bg-secondary border border-border-default rounded-lg p-4" data-testid="profile-activity-feed">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Icon name="activity" size="sm" /> Recent Activity
          </h3>
          <span className="flex items-center gap-1 text-xs text-accent-green font-bold uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" /> Live
          </span>
        </div>
        {activity.map(item => (
          <div key={item.id} className="flex items-start gap-2 py-2 border-b border-border-default last:border-b-0 text-sm">
            <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', DOT_COLOR[item.color])} />
            <span className="flex-1 text-text-primary leading-snug">{item.text}</span>
            <span className="text-xs text-text-tertiary shrink-0">{item.timestamp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
