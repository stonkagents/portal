/**
 * Purpose: Agent Chat page shell — header, status bar (real credits), compose bar,
 *   and orchestration of chat thread via daemon POST /api/v1/agent/chat and GET history.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils/cn';
import { Icon, EmptyState } from '@/components/ui';
import { useAgentChat } from './_components/use-agent-chat';
import { ChatThread } from './_components/chat-thread';
import { ChatDaemonSetupPanel } from './_components/ChatDaemonSetupPanel';
import { LocalAccessNotice } from '@/components/features/install/LocalAccessNotice';
import { OpenGatewayLink } from './_components/OpenGatewayLink';
import { CommandToolsNotice } from '@/components/layout/CommandToolsNotice';
import { useCommandToolsPending } from '@/lib/api/hooks/use-command-tools';
import { useCredits } from '@/lib/api/hooks/use-credits';
import { useDaemon } from '@/providers/DaemonProvider';
import { useToast } from '@/providers/ToastProvider';
import { daemonApi } from '@/lib/api/daemon';
import { mapAgentHistoryRowsToChatMessages } from '@/lib/api/agent-chat-history-normalize';
import { queryKeys } from '@/lib/api/keys';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, type ChatModel } from '@/lib/api/models';
import { agentAddress } from '@/lib/agent-address';

const MAX_TEXTAREA_HEIGHT = 160;

/** Extract a short preview from the first user message in a session's history. */
async function fetchSessionPreview(sessionId: string, userId: string): Promise<string> {
  try {
    const data = await daemonApi.agentChatHistory(sessionId, userId);
    const msgs = mapAgentHistoryRowsToChatMessages(data.messages ?? []);
    const firstUser = msgs.find(m => m.role === 'user');
    return firstUser?.text?.slice(0, 80) || 'New conversation';
  } catch {
    return 'New conversation';
  }
}

/** Format a timestamp as a relative string (e.g. "2h ago", "Yesterday", "Mar 15"). */
function formatRelativeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { connected: daemonConnected, refresh: refreshDaemon, health, envMismatch } = useDaemon();
  /* The status words: a healthy agent of another build is not "offline", it is the wrong build. */
  const agentStatusLabel = daemonConnected ? 'Agent online' : envMismatch ? 'Wrong agent build' : 'Agent offline';
  const userId = health.peerId?.trim() || '';
  const [model, setModel] = useState<ChatModel>(DEFAULT_CHAT_MODEL);
  const chat = useAgentChat({ userId, contextId: '', model });
  const { send, clearError, retryLast, error: chatError, errorMessage: chatErrorMessage } = chat;
  /** Set to the `q` param value only after a successful auto-send (daemon was reachable). */
  const handledInitialQueryRef = useRef<string | null>(null);
  const qc = useQueryClient();
  const { data: creditData } = useCredits();
  /* The OpenClaw command tools install in the background after the agent is live (2.6.0+); chat waits for them. */
  const { pending: toolsPending } = useCommandToolsPending();
  const { addToast } = useToast();
  // Track whether the initial daemon health check has completed to avoid flashing the setup panel
  const [daemonChecked, setDaemonChecked] = useState(false);
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: [...queryKeys.chat.sessions, userId],
    queryFn: async () => {
      if (!userId) return [];
      try {
        const r = await daemonApi.agentChatSessions(userId);
        return r.sessions;
      } catch {
        return [];
      }
    },
    enabled: daemonConnected && !!userId,
    staleTime: 30_000,
  });
  const sessions = sessionsData ?? [];

  // Fetch first-user-message preview for each session (cached per session ID)
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!sessions.length || !userId) return;
    let cancelled = false;
    const missing = sessions.filter(s => !(s.id in previews));
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async s => {
        const text = await fetchSessionPreview(s.id, userId);
        return { id: s.id, text };
      }),
    ).then(results => {
      if (cancelled) return;
      setPreviews(prev => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.text;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [sessions, userId, previews]);

  // Sessions sorted newest-first (backend already sorts, but be safe)
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [sessions],
  );

  // On load, check daemon health then restore the last session
  useEffect(() => {
    void refreshDaemon().then(() => setDaemonChecked(true));
  }, [refreshDaemon]);

  // Once daemon is confirmed connected and peerId is available, restore the most recent session
  const restoredRef = useRef(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  useEffect(() => {
    if (!daemonChecked || !daemonConnected || !userId || restoredRef.current) return;
    restoredRef.current = true;
    chat.loadSavedSession().finally(() => setSessionRestored(true));
  }, [daemonChecked, daemonConnected, userId, chat]);

  useEffect(() => {
    if (chatError === 'upstream') {
      // Daemon is live; the LLM relay behind it (tracker / provider) refused. Show the real reason.
      addToast({
        title: 'Your agent could not get an AI response',
        description: chatErrorMessage
          ? `${chatErrorMessage} Your credits were not charged. Try again in a moment.`
          : 'The AI relay is temporarily unavailable. Your credits were not charged. Try again in a moment.',
        variant: 'warning',
        autoDismiss: false,
        action: { label: 'Retry', onClick: retryLast },
      });
      clearError();
      return;
    }
    if (chatError !== 'network' && chatError !== 'server') return;
    addToast({
      title: chatError === 'server' ? 'Your agent could not answer.' : "Can't reach your agent.",
      description:
        chatError === 'server'
          ? 'Your agent answered with an error. Your credits were not charged. Try again in a moment.'
          : `Check it is running on ${agentAddress()}: use Check connection in the setup panel, or open the home page for full install steps. Your message is kept; Retry sends it again once the agent is back.`,
      variant: 'warning',
      autoDismiss: false,
      action: { label: 'Retry', onClick: retryLast },
    });
    clearError();
  }, [chatError, chatErrorMessage, clearError, addToast, retryLast]);

  // If the home card provides initial text (?q=...), auto-send once session is restored.
  useEffect(() => {
    const q = searchParams.get('q')?.trim();
    if (!q) return;
    if (handledInitialQueryRef.current === q) return;

    if (!daemonConnected || !sessionRestored) {
      setDraft(prev => (prev.trim() ? prev : q));
      return;
    }

    handledInitialQueryRef.current = q;
    setDraft('');
    send(q);
  }, [searchParams, send, daemonConnected, sessionRestored]);
  const hasDraft = draft.trim().length > 0;
  const balance = creditData?.total ?? null;
  const paidBalance = creditData?.paid_balance ?? 0;
  const trialRemaining = creditData?.detailed_trial_remaining ?? 0;

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  const sendFromComposer = useCallback(
    (text: string) => {
      if (!daemonConnected) {
        addToast({
          title: 'Your agent is offline.',
          description: `Start it on this machine (${agentAddress()}), then try again. Use the setup panel to download and verify.`,
          variant: 'warning',
        });
        return;
      }
      send(text);
    },
    [daemonConnected, send, addToast],
  );

  const handleSend = useCallback(() => {
    if (!draft.trim()) return;
    sendFromComposer(draft.trim());
    setDraft('');
    const el = textareaRef.current;
    if (el) el.style.height = 'auto';
  }, [draft, sendFromComposer]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      adjustHeight();
    },
    [adjustHeight],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const ok = await chat.loadHistory(sessionId);
      if (ok) qc.invalidateQueries({ queryKey: queryKeys.chat.sessions });
    },
    [chat, qc],
  );

  /* The page fills the viewport below whatever chrome sits above it (navbar, update or kill
     banner), so the composer is on screen without scrolling; --chat-top is the page's own offset,
     re-measured as banners come and go. Below 900px the bottom tab bar is subtracted too. */
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const measure = () => el.style.setProperty('--chat-top', `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div
      ref={pageRef}
      className="flex flex-col h-[calc(100dvh-var(--chat-top,56px)-76px-env(safe-area-inset-bottom))] lg:h-[calc(100dvh-var(--chat-top,56px))] w-full md:max-w-[1400px] md:mx-auto overflow-hidden"
      data-testid="chat-page"
    >
      {/* The browser's local network permission, above the offline state and the setup panel: without it the agent never answers. */}
      <LocalAccessNotice priority={1} className="mx-4 mt-3 shrink-0" />
      {daemonChecked && <ChatDaemonSetupPanel daemonConnected={daemonConnected} onRefreshDaemon={refreshDaemon} />}
      {/* Header — sticky */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-bg-secondary shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => router.back()}
            className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 rounded border border-border-default bg-transparent text-text-secondary text-xs font-medium min-h-[44px] min-w-[44px] justify-center hover:border-accent-green hover:text-accent-green transition-colors"
            aria-label="Close chat"
            data-testid="ac-close-chat"
          >
            <Icon name="chevron-left" size="sm" />
            <span className="hidden sm:inline">Close</span>
          </button>
          <h1 className="text-base font-bold text-text-primary flex items-center gap-2 truncate">
            <Icon name="terminal" className="text-accent-green shrink-0" /> Agent Chat
          </h1>
          <span
            data-testid="ac-session-badge"
            className={cn(
              'shrink-0 inline-block px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide',
              daemonConnected ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-red/15 text-accent-red',
            )}
          >
            {agentStatusLabel}
          </span>
        </div>
        {chat.streaming && (
          <button
            data-testid="ac-stop-btn"
            onClick={chat.abort}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-accent-red bg-transparent text-accent-red text-xs font-medium min-h-[36px] hover:bg-accent-red/10 transition-colors shrink-0"
          >
            <span className="w-3 h-3 rounded-sm bg-accent-red" /> Stop
          </button>
        )}
      </div>

      {/* Insufficient credits banner */}
      {chat.error === 'insufficient_credits' && (
        <div
          data-testid="ac-insufficient-credits"
          className="flex items-center justify-between gap-2 px-4 py-2 bg-accent-yellow/10 border-b border-accent-yellow/30 text-xs text-text-primary shrink-0"
        >
          <span>Not enough credits. Top up in Settings to continue.</span>
          <Link href="/settings" className="font-medium text-accent-green hover:underline" onClick={chat.clearError}>
            Top up
          </Link>
        </div>
      )}

      {/* Detailed mode requires paid credits (free credits + trial both exhausted). */}
      {chat.error === 'paid_credits_required' && (
        <div
          data-testid="ac-paid-credits-required"
          className="flex items-center justify-between gap-2 px-4 py-2 bg-accent-yellow/10 border-b border-accent-yellow/30 text-xs text-text-primary shrink-0"
        >
          <span>Detailed mode requires paid credits. Top up to keep using it, or switch to Fast mode.</span>
          <Link href="/settings" className="font-medium text-accent-green hover:underline" onClick={chat.clearError}>
            Top up
          </Link>
        </div>
      )}

      {/* Has some paid credits but not enough for detailed (75). */}
      {chat.error === 'insufficient_paid_credits' && (
        <div
          data-testid="ac-insufficient-paid-credits"
          className="flex items-center justify-between gap-2 px-4 py-2 bg-accent-yellow/10 border-b border-accent-yellow/30 text-xs text-text-primary shrink-0"
        >
          <span>Not enough paid credits for detailed mode (need 75). Top up or switch to Fast.</span>
          <Link href="/settings" className="font-medium text-accent-green hover:underline" onClick={chat.clearError}>
            Top up
          </Link>
        </div>
      )}

      {/* Session expired banner (e.g. 401 from tracker) */}
      {chat.error === 'session_expired' && (
        <div
          data-testid="ac-session-expired"
          className="flex items-center justify-between gap-2 px-4 py-2 bg-accent-yellow/10 border-b border-accent-yellow/30 text-xs text-text-primary shrink-0"
        >
          <span>Session expired. Reconnect your agent to continue.</span>
          <button type="button" className="font-medium text-accent-green hover:underline" onClick={chat.clearError}>
            Dismiss
          </button>
        </div>
      )}

      {/* Status Bar */}
      <div
        data-testid="ac-status-bar"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 border-b border-border-default bg-bg-primary text-xs text-text-secondary shrink-0"
      >
        <span className={cn('w-2 h-2 rounded-full animate-status-pulse', daemonConnected ? 'bg-accent-green' : 'bg-accent-red')} />
        <span data-testid="ac-status-text">{agentStatusLabel}</span>
        <span className="w-px h-3 bg-border-default" />
        <span data-testid="ac-model-text" title={CHAT_MODELS[model].description}>
          {CHAT_MODELS[model].label} model
        </span>
        <span className="w-px h-3 bg-border-default" />
        <OpenGatewayLink />
        <span className="ml-auto text-text-tertiary flex items-center gap-2" data-testid="ac-credits">
          {daemonConnected && balance !== null ? (
            <>
              <span title="Free credits (Fast mode only)">{(creditData?.free_balance ?? 0).toLocaleString()} free</span>
              <span className="text-text-tertiary/50">·</span>
              <span title="Paid credits (Fast and Detailed)">{paidBalance.toLocaleString()} paid</span>
              {trialRemaining > 0 && (
                <>
                  <span className="text-text-tertiary/50">·</span>
                  <span title="Free Detailed-mode trial calls">{trialRemaining}/3 trial</span>
                </>
              )}
            </>
          ) : (
            'Start your agent to see your balance.'
          )}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar: past conversations */}
        <aside
          className="hidden md:flex w-56 shrink-0 border-r border-border-default bg-bg-secondary flex-col overflow-hidden"
          data-testid="chat-sessions-sidebar"
        >
          <div className="px-3 py-2 border-b border-border-default">
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">History</span>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {!userId ? (
              <div className="px-3 py-4 text-xs text-text-tertiary">Start your agent to see past conversations.</div>
            ) : sessionsLoading ? (
              <div className="px-3 py-4 text-xs text-text-tertiary">Loading…</div>
            ) : sortedSessions.length === 0 ? (
              <EmptyState size="sm" title="No past conversations yet." data-testid="chat-sessions-empty" />
            ) : (
              <ul className="py-1">
                {sortedSessions.map(s => {
                  const isActive = chat.sessionId === s.id;
                  const preview = previews[s.id] ?? 'Loading…';
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectSession(s.id)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 border-l-2 border-transparent hover:bg-bg-tertiary hover:border-accent-green/50 transition-colors',
                          isActive && 'bg-accent-green/10 border-accent-green',
                        )}
                        title={preview}
                        data-testid={`chat-session-${s.id.slice(0, 8)}`}
                      >
                        <div className={cn('text-xs truncate', isActive ? 'text-accent-green' : 'text-text-primary')}>{preview}</div>
                        <div className="text-[10px] text-text-tertiary mt-0.5">{formatRelativeDate(s.updated_at)}</div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {!sessionRestored && daemonConnected ? (
            <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
              <Icon name="terminal" size="sm" className="animate-pulse mr-2" />
              Loading conversation…
            </div>
          ) : (
            <>
              <ChatThread
                messages={chat.messages}
                streaming={chat.streaming}
                streamText={chat.streamText}
                queue={chat.queue}
                onSend={sendFromComposer}
                onRemoveFromQueue={chat.removeFromQueue}
              />
              <div className="border-t border-border-default bg-bg-secondary px-4 py-3 shrink-0">
                {/* Model toggle (Fast vs Detailed)
                      Detailed states: paid >= 75 → cost. paid < 75 + trial > 0 → "trial N/3". both 0 → locked. */}
                <div className="flex justify-center mb-2 max-w-3xl mx-auto">
                  <div
                    className="inline-flex items-center gap-1 p-1 bg-bg-tertiary border border-border-default rounded-full"
                    data-testid="model-toggle"
                  >
                    {(Object.keys(CHAT_MODELS) as ChatModel[]).map(id => {
                      const info = CHAT_MODELS[id];
                      const isDetailed = id === 'gpt-5.4';
                      const isActive = model === id;
                      // Mini: affordable if any balance covers cost.
                      // Detailed: paid balance must cover cost, OR trial calls remain.
                      let affordable: boolean;
                      let costLabel: string;
                      let locked = false;
                      if (isDetailed) {
                        if (paidBalance >= info.cost) {
                          affordable = true;
                          costLabel = String(info.cost);
                        } else if (trialRemaining > 0) {
                          affordable = true;
                          costLabel = `trial ${trialRemaining}/3`;
                        } else {
                          affordable = false;
                          locked = true;
                          costLabel = 'locked';
                        }
                      } else {
                        affordable = Math.floor(balance ?? 0) >= info.cost;
                        costLabel = String(info.cost);
                      }
                      return (
                        <button
                          key={id}
                          type="button"
                          data-testid={`model-toggle-${id}`}
                          onClick={() => {
                            if (!locked) setModel(id);
                          }}
                          disabled={locked}
                          title={locked ? 'Top up to unlock detailed mode' : info.description}
                          className={cn(
                            'min-h-[36px] px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded-full transition-colors flex items-center gap-1.5',
                            isActive ? 'bg-accent-green/15 text-accent-green' : 'text-text-secondary hover:text-text-primary',
                            !affordable && 'opacity-60',
                            locked && 'cursor-not-allowed',
                          )}
                        >
                          <span>{info.label}</span>
                          <span className="text-[10px] text-text-tertiary">({costLabel})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {toolsPending ? (
                  <CommandToolsNotice className="max-w-3xl mx-auto" />
                ) : (
                  <div className="flex items-end gap-2 max-w-3xl mx-auto">
                    <textarea
                      data-testid="agent-chat-input"
                      ref={textareaRef}
                      rows={1}
                      value={draft}
                      onChange={handleChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Message your agent (↵ to send, Shift+↵ for line break)"
                      className="flex-1 min-h-[44px] max-h-[160px] px-3 py-2.5 bg-bg-tertiary border border-border-default rounded-lg text-sm text-text-primary font-mono outline-none resize-none focus:border-accent-green/50 transition-colors"
                    />
                    <button
                      data-testid="agent-chat-send"
                      onClick={handleSend}
                      disabled={!hasDraft || !daemonConnected}
                      title={!daemonConnected ? 'Start your agent to send messages' : 'Send message'}
                      className={cn(
                        'flex items-center justify-center w-11 h-11 rounded-lg transition-all shrink-0',
                        hasDraft && daemonConnected
                          ? 'bg-accent-green text-bg-primary hover:brightness-110 active:brightness-90'
                          : 'bg-bg-tertiary text-text-tertiary cursor-not-allowed',
                      )}
                    >
                      <Icon name="send" size="sm" />
                    </button>
                    <span className="text-[11px] text-text-tertiary hidden sm:block">↵</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
