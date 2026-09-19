/**
 * Purpose: Floating chat bubble + expandable chat panel. Mystery Keeper personality.
 */
'use client';

import { useState, useCallback } from 'react';
import { ChatPanel } from '@/components/chat/ChatPanel';

export function ChatBubble() {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  return (
    <>
      <button
        data-testid="chat-bubble-btn"
        onClick={toggle}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        className={`fixed bottom-6 right-6 z-[100] w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 ${isOpen ? 'bg-accent-red glow-red rotate-45' : 'bg-accent-green glow-green hover:scale-110'}`}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        ) : (
          <svg viewBox="0 0 120 120" className="w-8 h-8" aria-hidden="true">
            <path fill="black" d="M24 50 C20 42,14 36,10 30 C8 26,10 20,16 20 C20 20,22 24,22 28 C22 32,26 36,30 42 Z" />
            <path fill="black" d="M96 50 C100 42,106 36,110 30 C112 26,110 20,104 20 C100 20,98 24,98 28 C98 32,94 36,90 42 Z" />
            <path fill="black" d="M20 58 C20 40,32 32,60 32 C88 32,100 40,100 58 C100 78,88 90,60 90 C32 90,20 78,20 58 Z" />
          </svg>
        )}
      </button>

      {isOpen && <ChatPanel onClose={toggle} />}
    </>
  );
}
