/**
 * Purpose: Chat thread area — welcome message, suggestion chips, messages,
 *   streaming partial text, typing indicator, and message queue display.
 */
'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui';
import type { ChatMessage } from './use-agent-chat';
import { MessageBubble } from './message-bubble';
import { useOwnAgentIdentity } from '@/lib/api/hooks/use-own-agent-name';
import { SpeakerAvatar } from './speaker-avatar';

const SUGGESTIONS = [
  { label: 'Share a dataset', text: 'How do I share a dataset with other agents?' },
  { label: 'Search knowledge', text: 'Search the network for machine learning embeddings' },
  { label: 'Check reputation', text: 'What is my current reputation score and how can I improve it?' },
  { label: 'Download model', text: 'Download the latest LoRA adapter shared on the network' },
  { label: 'Agent status', text: 'Show me the status of my agent and connected peers' },
  { label: 'Launch agent', text: 'How do I launch my agent?' },
] as const;
type ChatSuggestion = { label: string; text: string };

interface ChatThreadProps {
  messages: ChatMessage[];
  streaming: boolean;
  streamText: string;
  queue: string[];
  onSend: (text: string) => void;
  onRemoveFromQueue: (index: number) => void;
  showWelcome?: boolean;
  /** Who answers in this thread; defaults to the connected agent's display name. */
  agentName?: string;
  /** Picture shown next to the speaker's name (the agent's token image). */
  agentAvatarUrl?: string | null;
  welcomeTitle?: string;
  welcomeText?: string;
  showSuggestions?: boolean;
  suggestions?: readonly ChatSuggestion[];
}

export function ChatThread({
  messages,
  streaming,
  streamText,
  queue,
  onSend,
  onRemoveFromQueue,
  showWelcome = true,
  agentName,
  agentAvatarUrl,
  welcomeTitle,
  welcomeText = "Hey! I'm your AI agent. I can help you share data, search the network, manage transfers, check reputation, and more. What would you like to do?",
  showSuggestions = true,
  suggestions = SUGGESTIONS,
}: ChatThreadProps) {
  const own = useOwnAgentIdentity();
  const speaker = agentName ?? own.name;
  const avatar = agentAvatarUrl === undefined ? own.avatarUrl : agentAvatarUrl;
  const title = welcomeTitle ?? speaker;
  const threadRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText, streaming]);

  return (
    <div ref={threadRef} className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        {/* Welcome message */}
        {showWelcome && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-accent-green flex items-center gap-1.5">
              <SpeakerAvatar src={avatar} name={title} />
              {title}
            </span>
            <div className="bg-bg-secondary border border-border-default rounded-lg p-3 text-sm text-text-secondary leading-relaxed max-w-[85%]">
              {welcomeText}
            </div>
          </div>
        )}

        {/* Suggestion chips — empty conversation only */}
        {showSuggestions && !hasMessages && !streaming && (
          <div className="flex flex-wrap gap-2" data-testid="ac-suggestions">
            {suggestions.map(s => (
              <button
                key={s.label}
                onClick={() => onSend(s.text)}
                className="px-3 py-1.5 rounded-full border border-border-default bg-bg-tertiary text-xs text-text-secondary hover:border-accent-green hover:text-accent-green transition-colors min-h-[36px]"
                data-testid={`ac-suggestion-${s.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} index={i} agentName={speaker} agentAvatarUrl={avatar} />
        ))}

        {/* Streaming partial text */}
        {streaming && streamText && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-accent-green flex items-center gap-1.5">
              <SpeakerAvatar src={avatar} name={speaker} />
              {speaker}
            </span>
            <div className="bg-bg-secondary border border-border-default rounded-lg p-3 text-sm text-text-secondary leading-relaxed max-w-[85%] whitespace-pre-wrap [overflow-wrap:anywhere]">
              {streamText}
              <span className="inline-block w-1.5 h-4 bg-accent-green ml-0.5 animate-[statusPulse_1s_ease-in-out_infinite]" />
            </div>
          </div>
        )}

        {/* Typing indicator — initial delay before words appear */}
        {streaming && !streamText && (
          <div className="flex items-center gap-1.5 py-2" data-testid="ac-typing-dots">
            <span className="w-2 h-2 rounded-full bg-text-tertiary animate-[typing-bounce_1.4s_ease-in-out_infinite]" />
            <span className="w-2 h-2 rounded-full bg-text-tertiary animate-[typing-bounce_1.4s_ease-in-out_0.2s_infinite]" />
            <span className="w-2 h-2 rounded-full bg-text-tertiary animate-[typing-bounce_1.4s_ease-in-out_0.4s_infinite]" />
          </div>
        )}

        {/* Message queue */}
        {queue.length > 0 && (
          <div className="flex flex-col gap-1 opacity-60" data-testid="ac-queue">
            <span className="text-[11px] text-text-tertiary uppercase tracking-wider">Queued</span>
            {queue.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="bg-accent-green/5 border border-accent-green/10 rounded-lg px-3 py-1.5 text-xs text-text-secondary max-w-[85%] truncate">
                  {q}
                </div>
                <button
                  onClick={() => onRemoveFromQueue(i)}
                  className="text-text-tertiary hover:text-accent-red transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  data-testid={`ac-queue-remove-${i}`}
                >
                  <Icon name="x" size="sm" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
