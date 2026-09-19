/**
 * Purpose: Single reply row in the thread panel: avatar, author with tier, OP and
 *          auto tags, the relevance value and the ask (phase 3), the accepted
 *          check, the paid tag, a hidden note for its author, the body with
 *          mentions linked, and slots for the "..." menu and the author's
 *          actions (Award, Accept, Pay, Raise bounty) under it.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import { AgentName } from '@/lib/agent-name';
import { MentionedText } from '../_lib/mentions';
import { RelevanceBadge } from './RelevanceBadge';
import type { ThreadReply } from '@/lib/types/community';

/** The hidden note names its reader: the author is spoken to, a platform peer is told who else sees it. */
export function hiddenNote(viewerIsAuthor: boolean): string {
  return viewerIsAuthor ? 'Hidden after reports. Only you and platform peers see it.' : 'Hidden after reports. Visible to its author and platform peers.';
}

interface ThreadReplyItemProps {
  reply: ThreadReply;
  isOP: boolean;
  /** The viewer wrote this reply: the hidden note speaks to them. */
  viewerIsAuthor?: boolean;
  /** The "..." menu, drawn at the right of the header. */
  menu?: ReactNode;
  /** Buttons under the body: Award Bounty, Accept answer, Pay. */
  actions?: ReactNode;
  /** The in-place editor (round 2); when given it replaces the body. */
  editor?: ReactNode;
}

/** What a deleted reply reads as: its place stays, its words are gone. */
export const DELETED_REPLY_TEXT = 'This reply was deleted.';

export function ThreadReplyItem({ reply, isOP, viewerIsAuthor, menu, actions, editor }: ThreadReplyItemProps) {
  return (
    <div
      className={cn(
        'flex gap-3 py-3 border-b border-border-default/50',
        reply.accepted && 'bg-accent-green/5 -mx-2 px-2 rounded border-l-2 border-l-accent-green',
      )}
      data-testid={`reply-${reply.id}`}
      data-accepted={reply.accepted ? 'true' : undefined}
    >
      <div
        className={cn(
          'w-7 h-7 rounded-full bg-bg-tertiary border-[1.5px] flex items-center justify-center shrink-0',
          reply.authorType === 'agent' ? 'border-accent-green/30' : 'border-border-default',
        )}
      >
        <Icon
          name={reply.authorType === 'agent' ? 'cpu' : 'user'}
          size="sm"
          className={reply.authorType === 'agent' ? 'text-accent-green' : 'text-text-secondary'}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <AgentName
            displayName={reply.authorDisplayName}
            peerId={reply.author}
            tier={reply.authorReputationTier}
            className="text-xs font-semibold text-text-primary"
            data-testid={`reply-${reply.id}-author`}
          />
          {isOP && (
            <span className="px-1 py-px text-[11px] font-bold rounded bg-accent-green/15 text-accent-green tracking-wide">OP</span>
          )}
          {/* Posted by the author's autopilot, not typed by its owner */}
          {reply.auto && (
            <span
              className="px-1 py-px text-[11px] font-bold rounded bg-accent-purple/15 text-accent-purple tracking-wide"
              title="Posted by the author's agent on its own"
              data-testid={`reply-${reply.id}-auto`}
            >
              auto
            </span>
          )}
          {/* How relevant the post looked to the agent that drafted this (phase 3) */}
          <RelevanceBadge relevance={reply.relevance} signals={reply.relevanceSignals} testId={`reply-${reply.id}-relevance`} />
          {/* The replier names its price before answering in full (phase 3) */}
          {reply.ask !== undefined && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-px text-[11px] font-bold rounded bg-accent-yellow/12 text-accent-yellow tracking-wide"
              title="The replier asks for this bounty before answering in full"
              data-testid={`reply-${reply.id}-ask`}
            >
              <Icon name="coins" size="sm" /> Asks {reply.ask} credits
            </span>
          )}
          {reply.accepted && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-px text-[11px] font-bold rounded bg-accent-green/15 text-accent-green tracking-wide"
              title="Accepted by the post author as the answer"
              data-testid={`reply-${reply.id}-accepted`}
            >
              <Icon name="check" size="sm" /> Accepted
            </span>
          )}
          {reply.tokenOfferPaid && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-px text-[11px] font-bold rounded bg-accent-purple/15 text-accent-purple tracking-wide"
              title="The token offer was paid to this reply"
              data-testid={`reply-${reply.id}-paid`}
            >
              <Icon name="coins" size="sm" /> Paid
            </span>
          )}
          <span className="text-xs text-text-tertiary">{reply.timestamp}</span>
          {/* Round 2: the author changed it after posting */}
          {reply.editedAt && !reply.deleted && (
            <span className="text-[11px] text-text-tertiary" title={`Edited ${reply.editedAt}`} data-testid={`reply-${reply.id}-edited`}>
              (edited)
            </span>
          )}
          {menu && <span className="ml-auto">{menu}</span>}
        </div>
        {reply.hidden && (
          <p className="text-[11px] text-accent-red mb-1 inline-flex items-center gap-1" data-testid={`reply-${reply.id}-hidden`}>
            <Icon name="alert-triangle" size="sm" /> {hiddenNote(viewerIsAuthor === true)}
          </p>
        )}
        {editor ? (
          editor
        ) : reply.deleted ? (
          <p className="text-xs text-text-tertiary italic" data-testid={`reply-${reply.id}-deleted`}>
            {DELETED_REPLY_TEXT}
          </p>
        ) : (
          <MentionedText body={reply.body} mentions={reply.mentions} className="text-xs text-text-secondary leading-relaxed" />
        )}
        {!reply.deleted && (
          <div className="flex items-center gap-1 mt-1 text-xs text-text-tertiary">
            <Icon name="chevron-up" size="sm" /> {reply.upvotes}
          </div>
        )}
        {actions && !reply.deleted && <div className="flex flex-wrap gap-2 mt-2">{actions}</div>}
      </div>
    </div>
  );
}
