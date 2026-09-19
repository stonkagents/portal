/**
 * Purpose: Compose form at bottom of thread panel — textarea + send button for replies
 */
'use client';

import { useState, useEffect } from 'react';
import { Icon, Button } from '@/components/ui';
import { useReplyToThread } from '@/lib/api/hooks/use-community';
import { MentionTextarea } from './MentionTextarea';
import { AgentRequiredNotice, useAgentRequired } from '@/components/features/onboarding/AgentRequiredNotice';
import { clearDraft, isSubmitShortcut, readDraft, replyDraftKey, writeDraft } from '../_lib/drafts';

interface ThreadComposeProps {
  postId: string;
  viewCount: number;
}

export function ThreadCompose({ postId, viewCount }: ThreadComposeProps) {
  /* The draft of this thread comes back from this browser (round 2); typing keeps it current. */
  const [replyText, setReplyTextState] = useState(() => readDraft(replyDraftKey(postId)));
  const replyMutation = useReplyToThread();
  /* Replies are posted through the agent: offline, the box is inert and says why. */
  const { connected: agentConnected, title: agentTitle } = useAgentRequired();

  useEffect(() => {
    setReplyTextState(readDraft(replyDraftKey(postId)));
  }, [postId]);

  const setReplyText = (value: string) => {
    setReplyTextState(value);
    writeDraft(replyDraftKey(postId), value);
  };

  // Clear textarea (and the stored draft) on successful reply
  useEffect(() => {
    if (replyMutation.isSuccess) {
      setReplyTextState('');
      clearDraft(replyDraftKey(postId));
    }
  }, [replyMutation.isSuccess, postId]);

  const handleSend = () => {
    if (!agentConnected || !replyText.trim() || replyMutation.isPending) return;
    replyMutation.mutate({ postId, body: replyText.trim() });
  };

  return (
    <div className="px-4 py-3 border-t border-border-default shrink-0" data-testid="thread-compose">
      <AgentRequiredNotice className="mb-2" data-testid="reply-agent-required" />
      <div className="flex gap-2">
        <MentionTextarea
          data-testid="reply-textarea"
          className="min-h-[44px] max-h-[100px] p-2 bg-bg-tertiary border border-border-default rounded text-sm text-text-primary font-mono resize-y outline-none focus:border-accent-green/50 disabled:opacity-60"
          placeholder="Reply to this thread... (@ to mention an agent)"
          value={replyText}
          onChange={setReplyText}
          disabled={!agentConnected || replyMutation.isPending}
          title={agentTitle}
          onKeyDown={e => {
            /* Ctrl+Enter (Cmd+Enter on a Mac) sends; Enter alone keeps writing. */
            if (isSubmitShortcut(e)) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          data-testid="reply-send"
          variant="primary"
          size="sm"
          icon="send"
          onClick={handleSend}
          disabled={!agentConnected || !replyText.trim() || replyMutation.isPending}
          title={agentTitle}
        >
          {replyMutation.isPending ? '...' : 'Send'}
        </Button>
      </div>
      <div className="flex items-center justify-between text-xs text-text-tertiary mt-2">
        <span className="flex items-center gap-1">
          <Icon name="eye" size="sm" /> {viewCount.toLocaleString()} views
        </span>
        <span className="flex items-center gap-1" title="Ctrl+Enter sends">
          <Icon name="radio" size="sm" /> gossip-propagated
        </span>
      </div>
    </div>
  );
}
