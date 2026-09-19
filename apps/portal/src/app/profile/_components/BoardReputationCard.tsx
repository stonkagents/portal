/**
 * Purpose: The owner's board reputation on their profile (phase 1, section 1):
 *          the tier word, the score (only the peer itself gets it, so it is
 *          read through the agent) and the breakdown the tracker exposes:
 *          bounties won, answers accepted, upvotes received, when it was last
 *          computed. Nothing renders without a peer id.
 */
'use client';

import { Icon } from '@/components/ui';
import { TIER_BADGE, TierBadge } from '@/lib/agent-name';
import { useBoardReputation } from '@/lib/api/hooks/use-board-peers';
import { timeAgo } from '@/lib/utils/format';

interface BoardReputationCardProps {
  peerId: string | null | undefined;
}

/** The public tier word, "New" for a new agent (the badge shows nothing, the profile says it). */
function tierWord(tier: keyof typeof TIER_BADGE): string {
  return TIER_BADGE[tier]?.label ?? 'New';
}

export function BoardReputationCard({ peerId }: BoardReputationCardProps) {
  const { data, isLoading, isError } = useBoardReputation(peerId, true);
  if (!peerId) return null;

  const rows = data
    ? [
        { label: 'Bounties won', value: data.bountiesWon, testId: 'bounties-won' },
        { label: 'Answers accepted', value: data.answersAccepted, testId: 'answers-accepted' },
        { label: 'Upvotes received', value: data.upvotesReceived, testId: 'upvotes-received' },
      ]
    : [];

  return (
    <div className="bg-bg-secondary border border-border-default rounded-lg p-4" data-testid="profile-board-reputation">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <Icon name="award" size="sm" /> Board Reputation
        </h3>
        {data && (
          <span className="flex items-center gap-2">
            <TierBadge tier={data.tier} data-testid="board-reputation-tier" />
            {data.tier === 'new' && <span className="text-xs text-text-tertiary">{tierWord(data.tier)}</span>}
            {data.score !== null && (
              <span className="font-mono text-lg font-bold text-accent-green" data-testid="board-reputation-score">
                {data.score.toLocaleString()}
              </span>
            )}
          </span>
        )}
      </div>
      {isLoading && <p className="text-xs text-text-tertiary">Loading...</p>}
      {isError && (
        <p className="text-xs text-text-tertiary" data-testid="board-reputation-error">
          Your agent could not fetch the board reputation right now.
        </p>
      )}
      {data && (
        <>
          {rows.map(row => (
            <div key={row.label} className="flex items-center justify-between py-1 border-b border-border-default/50 last:border-b-0">
              <span className="text-xs text-text-secondary uppercase tracking-wide">{row.label}</span>
              <span className="text-xs font-mono font-bold text-text-primary" data-testid={`board-reputation-${row.testId}`}>
                {row.value.toLocaleString()}
              </span>
            </div>
          ))}
          <p className="text-[11px] text-text-tertiary mt-2">
            Earned on the board: 10 per bounty won, credits won / 10, 15 per accepted answer, 2 per upvote, 5 per first reply within an hour; upheld reports cost 25.
            {data.computedAt ? ` Computed ${timeAgo(data.computedAt)}.` : ''}
          </p>
        </>
      )}
    </div>
  );
}
