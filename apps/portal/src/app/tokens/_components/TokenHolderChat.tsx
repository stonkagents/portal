/**
 * Token detail: holder-only chat with the token owner's LLM.
 *
 * Owner = token creator. Holder = buyer. Only holders can chat; the owner cannot chat with their own LLM.
 * user_id = holder's wallet. context_id = token contract (which owner's LLM). History scoped per (holder, token).
 */

'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui';
import { ClawLogo } from '@/components/brand';
import { useWalletService } from '@/lib/wallet';
import { useHolderBalance } from '@/lib/api/hooks';
import { daemonApi } from '@/lib/api/daemon';
import { mapAgentHistoryRowsToChatMessages } from '@/lib/api/agent-chat-history-normalize';
import { ApiRequestError } from '@/lib/api/errors';
import { ChatThread } from '@/app/chat/_components/chat-thread';
import { AgentRequiredNotice, useAgentRequired } from '@/components/features/onboarding/AgentRequiredNotice';
import type { ChatMessage } from '@/app/chat/_components/use-agent-chat';
import type { PeerTokenListing } from '@/lib/types/backend';
import { agentLabel } from '@/lib/agent-name';
import { cn } from '@/lib/utils/cn';

/** Prefix so the LLM knows which token (owner's agent) is being addressed. */
const TOKEN_CONTEXT_PREFIX = (name: string, symbol: string) => `[Token: ${name} (${symbol})] `;
const TOKEN_CHAT_SESSION_KEY_PREFIX = 'stonkagents-token-chat-session';
const TOKEN_CHAT_SUGGESTIONS = [
  { label: 'Token utility', text: 'What utility does this token provide for holders?' },
  { label: 'Roadmap', text: 'What are the next roadmap milestones for this token?' },
  { label: 'Holder updates', text: 'Any important updates for holders this week?' },
  { label: 'Differentiator', text: 'What makes this token different from similar projects?' },
  { label: 'Value drivers', text: 'What are the main drivers of long-term token value?' },
  { label: 'Risk factors', text: 'What risks should holders be aware of?' },
] as const;
const TOKEN_CHAT_WELCOME_TEXT = 'Ask me about this token: utility, roadmap, holder updates, value drivers, and key risks.';

export function TokenHolderChat({ token }: { token: PeerTokenListing }) {
  const wallet = useWalletService();
  const userId = wallet.publicKey?.trim() ?? '';
  const contextId = token.token_contract_address ?? '';
  // The token's agent answers here; name it the way the rest of the site does.
  const tokenAgentName = agentLabel(token.display_name, token.peer_id);
  const tokenAgentAvatar = token.token_image_url?.trim() || null;
  const { isHolder, loading: balanceLoading } = useHolderBalance(token.token_contract_address, wallet.publicKey ?? null);
  /* The holder's own agent relays this chat to the owner's LLM: without it the chat stays closed. */
  const { connected: agentConnected } = useAgentRequired();
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [queue, setQueue] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const abortRef = useRef(false);
  const sessionStorageKey = `${TOKEN_CHAT_SESSION_KEY_PREFIX}:${userId}:${contextId}`;

  const loadLatestSession = useCallback(async () => {
    if (!expanded || !userId || !contextId) return;
    setHistoryLoading(true);
    try {
      let sid = typeof localStorage !== 'undefined' ? (localStorage.getItem(sessionStorageKey)?.trim() ?? '') : '';
      if (!sid) {
        try {
          const sessions = await daemonApi.agentChatSessions(userId, contextId);
          sid = sessions.sessions?.[0]?.id ?? '';
        } catch {
          sid = '';
        }
      }

      try {
        const data = await daemonApi.agentTokenChatHistory(userId, contextId);
        setMessages(mapAgentHistoryRowsToChatMessages(data.messages ?? []));
      } catch {
        setMessages([]);
      }

      if (sid) {
        setSessionId(sid);
        if (typeof localStorage !== 'undefined') localStorage.setItem(sessionStorageKey, sid);
      } else {
        setSessionId(null);
        if (typeof localStorage !== 'undefined') localStorage.removeItem(sessionStorageKey);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [expanded, userId, contextId, sessionStorageKey]);

  useEffect(() => {
    loadLatestSession();
  }, [loadLatestSession]);

  const sendToDaemon = useCallback(
    async (userText: string) => {
      abortRef.current = false;
      setStreaming(true);
      setStreamText('');
      const content = TOKEN_CONTEXT_PREFIX(token.token_name, token.token_ticker) + userText;
      try {
        const data = await daemonApi.agentChat({
          messages: [{ role: 'user', content }],
          ...(sessionId ? { session_id: sessionId } : {}),
          user_id: userId, // holder (chatter)
          context_id: contextId, // which token = which owner's LLM
        });
        const responseText = typeof data.response === 'string' ? data.response : 'No response from owner.';
        setMessages(prev => [...prev, { role: 'assistant', type: 'text', text: responseText }]);
        if (data.session_id) {
          setSessionId(data.session_id);
          if (typeof localStorage !== 'undefined') localStorage.setItem(sessionStorageKey, data.session_id);
        }
      } catch (error) {
        let fallback = 'Failed to reach owner. Try again.';
        if (error instanceof ApiRequestError) {
          if (error.code === 'OWNER_SELF_CHAT_NOT_ALLOWED') {
            fallback = 'Owners cannot chat with their own token agent.';
          } else if (error.code === 'HOLDER_VERIFICATION_FAILED') {
            fallback = 'Wallet verification failed for this token chat request.';
          } else if (error.code === 'OWNER_OFFLINE') {
            fallback = "The owner's agent is offline. Try again shortly.";
          } else if (error.code === 'TIMEOUT' || error.code === 'EXPIRED') {
            fallback = 'Owner did not respond in time. Please retry.';
          } else if (error.status === 404 && error.code === 'SESSION_NOT_FOUND') {
            setSessionId(null);
            if (typeof localStorage !== 'undefined') localStorage.removeItem(sessionStorageKey);
            fallback = 'Session expired. Please retry.';
          } else if (error.message) {
            fallback = error.message;
          }
        }
        setMessages(prev => [...prev, { role: 'assistant', type: 'text', text: fallback }]);
      } finally {
        setStreaming(false);
        setStreamText('');
      }
    },
    [token.token_name, token.token_ticker, sessionId, userId, contextId, sessionStorageKey],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (streaming) {
        setQueue(prev => [...prev, trimmed]);
        return;
      }
      setMessages(prev => [...prev, { role: 'user', type: 'text', text: trimmed }]);
      sendToDaemon(trimmed);
    },
    [streaming, sendToDaemon],
  );

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  if (balanceLoading || !isHolder) {
    return (
      <div
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-220 rounded-lg lg:bottom-4 border border-border-default bg-bg-secondary px-4 py-2 text-sm text-text-tertiary"
        data-testid="token-holder-chat-gate"
      >
        {!wallet.connected ? 'Connect your wallet to see chat.' : "Buy tokens to unlock chat with this token's owner."}
      </div>
    );
  }

  if (!agentConnected) {
    return (
      <div
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-220 rounded-lg lg:bottom-4 border border-border-default bg-bg-secondary px-4 py-2 text-sm text-text-tertiary"
        data-testid="token-holder-chat-gate"
        data-state="agent-required"
      >
        <AgentRequiredNotice />
      </div>
    );
  }

  return (
    <>
      {/* Collapsed: robotic head floating button (circular, sticky, eye-catching) */}
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Open chat with this token's owner"
          title="Chat with this token's owner"
          className={cn(
            'fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 lg:bottom-4 items-center justify-center rounded-full border border-border-default bg-bg-secondary text-text-primary shadow-lg transition-colors hover:border-accent-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-green/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
          )}
          data-testid="token-holder-chat-toggle"
        >
          <ClawLogo size="sm" className="animate-none drop-shadow-none" />
        </button>
      )}

      {/* Expanded: slide-out panel */}
      {expanded && (
        <ExpandedChatPanel
          tokenName={token.token_name}
          agentName={tokenAgentName}
          agentAvatarUrl={tokenAgentAvatar}
          onMinimize={() => setExpanded(false)}
          messages={messages}
          streaming={streaming}
          streamText={streamText}
          queue={queue}
          historyLoading={historyLoading}
          onSend={send}
          onRemoveFromQueue={removeFromQueue}
          draft={draft}
          setDraft={setDraft}
        />
      )}
    </>
  );
}

function ExpandedChatPanel({
  tokenName,
  agentName,
  agentAvatarUrl,
  onMinimize,
  messages,
  streaming,
  streamText,
  queue,
  historyLoading,
  onSend,
  onRemoveFromQueue,
  draft,
  setDraft,
}: {
  tokenName: string;
  agentName: string;
  agentAvatarUrl: string | null;
  onMinimize: () => void;
  messages: ChatMessage[];
  streaming: boolean;
  streamText: string;
  queue: string[];
  historyLoading: boolean;
  onSend: (text: string) => void;
  onRemoveFromQueue: (index: number) => void;
  draft: string;
  setDraft: (s: string) => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMinimize();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onMinimize]);

  return (
    <div
      className="fixed inset-y-0 right-0 z-210 w-full max-w-md flex flex-col bg-bg-primary border-l border-border-default shadow-xl pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      data-testid="token-holder-chat-panel"
    >
      <div className="flex items-center justify-between shrink-0 border-b border-border-default px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary truncate min-w-0" title={tokenName}>
          Chat: {tokenName}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onMinimize}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border-default text-text-primary bg-bg-secondary hover:border-accent-green hover:text-accent-green transition-colors"
            aria-label="Minimize chat"
            data-testid="token-holder-chat-minimize"
          >
            <Icon name="chevron-down" size="sm" />
            <span>Minimize</span>
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="flex items-center justify-center w-10 h-10 rounded-full border border-border-default text-text-primary bg-bg-secondary hover:bg-accent-red/10 hover:border-accent-red/50 hover:text-accent-red transition-colors"
            aria-label="Close chat"
            data-testid="token-holder-chat-close"
          >
            <Icon name="x" size="sm" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        {historyLoading && (
          <div className="px-4 py-2 text-xs text-text-tertiary border-b border-border-default">Loading past conversation...</div>
        )}
        <ChatThread
          messages={messages}
          streaming={streaming}
          streamText={streamText}
          queue={queue}
          showWelcome
          agentName={agentName}
          agentAvatarUrl={agentAvatarUrl}
          welcomeTitle={agentName}
          welcomeText={TOKEN_CHAT_WELCOME_TEXT}
          suggestions={TOKEN_CHAT_SUGGESTIONS}
          onSend={onSend}
          onRemoveFromQueue={onRemoveFromQueue}
        />
        <div className="border-t border-border-default bg-bg-secondary px-4 py-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim()) {
                    onSend(draft.trim());
                    setDraft('');
                  }
                }
              }}
              placeholder="Message the owner…"
              className="flex-1 min-h-[44px] max-h-[120px] px-3 py-2.5 bg-bg-tertiary border border-border-default rounded-lg text-sm text-text-primary outline-none resize-none focus:border-accent-green/50"
            />
            <button
              type="button"
              onClick={() => {
                if (draft.trim()) {
                  onSend(draft.trim());
                  setDraft('');
                }
              }}
              disabled={!draft.trim()}
              className="flex items-center justify-center w-11 h-11 rounded-lg bg-accent-green text-bg-primary hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Icon name="send" size="sm" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
