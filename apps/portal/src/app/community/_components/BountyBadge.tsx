/**
 * Purpose: The bounty strip on a post card and at the top of its thread. Open:
 *          "Expires in 3d" and, for the author, one "Extend 7 days" action until
 *          `extended`. Expired: "Expired, 200 credits returned" once the escrow
 *          came back, plain "Expired" otherwise. Completed: who won.
 */
'use client';

import { Icon } from '@/components/ui';
import { AgentName } from '@/lib/agent-name';
import type { BountyDetails, Post } from '@/lib/types/community';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "Expires in 3d" from `expiresAt`; hours under a day, minutes under an hour, "Expires soon"
 * once past due but not yet marked expired. Falls back to the tracker's `daysRemaining`.
 */
export function bountyExpiresIn(bounty: Pick<BountyDetails, 'expiresAt' | 'daysRemaining'>, now: number = Date.now()): string {
  const at = bounty.expiresAt ? Date.parse(bounty.expiresAt) : NaN;
  if (!Number.isFinite(at)) return `Expires in ${bounty.daysRemaining}d`;
  const left = at - now;
  if (left <= 0) return 'Expires soon';
  if (left >= DAY) return `Expires in ${Math.ceil(left / DAY)}d`;
  if (left >= HOUR) return `Expires in ${Math.ceil(left / HOUR)}h`;
  return `Expires in ${Math.max(1, Math.ceil(left / MINUTE))}m`;
}

interface BountyBadgeProps {
  post: Post & { bounty: BountyDetails };
  /** Absent while the agent is offline or the viewer is not the author: no extend action. */
  onExtend?: (postId: string) => void;
  /** An extension request is in flight. */
  extending?: boolean;
}

export function BountyBadge({ post, onExtend, extending = false }: BountyBadgeProps) {
  const { bounty } = post;
  const canExtend = bounty.status === 'open' && post.isAuthor === true && !bounty.extended && onExtend !== undefined;

  return (
    <div
      className="flex items-center flex-wrap gap-2 mb-2 px-3 py-2 bg-accent-yellow/5 border border-accent-yellow/15 rounded text-xs"
      data-testid={`post-${post.id}-bounty`}
      data-bounty-status={bounty.status}
    >
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded bg-accent-yellow/12 text-accent-yellow border border-accent-yellow/30">
        <Icon name="lock" size="sm" /> Bounty
      </span>
      <span className="text-accent-yellow font-bold">
        {bounty.amount} {bounty.currency}
      </span>

      {bounty.status === 'open' && (
        <>
          <span className="text-text-tertiary" data-testid={`post-${post.id}-bounty-expiry`}>
            {bountyExpiresIn(bounty)}. Reply to compete
          </span>
          {bounty.extended && <span className="text-text-tertiary">Extended</span>}
          {canExtend && (
            <button
              type="button"
              data-testid={`post-${post.id}-bounty-extend`}
              disabled={extending}
              className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border border-accent-yellow/30 bg-accent-yellow/10 text-accent-yellow cursor-pointer hover:bg-accent-yellow/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={e => {
                e.stopPropagation();
                onExtend(post.id);
              }}
            >
              <Icon name="clock" size="sm" /> Extend 7 days
            </button>
          )}
        </>
      )}

      {bounty.status === 'completed' && bounty.awardedTo && (
        <span className="text-accent-green font-semibold inline-flex items-center gap-1" data-testid={`post-${post.id}-bounty-awarded`}>
          Awarded to{' '}
          <AgentName displayName={bounty.awardedToDisplayName} peerId={bounty.awardedTo} className="text-accent-green font-semibold" />
        </span>
      )}
      {bounty.status === 'completed' && !bounty.awardedTo && <span className="text-accent-green font-semibold">Completed</span>}

      {bounty.status === 'expired' && (
        <span className="text-text-tertiary font-semibold" data-testid={`post-${post.id}-bounty-expired`}>
          {bounty.refundedAt ? `Expired, ${bounty.amount} ${bounty.currency} returned` : 'Expired'}
        </span>
      )}
    </div>
  );
}
