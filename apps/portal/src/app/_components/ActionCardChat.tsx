/**
 * Purpose: Chat onboarding section for ActionCard — agent bubble, quick replies, input.
 *          Clicking any interaction navigates to /chat page.
 */
'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClawMascot } from '@/components/brand/ClawMascot';

const QUICK_REPLIES = ['Building an AI app', 'Just exploring', 'Looking for skills'];

const AGENT_MESSAGE =
  "Yo! I'm your Agent, your AI on the StonkAgents network. I can help you find knowledge, draft posts, and build your reputation. What are you working on?";

export function ActionCardChat() {
  const router = useRouter();
  const [draft, setDraft] = useState('');

  const goToChat = useCallback(
    (initialText?: string) => {
      const text = initialText?.trim();
      if (text) {
        router.push(`/chat?q=${encodeURIComponent(text)}`);
        return;
      }
      router.push('/chat');
    },
    [router],
  );

  return (
    <div className="mb-3 pb-3 border-b border-border-default">
      <div className="flex items-center gap-1.5 mb-2.5">
        <div
          className="w-7 h-7 rounded-full bg-accent-green/10 border-[1.5px] border-accent-green/30 flex items-center justify-center shrink-0"
          data-testid="chat-avatar"
        >
          <ClawMascot variant="online" animation="breathe" size="xs" />
        </div>
        <div>
          <div className="text-[11px] font-bold text-accent-green">Your Agent</div>
          <div className="text-[11px] text-text-tertiary">
            <span className="inline-block w-[5px] h-[5px] rounded-full bg-accent-green shadow-[0_0_4px_var(--color-accent-green)] mr-0.5 align-middle" />
            Online via OpenClaw
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 mb-2.5">
        <div
          className="px-2.5 py-2 rounded-lg bg-accent-green/6 border border-accent-green/12 text-[11px] text-text-primary leading-relaxed max-w-[95%] self-start animate-fade-in-up"
          data-testid="chat-bubble-agent"
        >
          {AGENT_MESSAGE}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {QUICK_REPLIES.map(reply => (
          <button
            key={reply}
            onClick={() => goToChat(reply)}
            data-testid={`quick-reply-${reply.toLowerCase().replace(/\s+/g, '-')}`}
            className="px-2.5 py-1 rounded-full text-[11px] bg-bg-secondary border border-border-default text-text-secondary hover:border-accent-green/30 hover:text-accent-green hover:shadow-[0_0_8px_rgba(0,255,0,0.15)] cursor-pointer transition-all"
          >
            {reply}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5">
        <input
          className="flex-1 px-2.5 py-2 rounded-md text-[11px] bg-bg-secondary border border-border-default text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent-green/30 focus:shadow-[0_0_8px_rgba(0,255,0,0.1)] transition-all"
          placeholder="Ask your Agent anything..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              goToChat(draft);
            }
          }}
          data-testid="chat-input"
        />
        <button
          onClick={() => goToChat(draft)}
          className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-accent-green text-black border-none cursor-pointer min-h-8 hover:shadow-[0_0_10px_rgba(0,255,0,0.3)] transition-all whitespace-nowrap"
          data-testid="chat-send"
        >
          Send
        </button>
      </div>
    </div>
  );
}
