/**
 * Purpose: Renders a single chat message — text bubble (user/assistant) or tool call display.
 */

import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import type { ChatMessage } from './use-agent-chat';
import { SpeakerAvatar } from './speaker-avatar';

export function MessageBubble({
  msg,
  index = 0,
  agentName = 'Your agent',
  agentAvatarUrl = null,
}: {
  msg: ChatMessage;
  index?: number;
  agentName?: string;
  agentAvatarUrl?: string | null;
}) {
  const delay = `${Math.min(index * 80, 400)}ms`;

  if (msg.type === 'tool') {
    return (
      <div
        className="flex items-start gap-2 px-3 py-2 bg-bg-tertiary rounded-lg border border-border-default text-xs max-w-[85%] animate-fade-in-up"
        style={{ animationDelay: delay, animationFillMode: 'both' }}
        data-testid="ac-tool-call"
      >
        <Icon name="terminal" size="sm" className="text-accent-green shrink-0 mt-0.5" />
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <div className="font-semibold text-text-primary">{msg.toolName ?? 'tool_call'}</div>
          {msg.toolResult && <div className="text-text-secondary mt-0.5">{msg.toolResult}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-1 animate-fade-in-up"
      style={{ animationDelay: delay, animationFillMode: 'both' }}
      data-testid={msg.role === 'assistant' ? 'chat-bubble-agent' : 'chat-bubble-user'}
    >
      <span
        className={cn(
          'text-xs font-semibold flex items-center gap-1.5',
          msg.role === 'assistant' ? 'text-accent-green' : 'text-text-primary',
        )}
      >
        {msg.role === 'assistant' && <SpeakerAvatar src={agentAvatarUrl} name={agentName} />}
        {msg.role === 'assistant' ? agentName : 'You'}
      </span>
      <div
        className={cn(
          'rounded-lg p-3 text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap [overflow-wrap:anywhere]',
          msg.role === 'assistant'
            ? 'bg-bg-secondary border border-border-default text-text-secondary'
            : 'bg-accent-green/8 border border-accent-green/20 text-text-primary',
        )}
      >
        {msg.text}
      </div>
    </div>
  );
}
