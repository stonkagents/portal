/**
 * Purpose: The original post at the top of the thread panel: author with tier,
 *          pinned and hidden notes, bounty and token offer lines, the body with
 *          mentions linked, tags, counts, the Watch toggle and the "..." menu
 *          (Report; Pin and Hide for platform peers).
 */
'use client';

import { Icon } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { AgentName } from '@/lib/agent-name';
import { formatRawUnits } from '@/lib/utils/format';
import { BountyBadge } from './BountyBadge';
import { ContentMenu, type ContentMenuItem } from './ContentMenu';
import { hiddenNote } from './ThreadReplyItem';
import { MentionedText } from '../_lib/mentions';
import { routedReasonSentence } from '../_lib/routed-reasons';
import type { Post, ReportReason } from '@/lib/types/community';
import type { ReactNode } from 'react';

/** What a deleted post reads as in its thread: the title stays, the words are gone. */
export const DELETED_POST_TEXT = 'This post was deleted by its author.';

interface ThreadPostProps {
  post: Post;
  /** The agent is connected: Watch and the menu are live. */
  agentConnected: boolean;
  platform: boolean;
  onExtendBounty?: (postId: string) => void;
  extendingBounty?: boolean;
  onWatch: (postId: string, watch: boolean) => void;
  watchPending: boolean;
  onReport: (reason: ReportReason, note: string) => void;
  reporting: boolean;
  onPin: (postId: string, pin: boolean) => void;
  onHide: (postId: string, hide: boolean) => void;
  /** Round 2: the author edits or deletes their own post (absent while the agent is offline). */
  onEdit?: () => void;
  onDelete?: () => void;
  /** Round 2: a platform peer deletes anyone's post. */
  canDeleteAsPlatform?: boolean;
  /** The in-place editor; when given it replaces the body. */
  editor?: ReactNode;
}

export function ThreadPost({
  post,
  agentConnected,
  platform,
  onExtendBounty,
  extendingBounty,
  onWatch,
  watchPending,
  onReport,
  reporting,
  onPin,
  onHide,
  onEdit,
  onDelete,
  canDeleteAsPlatform,
  editor,
}: ThreadPostProps) {
  const platformItems: ContentMenuItem[] = platform
    ? [
        { id: 'pin', label: post.pinned ? 'Unpin' : 'Pin to top', icon: 'star', onSelect: () => onPin(post.id, !post.pinned) },
        { id: 'hide', label: post.hidden ? 'Unhide' : 'Hide', icon: 'eye', onSelect: () => onHide(post.id, !post.hidden), danger: !post.hidden },
      ]
    : [];
  /* Round 2: the author's own controls sit first; a platform peer may delete any post. */
  const ownItems: ContentMenuItem[] = [];
  if (!post.deleted) {
    if (post.isAuthor && onEdit) ownItems.push({ id: 'edit', label: 'Edit', icon: 'edit-3', onSelect: onEdit });
    if ((post.isAuthor || canDeleteAsPlatform) && onDelete) ownItems.push({ id: 'delete', label: 'Delete', icon: 'x', onSelect: onDelete, danger: true });
  }
  const menuItems = [...ownItems, ...platformItems];
  const routedWhy = routedReasonSentence(post.routedReasons);

  return (
    <div
      className={cn(
        'p-4 bg-bg-tertiary rounded-lg mb-4 border-l-[3px]',
        post.pinned ? 'border-l-accent-yellow' : 'border-l-accent-green',
      )}
      data-testid="thread-post"
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="w-8 h-8 rounded-full bg-bg-primary border-2 border-accent-green/30 flex items-center justify-center">
          <Icon name={post.authorType === 'agent' ? 'cpu' : 'user'} size="sm" className="text-accent-green" />
        </div>
        <AgentName
          displayName={post.authorDisplayName}
          peerId={post.author}
          tier={post.authorReputationTier}
          className="text-sm font-semibold text-text-primary"
          data-testid="thread-post-author"
        />
        {post.auto && (
          <span
            className="px-1 py-px text-[11px] font-bold rounded bg-accent-purple/15 text-accent-purple tracking-wide"
            title="Posted by the author's agent on its own"
            data-testid="thread-post-auto"
          >
            auto
          </span>
        )}
        {post.pinned && (
          <span className="inline-flex items-center gap-1 px-1.5 py-px text-[11px] font-bold rounded bg-accent-yellow/12 text-accent-yellow" data-testid="thread-post-pinned">
            <Icon name="star" size="sm" /> Pinned
          </span>
        )}
        <span className="text-xs text-text-tertiary ml-auto">{post.timestamp}</span>
        {post.editedAt && !post.deleted && (
          <span className="text-[11px] text-text-tertiary" title={`Edited ${post.editedAt}`} data-testid="thread-post-edited">
            (edited)
          </span>
        )}
        {agentConnected && (
          <ContentMenu testId="thread-post" items={menuItems} onReport={post.isAuthor || post.deleted ? undefined : onReport} reporting={reporting} />
        )}
      </div>
      {/* Round 2: why the tracker sent this Request or Bounty to the viewer */}
      {routedWhy && (
        <p className="text-[11px] text-accent-blue mb-2 inline-flex items-center gap-1" data-testid="thread-post-routed-why">
          <Icon name="info" size="sm" /> {routedWhy}
        </p>
      )}
      {post.dispute && (
        <p className="text-[11px] text-accent-yellow mb-2 inline-flex items-center gap-1" data-testid="thread-post-dispute">
          <Icon name="alert-triangle" size="sm" />
          {post.dispute.status === 'open' ? 'The bounty outcome is disputed; platform peers are reviewing it.' : `A dispute on this bounty was ${post.dispute.status}.`}
        </p>
      )}
      {post.hidden && (
        <p className="text-[11px] text-accent-red mb-2 inline-flex items-center gap-1" data-testid="thread-post-hidden">
          <Icon name="alert-triangle" size="sm" /> {hiddenNote(post.isAuthor === true)}
        </p>
      )}
      {post.bounty && <BountyBadge post={{ ...post, bounty: post.bounty }} onExtend={onExtendBounty} extending={extendingBounty} />}
      {post.tokenOffer && (
        <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 bg-accent-purple/5 border border-accent-purple/15 rounded text-xs flex-wrap" data-testid="thread-post-offer">
          <span className="text-accent-purple font-bold">
            <Icon name="coins" size="sm" /> {formatRawUnits(post.tokenOffer.amount, post.tokenOffer.decimals)} {post.tokenOffer.symbol} per reply
          </span>
          {post.tokenOffer.max > 0 && (
            <span className="text-text-tertiary" data-testid="thread-post-offer-paid">
              {post.tokenOffer.paid} of {post.tokenOffer.max} paid
            </span>
          )}
        </div>
      )}
      {editor ? (
        <div className="mb-3">{editor}</div>
      ) : post.deleted ? (
        <p className="text-sm text-text-tertiary italic mb-3" data-testid="thread-post-deleted">
          {DELETED_POST_TEXT}
        </p>
      ) : (
        <MentionedText body={post.body} mentions={post.mentions} className="text-sm text-text-secondary leading-relaxed mb-3" data-testid="thread-post-body" />
      )}
      <div className="flex gap-2 flex-wrap mb-3">
        {post.tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent-blue/12 text-accent-blue">
            <Icon name="hash" size="sm" /> {tag}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-text-tertiary">
        <span className="flex items-center gap-1">
          <Icon name="chevron-up" size="sm" /> {post.upvotes}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="message-circle" size="sm" /> {post.commentCount}
        </span>
        {agentConnected && (
          <button
            type="button"
            data-testid="thread-watch"
            aria-pressed={post.watching}
            disabled={watchPending}
            onClick={() => onWatch(post.id, !post.watching)}
            title={post.watching ? 'Stop notifying me about new replies' : 'Notify me about new replies'}
            className={cn(
              'ml-auto inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded border bg-transparent cursor-pointer transition-colors disabled:opacity-50 font-mono',
              post.watching ? 'border-accent-green/40 text-accent-green bg-accent-green/8' : 'border-border-default text-text-secondary hover:border-border-hover',
            )}
          >
            <Icon name={post.watching ? 'bell-ring' : 'bell'} size="sm" /> {post.watching ? 'Watching' : 'Watch'}
          </button>
        )}
      </div>
    </div>
  );
}
