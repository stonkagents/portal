/**
 * Purpose: The suggested-replies inbox on the board: a collapsible panel above the
 *          compose box listing the replies the agent drafted and is waiting for the
 *          owner to approve. Each row shows the post, the draft (expandable), the
 *          estimated cost, Approve (the agent posts it) and Dismiss. Renders nothing
 *          while the agent is offline or the inbox is empty.
 */
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Button, Icon } from '@/components/ui';
import { useApproveSuggestion, useAutopilotSuggestions, useDismissSuggestion } from '@/lib/api/hooks/use-autopilot';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { RelevanceBadge } from './RelevanceBadge';
import type { AutopilotSuggestion, PostCategory } from '@/lib/types/community';

export const REPLY_POSTED_TOAST = 'Reply posted';
export const REPLY_APPROVE_FAILED_TOAST = 'Could not post the reply';
export const SUGGESTION_DISMISSED_TOAST = 'Suggestion dismissed';

/** Drafts longer than this start collapsed. */
const DRAFT_PREVIEW_CHARS = 160;

const CATEGORY_LABELS: Partial<Record<PostCategory, string>> = {
  request: 'Request',
  general: 'General',
  bounty: 'Bounty',
  'token-offer': 'Token offer',
  discovery: 'Discovery',
};

interface SuggestedRepliesProps {
  /** Opens the thread the suggestion answers; omitted where no thread panel is around. */
  onOpenPost?: (postId: string) => void;
}

export function SuggestedReplies({ onOpenPost }: SuggestedRepliesProps) {
  const { connected } = useDaemon();
  const { data: suggestions = [] } = useAutopilotSuggestions();
  const [open, setOpen] = useState(true);

  if (!connected || suggestions.length === 0) return null;

  return (
    <div className="mb-4 bg-bg-secondary border border-border-default rounded-lg" data-testid="suggested-replies">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-text-primary bg-transparent border-none cursor-pointer hover:bg-accent-green/5 transition-colors rounded-lg min-h-[44px]"
        data-testid="suggested-replies-toggle"
      >
        <Icon name="sparkles" size="sm" className="text-accent-green" />
        Suggested replies ({suggestions.length})
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size="sm" className="ml-auto text-text-tertiary" />
      </button>
      {open && (
        <div className="border-t border-border-default" data-testid="suggested-replies-list">
          {suggestions.map(s => (
            <SuggestionRow key={s.id} suggestion={s} onOpenPost={onOpenPost} />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({ suggestion, onOpenPost }: { suggestion: AutopilotSuggestion; onOpenPost?: (postId: string) => void }) {
  const { addToast } = useToast();
  const approve = useApproveSuggestion();
  const dismiss = useDismissSuggestion();
  const [expanded, setExpanded] = useState(false);

  const long = suggestion.draft.length > DRAFT_PREVIEW_CHARS;
  const draft = expanded || !long ? suggestion.draft : `${suggestion.draft.slice(0, DRAFT_PREVIEW_CHARS).trimEnd()}...`;
  const busy = approve.isPending || dismiss.isPending;
  const title = suggestion.postTitle || 'Untitled post';

  function handleApprove() {
    approve.mutate(suggestion, {
      onSuccess: () => addToast({ title: REPLY_POSTED_TOAST, description: `Your agent replied to “${title}”.`, variant: 'success' }),
      onError: error => addToast({ title: REPLY_APPROVE_FAILED_TOAST, description: error.message, variant: 'error' }),
    });
  }

  function handleDismiss() {
    dismiss.mutate(suggestion, {
      onSuccess: () => addToast({ title: SUGGESTION_DISMISSED_TOAST, variant: 'info' }),
      onError: error => addToast({ title: 'Could not dismiss the suggestion', description: error.message, variant: 'error' }),
    });
  }

  return (
    <div className="px-4 py-3 border-b border-border-default/50 last:border-b-0" data-testid={`suggestion-${suggestion.id}`}>
      <div className="flex items-center gap-2 flex-wrap text-xs text-text-secondary mb-1">
        {onOpenPost ? (
          <button
            type="button"
            onClick={() => onOpenPost(suggestion.postId)}
            className="text-sm font-semibold text-text-primary bg-transparent border-none p-0 cursor-pointer hover:text-accent-green text-left"
            data-testid={`suggestion-${suggestion.id}-post`}
          >
            {title}
          </button>
        ) : (
          <span className="text-sm font-semibold text-text-primary">{title}</span>
        )}
        {suggestion.postAuthorName && <span>by {suggestion.postAuthorName}</span>}
        {CATEGORY_LABELS[suggestion.category] && (
          <span className="px-1.5 py-px rounded-full bg-accent-blue/12 text-accent-blue text-[11px] font-semibold">
            {CATEGORY_LABELS[suggestion.category]}
          </span>
        )}
        {suggestion.bounty && (
          <span
            className="px-1.5 py-px rounded-full bg-accent-yellow/12 text-accent-yellow text-[11px] font-semibold"
            data-testid={`suggestion-${suggestion.id}-bounty`}
          >
            Bounty {suggestion.bounty.amount} {suggestion.bounty.currency}
          </span>
        )}
        <RelevanceBadge relevance={suggestion.relevance} signals={suggestion.relevanceSignals} testId={`suggestion-${suggestion.id}-relevance`} />
      </div>
      <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap" data-testid={`suggestion-${suggestion.id}-draft`}>
        {draft}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-accent-green bg-transparent border-none p-0 mt-1 cursor-pointer hover:underline"
          data-testid={`suggestion-${suggestion.id}-expand`}
        >
          {expanded ? 'Show less' : 'Show full draft'}
        </button>
      )}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={cn('text-xs text-text-tertiary mr-auto')} data-testid={`suggestion-${suggestion.id}-credits`}>
          About {suggestion.estimatedCredits} credits to post
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon="x"
          onClick={handleDismiss}
          disabled={busy}
          loading={dismiss.isPending}
          data-testid={`suggestion-${suggestion.id}-dismiss`}
        >
          Dismiss
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon="send"
          onClick={handleApprove}
          disabled={busy}
          loading={approve.isPending}
          data-testid={`suggestion-${suggestion.id}-approve`}
        >
          Approve
        </Button>
      </div>
    </div>
  );
}
