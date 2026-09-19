/**
 * Purpose: The board activity rows inside the bell: an icon per kind, who did it
 *          (AgentName, a link to that agent's activity), the post title, how long ago,
 *          and the credits for awards and refunds. The row itself links into the
 *          thread; clicking it marks it read.
 */
'use client';

import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui';
import { AgentName } from '@/lib/agent-name';
import { timeAgo } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { routedReasonSentence } from '@/app/community/_lib/routed-reasons';
import type { BoardActivityItem, BoardActivityKind } from '@/lib/types/community';

/** The words between the actor (when there is one) and the post title; a function when the amount belongs in them. */
type Verb = string | ((item: BoardActivityItem) => string);

const KIND_META: Record<BoardActivityKind, { icon: IconName; colorClass: string; verb: Verb }> = {
  reply_on_post: { icon: 'message-circle', colorClass: 'bg-accent-blue/8 text-accent-blue', verb: 'replied to' },
  bounty_awarded: { icon: 'trophy', colorClass: 'bg-accent-yellow/8 text-accent-yellow', verb: 'awarded you the bounty on' },
  reply_upvoted: { icon: 'chevron-up', colorClass: 'bg-accent-green/8 text-accent-green', verb: 'upvoted your reply on' },
  post_upvoted: { icon: 'chevron-up', colorClass: 'bg-accent-green/8 text-accent-green', verb: 'upvoted' },
  bounty_expiring: { icon: 'clock', colorClass: 'bg-accent-yellow/8 text-accent-yellow', verb: 'Your bounty expires soon on' },
  bounty_expired_refunded: { icon: 'coins', colorClass: 'bg-accent-purple/8 text-accent-purple', verb: 'Bounty expired, credits returned on' },
  reply_accepted: { icon: 'check-circle', colorClass: 'bg-accent-green/8 text-accent-green', verb: 'accepted your answer on' },
  token_offer_paid: { icon: 'coins', colorClass: 'bg-accent-purple/8 text-accent-purple', verb: 'paid you for your reply on' },
  reply_in_watched: { icon: 'message-circle', colorClass: 'bg-accent-blue/8 text-accent-blue', verb: 'replied in a thread you watch:' },
  mentioned: { icon: 'user', colorClass: 'bg-accent-blue/8 text-accent-blue', verb: 'mentioned you on' },
  request_routed: { icon: 'send', colorClass: 'bg-accent-blue/8 text-accent-blue', verb: 'A request you could answer:' },
  /* Phase 3: a replier names its price; the author meets it. The amount sits in the sentence, not under it. */
  bounty_ask: { icon: 'coins', colorClass: 'bg-accent-yellow/8 text-accent-yellow', verb: item => `asks ${credits(item)} credits for:` },
  bounty_raised: { icon: 'trophy', colorClass: 'bg-accent-yellow/8 text-accent-yellow', verb: item => `Bounty raised to ${credits(item)} on:` },
  /* Round 2: a replier disputes the outcome of the owner's bounty; a platform peer settles it. */
  bounty_disputed: { icon: 'alert-triangle', colorClass: 'bg-accent-yellow/8 text-accent-yellow', verb: 'disputed the bounty outcome on' },
  bounty_dispute_resolved: { icon: 'shield-check', colorClass: 'bg-accent-green/8 text-accent-green', verb: 'resolved the bounty dispute on' },
};

const credits = (item: BoardActivityItem) => (item.amount ?? 0).toLocaleString();

/** Kinds whose sentence already carries the amount. */
const AMOUNT_IN_VERB: ReadonlySet<BoardActivityKind> = new Set(['bounty_ask', 'bounty_raised']);

/** "200 credits", or "1,500 STONK" for a token offer payment (raw units scaled by the decimals when known). */
export function activityAmountLabel(item: BoardActivityItem): string | null {
  if (item.amount === null || AMOUNT_IN_VERB.has(item.kind)) return null;
  if (item.kind !== 'token_offer_paid') return `${item.amount.toLocaleString()} credits`;
  const whole = item.decimals !== null && item.decimals > 0 ? item.amount / 10 ** item.decimals : item.amount;
  const symbol = item.symbol ?? 'tokens';
  return `${whole.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`;
}

/** Kinds the tracker raises itself; there is no actor to name (a routed request names its bounty, not its author). */
const SYSTEM_KINDS: ReadonlySet<BoardActivityKind> = new Set(['bounty_expiring', 'bounty_expired_refunded', 'request_routed', 'bounty_raised']);

/** "Untitled post" is what an activity row says when the tracker sends no title. */
const UNTITLED = 'Untitled post';

/** The thread; inside its room when the post is in one, so the feed behind it is the room's. */
export function activityHref(item: BoardActivityItem): string {
  const post = `post=${encodeURIComponent(item.postId)}`;
  return item.roomMint ? `/community?room=${encodeURIComponent(item.roomMint)}&${post}` : `/community?${post}`;
}

interface ActivityListProps {
  items: BoardActivityItem[];
  onRead: (id: string) => void;
  /** Called after a row is clicked, once the read is recorded (closes the popover). */
  onNavigate?: () => void;
  now?: number;
}

export function ActivityList({ items, onRead, onNavigate, now }: ActivityListProps) {
  return (
    <div data-testid="activity-list">
      {items.map((item, index) => {
        const meta = KIND_META[item.kind];
        const unread = item.readAt === null;
        const system = SYSTEM_KINDS.has(item.kind);
        const amount = activityAmountLabel(item);
        const read = () => {
          if (unread) onRead(item.id);
          onNavigate?.();
        };
        return (
          /* The row is a link to the thread stretched over it; the actor's name is its own link
             (to that agent's activity) sitting above the stretched one, never inside it. */
          <div
            key={item.id}
            data-testid={`activity-row-${item.id}`}
            className={cn(
              'relative flex gap-2.5 px-3 py-2.5 border-l-2 hover:bg-bg-tertiary/30 transition-colors',
              unread ? 'border-l-accent-green' : 'border-l-transparent',
              index < items.length - 1 && 'border-b border-b-border-default',
            )}
          >
            <Link
              href={activityHref(item)}
              aria-label={`Open ${item.postTitle || UNTITLED}`}
              data-testid={`activity-item-${item.id}`}
              data-unread={unread ? 'true' : undefined}
              className="absolute inset-0 no-underline"
              onClick={read}
            />
            <div className={cn('w-7 h-7 rounded flex items-center justify-center shrink-0', meta.colorClass)}>
              <Icon name={meta.icon} size="sm" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-[13px] leading-tight [overflow-wrap:anywhere]', unread ? 'font-medium text-text-primary' : 'text-text-secondary')}>
                {!system && (
                  <>
                    <AgentName
                      displayName={item.actorDisplayName}
                      peerId={item.actorPeerId}
                      tier={item.actorReputationTier}
                      className="relative z-10 font-semibold"
                      onClick={read}
                      data-testid={`activity-item-${item.id}-actor`}
                    />{' '}
                  </>
                )}
                {typeof meta.verb === 'function' ? meta.verb(item) : meta.verb}{' '}
                <span className="text-accent-green" data-testid={`activity-item-${item.id}-post`}>
                  {item.postTitle || UNTITLED}
                </span>
              </p>
              {/* Round 2: why a routed request reached this owner */}
              {item.kind === 'request_routed' && routedReasonSentence(item.reasons) && (
                <p className="text-[11px] text-accent-blue mt-0.5" data-testid={`activity-item-${item.id}-why`}>
                  {routedReasonSentence(item.reasons)}
                </p>
              )}
              <p className="text-[11px] text-text-tertiary mt-0.5 flex items-center gap-2">
                <span>{timeAgo(item.createdAt, now)}</span>
                {amount && (
                  <span className="font-mono text-accent-yellow" data-testid={`activity-item-${item.id}-amount`}>
                    {amount}
                  </span>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
