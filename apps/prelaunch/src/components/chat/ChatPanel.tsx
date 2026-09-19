/**
 * Purpose: Chat panel with Mystery Keeper personality — pre-scripted responses, no backend.
 *          Renders inline Claw mascot SVGs from {claw}, {glasses}, {thug} markers.
 */
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { matchResponse } from '@/lib/chat/matcher';
import { incrementChatMessageCount, getChatMessageCount } from '@/lib/storage';
import { ClawIcon, type ClawVariant } from '@/components/ui/ClawIcon';
import { sfxChat } from '@/lib/audio/sfx';

const MAX_MESSAGES_PER_SESSION = 30;
const TYPING_DELAY_MS = 800;

interface Message {
  id: string;
  role: 'user' | 'agent';
  text: string;
}

const GREETING: Message = {
  id: 'greeting',
  role: 'agent',
  text: 'Yo. {thug} Ask me about the Network\u2026 if you dare.',
};

/** Parse text with {claw}, {glasses}, {thug} markers into React nodes */
const ICON_PATTERN = /\{(claw|glasses|thug)\}/g;

function renderWithIcons(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  ICON_PATTERN.lastIndex = 0;
  while ((match = ICON_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const variant = match[1] as ClawVariant;
    parts.push(<ClawIcon key={`icon-${key++}`} variant={variant} size={18} className="mx-0.5" />);
    ({ lastIndex } = ICON_PATTERN);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

interface ChatPanelProps {
  onClose: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [rateLimited, setRateLimited] = useState(() => getChatMessageCount() >= MAX_MESSAGES_PER_SESSION);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isTyping || rateLimited) return;

    const count = incrementChatMessageCount();
    if (count >= MAX_MESSAGES_PER_SESSION) {
      setRateLimited(true);
    }

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const response = matchResponse(text);
    setTimeout(
      () => {
        const agentMsg: Message = { id: `b-${Date.now()}`, role: 'agent', text: response };
        setMessages(prev => [...prev, agentMsg]);
        setIsTyping(false);
        sfxChat();
      },
      TYPING_DELAY_MS + Math.random() * 600,
    );
  }, [input, isTyping, rateLimited]);

  return (
    <div
      className="fixed bottom-24 right-4 z-[99] w-[min(360px,calc(100vw-32px))] h-[420px] flex flex-col glass rounded-lg overflow-hidden animate-slide-in"
      data-testid="chat-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-bg-secondary">
        <div className="flex items-center gap-2">
          <ClawIcon variant="thug" size={24} animate="breathe" />
          <span className="font-mono text-[var(--text-sm)] font-bold text-text-primary">Mystery Keeper</span>
        </div>
        <button
          data-testid="chat-close-btn"
          onClick={onClose}
          aria-label="Close chat"
          className="w-8 h-8 flex items-center justify-center rounded text-text-tertiary hover:text-accent-red transition-colors min-w-[44px] min-h-[44px]"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg font-mono text-[var(--text-sm)] leading-relaxed ${msg.role === 'user' ? 'bg-accent-green/15 text-text-primary' : 'bg-bg-tertiary text-text-primary'}`}
            >
              {msg.role === 'agent' ? renderWithIcons(msg.text) : msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-bg-tertiary px-3 py-2 rounded-lg flex items-center gap-2">
              <ClawIcon variant="standard" size={16} animate="bounce" />
              <span className="font-mono text-accent-green text-[var(--text-sm)] animate-typing-bounce inline-block">...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-border-default bg-bg-secondary">
        {rateLimited ? (
          <p className="text-center font-mono text-[var(--text-xs)] text-text-tertiary">
            The Keeper has gone silent. Follow{' '}
            <a
              data-testid="chat-follow-link"
              href="https://x.com/stonkagents"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-green hover:underline"
            >
              @stonkagents
            </a>{' '}
            for more.
          </p>
        ) : (
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2"
          >
            <input
              data-testid="chat-input"
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask the Keeper..."
              maxLength={200}
              className="flex-1 px-3 py-2 bg-bg-input border border-border-default rounded font-mono text-[var(--text-sm)] text-text-primary placeholder:text-text-tertiary focus:border-accent-green focus:outline-none min-h-[44px] transition-colors"
            />
            <button
              data-testid="chat-send-btn"
              type="submit"
              disabled={!input.trim() || isTyping}
              className="px-4 py-2 font-mono text-[var(--text-sm)] font-bold text-black bg-accent-green rounded min-h-[44px] min-w-[44px] uppercase hover:scale-105 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
