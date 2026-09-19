/**
 * Purpose: Swarm Activity Feed — live activity stream with pulsing dot and empty state
 */
'use client';

import { cn } from '@/lib/utils/cn';
import { Card, Icon } from '@/components/ui';

interface ActivityItem {
  id: string;
  text: string;
  time: string;
  color: 'green' | 'blue' | 'yellow' | 'purple';
}

interface SwarmActivityFeedProps {
  items: ActivityItem[];
  /** False when your agent is offline: the dot stops pulsing and the label says so. */
  live?: boolean;
  className?: string;
}

const dotColor: Record<ActivityItem['color'], string> = {
  green: 'bg-accent-green',
  blue: 'bg-accent-blue',
  yellow: 'bg-accent-yellow',
  purple: 'bg-accent-purple',
};

const textColor: Record<ActivityItem['color'], string> = {
  green: 'text-accent-green',
  blue: 'text-accent-blue',
  yellow: 'text-accent-yellow',
  purple: 'text-accent-purple',
};

const FILE_EXTENSIONS = /\.(vec|traj|claw-skill|claw-prompt|claw-memory|claw-workflow)$/;

/** Parse activity text into rich React elements — bold peer names, colored filenames */
function formatActivityText(text: string, color: ActivityItem['color']): React.ReactNode {
  const colorClass = textColor[color];
  // Split on whitespace-bounded tokens, check each for agent- or file extension
  const words = text.split(/(\s+)/);
  let hasHighlight = false;

  const parts = words.map((word, i) => {
    if (/^agent-\w+$/.test(word)) {
      hasHighlight = true;
      return (
        <strong key={i} className={colorClass}>
          {word}
        </strong>
      );
    }
    if (FILE_EXTENSIONS.test(word)) {
      hasHighlight = true;
      return (
        <span key={i} className={colorClass}>
          {word}
        </span>
      );
    }
    return word;
  });

  return hasHighlight ? parts : text;
}

export function SwarmActivityFeed({ items, live = true, className }: SwarmActivityFeedProps) {
  return (
    <Card className={cn('!p-3 flex flex-col', className)} data-testid="activity-feed">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-accent-green flex items-center gap-2">
          <Icon name="activity" size="sm" /> Network Activity
        </span>
        {live ? (
          <span className="text-xs font-semibold text-accent-green flex items-center gap-1.5" data-testid="activity-feed-live">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-green shadow-[0_0_6px_var(--color-accent-green)] animate-pulse" />
            Live
          </span>
        ) : (
          <span className="text-xs font-semibold text-text-tertiary flex items-center gap-1.5" data-testid="activity-feed-offline">
            <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />
            Offline
          </span>
        )}
      </div>

      {/* Scrollable list */}
      <div
        className={cn(
          'flex flex-col gap-2 max-h-[200px] overflow-y-auto flex-1',
          'md:max-h-[320px]',
          'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border-default',
        )}
      >
        {items.length === 0 && <div className="text-center py-4 text-xs text-text-tertiary">No recent activity</div>}
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2 text-xs text-text-secondary py-1" data-testid={`activity-${item.id}`}>
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor[item.color])} />
            <span className="flex-1 min-w-0 truncate">{formatActivityText(item.text, item.color)}</span>
            <span className="text-[11px] text-text-tertiary shrink-0">{item.time}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
