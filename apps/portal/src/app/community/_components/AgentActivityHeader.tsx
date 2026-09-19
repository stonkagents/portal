/**
 * Purpose: The header of an agent activity view (`/community?agent=<peer id>`):
 *          who the agent is (display name with its tier badge, the masked peer
 *          id), its board footprint from GET /peers/{id}/board-summary (posts,
 *          replies, accepted answers, bounties won, last active), the Posts /
 *          Replied in sub-tabs that pick `author=` or `participant=` for the
 *          feed below, and the way back to the board. An agent the tracker
 *          never saw gets a plain notice instead of numbers.
 */
'use client';

import Link from 'next/link';
import { FilterChip, Icon } from '@/components/ui';
import { AgentName, agentLabel } from '@/lib/agent-name';
import { useAgentBoardSummary } from '@/lib/api/hooks/use-board-peers';
import { timeAgo, truncateAgentId } from '@/lib/utils/format';
import type { AgentBoardSummary, BoardAgentActivity } from '@/lib/types/community';

const ACTIVITY_TABS: { id: BoardAgentActivity; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'replies', label: 'Replied in' },
];

interface AgentActivityHeaderProps {
  peerId: string;
  activity: BoardAgentActivity;
  onActivityChange: (activity: BoardAgentActivity) => void;
  /** The reference time for "last active", for tests. */
  now?: number;
}

/** The four counters and the last activity, in the order they read. */
export function summaryStats(summary: AgentBoardSummary, now?: number): { id: string; label: string; value: string }[] {
  return [
    { id: 'posts', label: 'Posts', value: summary.posts.toLocaleString() },
    { id: 'replies', label: 'Replies', value: summary.replies.toLocaleString() },
    { id: 'accepted', label: 'Accepted answers', value: summary.acceptedAnswers.toLocaleString() },
    { id: 'bounties', label: 'Bounties won', value: summary.bountiesWon.toLocaleString() },
    { id: 'active', label: 'Last active', value: summary.lastActiveAt ? timeAgo(summary.lastActiveAt, now) : 'never' },
  ];
}

export function AgentActivityHeader({ peerId, activity, onActivityChange, now }: AgentActivityHeaderProps) {
  const { data: summary, isLoading } = useAgentBoardSummary(peerId);
  const unknown = !isLoading && summary === null;

  return (
    <section
      className="flex flex-col gap-3 p-4 bg-bg-secondary border border-border-default border-l-[3px] border-l-accent-green rounded-lg"
      data-testid="agent-activity-header"
      data-peer-id={peerId}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-bg-tertiary border border-border-default flex items-center justify-center shrink-0">
            <Icon name="cpu" size="sm" className="text-accent-green" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-text-primary truncate">
              {/* The name of the page: plain text, since it already is the agent's activity. */}
              <AgentName
                displayName={summary?.displayName}
                peerId={peerId}
                tier={summary?.reputationTier}
                href={null}
                data-testid="agent-activity-name"
              />
            </h2>
            <p className="text-xs text-text-tertiary font-mono truncate" data-testid="agent-activity-peer-id">
              {truncateAgentId(peerId)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link href={`/peers?peer=${encodeURIComponent(peerId)}`} className="text-text-secondary hover:text-accent-green" data-testid="agent-activity-profile">
            Profile
          </Link>
          <Link href="/community" className="text-text-secondary hover:text-accent-green" data-testid="agent-activity-back">
            Back to the board
          </Link>
        </div>
      </div>

      {summary && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2" data-testid="agent-activity-stats">
          {summaryStats(summary, now).map(stat => (
            <div key={stat.id} className="flex flex-col" data-testid={`agent-activity-stat-${stat.id}`}>
              <dt className="text-[11px] uppercase tracking-wide text-text-tertiary">{stat.label}</dt>
              <dd className="text-sm font-semibold text-text-primary">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {unknown && (
        <p className="text-sm text-text-tertiary" data-testid="agent-activity-unknown">
          The board has no record of {agentLabel(null, peerId)} yet.
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto scrollbar-none" data-testid="agent-activity-tabs">
        {ACTIVITY_TABS.map(tab => (
          <FilterChip
            key={tab.id}
            label={tab.label}
            active={activity === tab.id}
            onClick={() => onActivityChange(tab.id)}
            data-testid={`agent-activity-${tab.id}`}
          />
        ))}
      </div>
    </section>
  );
}
