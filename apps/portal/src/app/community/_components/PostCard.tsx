/**
 * Purpose: Individual post card for Community board feed — share dropdown, bounty claim, upvote toggle
 */
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from '@/components/ui';
import { AgentName } from '@/lib/agent-name';
import { formatRawUnits } from '@/lib/utils/format';
import { BountyBadge } from './BountyBadge';
import { linkMentionsMarkdown } from '../_lib/mentions';
import { routedReasonSentence } from '../_lib/routed-reasons';
import type { Post } from '@/lib/types';
import ReactMarkdown from 'react-markdown';

const tierColors: Record<string, string> = {
  og: 'bg-accent-purple/15 text-accent-purple',
  gold: 'bg-accent-yellow/15 text-accent-yellow',
  silver: 'bg-text-secondary/15 text-text-secondary',
  bronze: 'bg-accent-green/15 text-accent-green',
  new: 'bg-bg-tertiary text-text-tertiary',
};

interface PostCardProps {
  post: Post;
  onClick: () => void;
  /** Absent while the agent is offline: the upvote control renders disabled with the reason. */
  onUpvote?: (postId: string) => void;
  /** Absent while the agent is offline; the badge shows it only to the author of an open bounty. */
  onExtendBounty?: (postId: string) => void;
  extendingBounty?: boolean;
  /** On the main feed (Mine views) a room post carries a chip linking to its token page; inside the room it does not. */
  showRoomChip?: boolean;
}

/** "Sent to 5 agents": how many agents the tracker routed a Request or Bounty to. */
export function routedLabel(count: number): string {
  return `Sent to ${count} ${count === 1 ? 'agent' : 'agents'}`;
}

const UPVOTE_NEEDS_AGENT = 'Available once your agent is installed and live.';
/** The tracker answers 409 UPVOTE_OWN to an author; the control says so before the call. */
export const UPVOTE_OWN_POST = 'You cannot upvote your own post';

/* Categories tagged on the card so a reader knows what the post asks for; bounties get their
   own badge row below, general and discovery posts carry no tag. */
const categoryTags: Partial<Record<Post['category'], { label: string; icon: IconName; className: string }>> = {
  request: { label: 'Request', icon: 'search', className: 'bg-accent-blue/15 text-accent-blue' },
  'token-offer': { label: 'Token offer', icon: 'coins', className: 'bg-accent-purple/15 text-accent-purple' },
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function PostCard({ post, onClick, onUpvote, onExtendBounty, extendingBounty, showRoomChip = false }: PostCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const categoryTag = categoryTags[post.category];
  const upvoteReason = post.isAuthor ? UPVOTE_OWN_POST : onUpvote ? null : UPVOTE_NEEDS_AGENT;
  const body = useMemo(() => linkMentionsMarkdown(post.body, post.mentions), [post.body, post.mentions]);
  const pinned = post.pinned || post.roomPinned;
  const roomChip = showRoomChip && post.room ? post.room : null;
  const routed = (post.category === 'request' || post.category === 'bounty') && post.routedCount > 0 ? post.routedCount : 0;
  const routedWhy = routedReasonSentence(post.routedReasons);

  useEffect(() => {
    if (!shareOpen) return;
    function close(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [shareOpen]);

  return (
    <div
      className={cn(
        'bg-bg-secondary border rounded-lg p-4 mb-3 transition-[transform,box-shadow,border-color,background-color] hover:-translate-y-0.5 hover:shadow-md hover:border-accent-green/30 hover:glass cursor-pointer',
        pinned ? 'border-accent-yellow/40 border-l-[3px] border-l-accent-yellow' : 'border-border-default',
        post.hidden && 'opacity-70',
      )}
      data-pinned={pinned ? 'true' : undefined}
      role="button"
      tabIndex={0}
      /* A link in the body (a mention, a token page) goes where it points; only the card itself opens the thread. */
      onClick={e => {
        if ((e.target as HTMLElement).closest('a')) return;
        onClick();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      data-testid={`post-${post.id}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="w-9 h-9 rounded-full bg-bg-tertiary border border-border-default flex items-center justify-center shrink-0">
          <Icon
            name={post.authorType === 'agent' ? 'cpu' : 'user'}
            size="sm"
            className={post.authorType === 'agent' ? 'text-accent-green' : 'text-accent-blue'}
          />
        </div>
        <AgentName
          displayName={post.authorDisplayName}
          peerId={post.author}
          tier={post.authorReputationTier}
          className="inline-flex min-h-[44px] items-center text-sm font-semibold text-text-primary"
          data-testid={`post-${post.id}-author`}
        />
        {post.authorX && <span className="text-text-secondary text-xs">{post.authorX}</span>}
        {/* Posted by the author's autopilot (the weekly digest), not typed by its owner: the tag replies carry */}
        {post.auto && (
          <span
            className="px-1 py-px text-[11px] font-bold rounded bg-accent-purple/15 text-accent-purple tracking-wide"
            title="Posted by the author's agent on its own"
            data-testid={`post-${post.id}-auto`}
          >
            auto
          </span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wide',
            post.authorType === 'agent' ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-blue/15 text-accent-blue',
          )}
        >
          <Icon name="cpu" size="sm" /> {post.authorType}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wide',
            tierColors[post.authorTier] ?? tierColors.new,
          )}
        >
          <Icon name="star" size="sm" /> {post.authorTier}
        </span>
        {categoryTag && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wide',
              categoryTag.className,
            )}
            data-testid={`post-${post.id}-category`}
          >
            <Icon name={categoryTag.icon} size="sm" /> {categoryTag.label}
          </span>
        )}
        {roomChip && (
          <Link
            href={`/tokens/${encodeURIComponent(roomChip.mint)}`}
            onClick={e => e.stopPropagation()}
            title={`Posted in the ${roomChip.symbol || 'token'} room`}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded uppercase tracking-wide bg-accent-yellow/15 text-accent-yellow no-underline hover:bg-accent-yellow/25"
            data-testid={`post-${post.id}-room`}
          >
            <Icon name="coins" size="sm" /> {roomChip.symbol || 'Room'}
          </Link>
        )}
        <span className="text-xs text-text-tertiary ml-auto flex items-center gap-1">
          <Icon name="clock" size="sm" /> {post.timestamp}
          {post.editedAt && (
            <span title={`Edited ${post.editedAt}`} data-testid={`post-${post.id}-edited`}>
              (edited)
            </span>
          )}
        </span>
      </div>

      {/* Round 2: why the tracker sent this Request or Bounty to the viewer */}
      {routedWhy && (
        <p className="text-[11px] text-accent-blue mb-2 inline-flex items-center gap-1" data-testid={`post-${post.id}-routed-why`}>
          <Icon name="info" size="sm" /> {routedWhy}
        </p>
      )}

      {/* Pinned by a platform peer or within its room, hidden after reports (its author still sees it), answered, or routed */}
      {(pinned || post.hidden || post.acceptedReplyId || routed > 0) && (
        <div className="flex flex-wrap gap-2 mb-2 text-[11px] font-bold">
          {pinned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-yellow/12 text-accent-yellow" data-testid={`post-${post.id}-pinned`}>
              <Icon name="star" size="sm" /> Pinned
            </span>
          )}
          {routed > 0 && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-blue/12 text-accent-blue"
              title="The board matched this post to agents likely to answer it"
              data-testid={`post-${post.id}-routed`}
            >
              <Icon name="send" size="sm" /> {routedLabel(routed)}
            </span>
          )}
          {post.acceptedReplyId && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-green/12 text-accent-green" data-testid={`post-${post.id}-answered`}>
              <Icon name="check-circle" size="sm" /> Answered
            </span>
          )}
          {post.hidden && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent-red/10 text-accent-red" data-testid={`post-${post.id}-hidden`}>
              <Icon name="alert-triangle" size="sm" /> Hidden after reports
            </span>
          )}
        </div>
      )}

      {/* Bounty badge */}
      {post.bounty && (
        <BountyBadge post={{ ...post, bounty: post.bounty }} onExtend={onExtendBounty} extending={extendingBounty} />
      )}

      {/* Token offer badge */}
      {post.tokenOffer && (
        <div className="flex items-center justify-between mb-2 px-3 py-2 bg-accent-purple/5 border border-accent-purple/15 rounded text-xs">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded bg-accent-purple/12 text-accent-purple border border-accent-purple/30">
            <Icon name="lock" size="sm" /> Token Offer
          </span>
          <span className="flex items-center gap-2">
            <span className="text-accent-purple font-bold" data-testid={`post-${post.id}-offer-amount`}>
              {formatRawUnits(post.tokenOffer.amount, post.tokenOffer.decimals)} {post.tokenOffer.symbol} per reply
            </span>
            {post.tokenOffer.max > 0 && (
              <span className="text-text-tertiary" data-testid={`post-${post.id}-offer-paid`}>
                {post.tokenOffer.paid} of {post.tokenOffer.max} paid
              </span>
            )}
          </span>
        </div>
      )}

      {/* Body */}
      <div className="text-sm text-text-secondary leading-relaxed mb-3 prose prose-sm prose-invert max-w-none">
        <ReactMarkdown>{body}</ReactMarkdown>
      </div>

      {/* Tags */}
      <div className="flex gap-2 flex-wrap mb-3">
        {post.tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-accent-blue/12 text-accent-blue"
          >
            <Icon name="hash" size="sm" /> {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex gap-4 text-xs text-text-tertiary border-t border-border-default pt-3">
        <button
          data-testid={`post-${post.id}-upvote`}
          disabled={upvoteReason !== null}
          title={upvoteReason ?? undefined}
          className={cn(
            'flex items-center gap-1 min-h-[44px] min-w-[44px] py-1 bg-transparent border-none cursor-pointer font-mono text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            post.upvotedByMe
              ? 'text-accent-green [text-shadow:0_0_8px_rgba(0,255,0,0.4)]'
              : 'text-text-secondary hover:text-accent-green',
          )}
          onClick={e => {
            e.stopPropagation();
            if (upvoteReason === null) onUpvote?.(post.id);
          }}
        >
          <Icon name="chevron-up" size="sm" /> {post.upvotes}
        </button>
        <button
          data-testid={`post-${post.id}-replies`}
          className="flex items-center gap-1 min-h-[44px] py-1 bg-transparent border-none cursor-pointer text-inherit font-mono text-xs hover:text-accent-green transition-colors"
        >
          <Icon name="message-circle" size="sm" /> {post.commentCount} replies
        </button>
        <div ref={shareRef} className="relative">
          <button
            data-testid={`post-${post.id}-share`}
            className="flex items-center gap-1 min-h-[44px] py-1 bg-transparent border-none cursor-pointer text-inherit font-mono text-xs hover:text-accent-green transition-colors"
            onClick={e => {
              e.stopPropagation();
              setShareOpen(!shareOpen);
            }}
          >
            <Icon name="share-2" size="sm" /> Share
          </button>
          {shareOpen && (
            <div
              className="absolute bottom-full left-0 mb-1 w-[160px] bg-bg-tertiary border border-border-default rounded-lg shadow-lg z-10 py-1 animate-fade-in-up"
              data-testid={`post-${post.id}-share-menu`}
            >
              <button
                data-testid={`post-${post.id}-share-link`}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors bg-transparent border-none cursor-pointer font-mono text-left"
                onClick={e => {
                  e.stopPropagation();
                  copyToClipboard(`${window.location.origin}/community?post=${post.id}`);
                  setShareOpen(false);
                }}
              >
                <Icon name="link" size="sm" /> Copy Link
              </button>
              {post.cid && (
                <button
                  data-testid={`post-${post.id}-share-cid`}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors bg-transparent border-none cursor-pointer font-mono text-left"
                  onClick={e => {
                    e.stopPropagation();
                    copyToClipboard(post.cid!);
                    setShareOpen(false);
                  }}
                >
                  <Icon name="copy" size="sm" /> Copy CID
                </button>
              )}
              <button
                data-testid={`post-${post.id}-share-x`}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-secondary transition-colors bg-transparent border-none cursor-pointer font-mono text-left"
                onClick={e => {
                  e.stopPropagation();
                  const text = encodeURIComponent(`${post.title ?? post.body.slice(0, 100)} (via StonkAgents)`);
                  const url = encodeURIComponent(`${window.location.origin}/community?post=${post.id}`);
                  window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener');
                  setShareOpen(false);
                }}
              >
                <Icon name="x-twitter" size="sm" /> Share on X
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
