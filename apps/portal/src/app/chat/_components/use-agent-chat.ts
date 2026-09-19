/**
 * Purpose: Chat state and send via daemon POST /api/v1/agent/chat; load history via GET .../history/{sessionId}.
 * Main chat: userId = wallet, contextId = ''. Token chat: only holders (buyers) chat with owner's (creator's) LLM; userId = holder wallet, contextId = token contract.
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { daemonApi } from '@/lib/api/daemon';
import { mapAgentHistoryRowsToChatMessages } from '@/lib/api/agent-chat-history-normalize';
import { ApiRequestError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';
import type { ChatModel } from '@/lib/api/models';
import { DEFAULT_CHAT_MODEL } from '@/lib/api/models';

const AGENT_CHAT_SESSION_KEY_PREFIX = 'stonkagents-agent-chat-session';

type MessageRole = 'user' | 'assistant';
type MessageType = 'text' | 'tool';

export interface ChatMessage {
  role: MessageRole;
  type: MessageType;
  text: string;
  toolName?: string;
  toolResult?: string;
}

export type ChatErrorCode =
  | 'insufficient_credits'
  | 'paid_credits_required'
  | 'insufficient_paid_credits'
  | 'network'
  | 'server'
  /** Daemon reached, but its LLM relay (tracker/gateway/provider) failed — see errorMessage. */
  | 'upstream'
  | 'session_expired'
  | 'stopped'
  | null;

/** Daemon error codes meaning "daemon is up, the LLM relay behind it failed" (agent repository, internal/daemon/api.go). */
const UPSTREAM_ERROR_CODES = new Set([
  'TRACKER_ERROR',
  'TRACKER_UNREACHABLE',
  'TRACKER_READ_FAILED',
  'TRACKER_REQUIRED',
  'NOT_REGISTERED',
  'ASK_NOT_CONFIGURED',
  'GATEWAY_ERROR',
  'GATEWAY_READ_FAILED',
  'GATEWAY_INVALID_RESPONSE',
]);

export interface UseAgentChatOptions {
  /** Current user id (e.g. wallet address). Required for session list and history; scopes new sessions to this user. */
  userId: string;
  /** Optional context (e.g. token contract address for token chat). Scopes sessions to this user+context. */
  contextId?: string;
  /** Model to use for chat (defaults to gpt-5.4-mini). */
  model?: ChatModel;
}

export function useAgentChat(options: UseAgentChatOptions) {
  const { userId, contextId = '', model = DEFAULT_CHAT_MODEL } = options;
  const modelRef = useRef<ChatModel>(model);
  modelRef.current = model;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [queue, setQueue] = useState<string[]>([]);
  const [error, setError] = useState<ChatErrorCode>(null);
  /** Human-readable detail for 'upstream' errors (daemon's error.message, e.g. provider quota exhausted). */
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** The last message the agent never answered (network, server or relay failure); Retry resends it. */
  const lastFailedRef = useRef<string | null>(null);
  const sendToDaemonRef = useRef<(text: string) => Promise<void>>(() => Promise.resolve());
  const qc = useQueryClient();
  const getSessionStorageKey = useCallback(
    () => `${AGENT_CHAT_SESSION_KEY_PREFIX}:${userId || 'anonymous'}:${contextId || 'global'}`,
    [userId, contextId],
  );

  const drainQueue = useCallback(() => {
    setQueue(prev => {
      if (prev.length === 0) return prev;
      const [next, ...rest] = prev;
      setTimeout(() => {
        setMessages(m => [...m, { role: 'user', type: 'text', text: next }]);
        sendToDaemonRef.current(next);
      }, 300);
      return rest;
    });
  }, []);

  const sendToDaemon = useCallback(
    async (userText: string) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setError(null);
      setStreaming(true);
      setStreamText('');

      let aborted = false;
      try {
        const body = {
          messages: [{ role: 'user' as const, content: userText }],
          ...(sessionId ? { session_id: sessionId } : {}),
          ...(userId ? { user_id: userId } : {}),
          ...(contextId ? { context_id: contextId } : {}),
          model: modelRef.current,
        };
        const data = await daemonApi.agentChat(body, controller.signal);
        lastFailedRef.current = null;

        const responseText = typeof data.response === 'string' ? data.response : 'No response from agent.';
        setMessages(prev => [...prev, { role: 'assistant', type: 'text', text: responseText }]);

        if (data.session_id) {
          setSessionId(data.session_id);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(getSessionStorageKey(), data.session_id);
          }
          qc.invalidateQueries({ queryKey: queryKeys.chat.sessions });
        }

        qc.invalidateQueries({ queryKey: queryKeys.credits.balance });
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          aborted = true;
          setError('stopped');
          setMessages(prev => [...prev, { role: 'assistant', type: 'text', text: 'Stopped. Credits refunded.' }]);
          // Refund happens server-side on context cancellation; refresh balance to reflect it.
          qc.invalidateQueries({ queryKey: queryKeys.credits.balance });
        } else if (err instanceof ApiRequestError) {
          if (err.status === 402) {
            // Map specific paywall codes for clearer UX
            if (err.code === 'PAID_CREDITS_REQUIRED') {
              setError('paid_credits_required');
            } else if (err.code === 'INSUFFICIENT_PAID_CREDITS') {
              setError('insufficient_paid_credits');
            } else {
              setError('insufficient_credits');
            }
          } else if (err.status === 401) {
            setError('session_expired');
          } else if (err.status === 404 && err.code === 'SESSION_NOT_FOUND') {
            setSessionId(null);
            if (typeof localStorage !== 'undefined') localStorage.removeItem(getSessionStorageKey());
            setError('session_expired');
          } else if (UPSTREAM_ERROR_CODES.has(err.code)) {
            // The daemon answered; the failure is behind it (tracker relay, local gateway, or the LLM provider).
            setErrorMessage(err.message);
            setError('upstream');
          } else {
            setError('server');
          }
        } else {
          setError('network');
        }
        /* A stop is the owner's choice; every other failure leaves the message ready to resend. */
        if (!aborted) lastFailedRef.current = userText;
      } finally {
        abortControllerRef.current = null;
        setStreaming(false);
        setStreamText('');
        if (!aborted) drainQueue();
        else setQueue([]);
      }
    },
    [sessionId, userId, contextId, qc, drainQueue, getSessionStorageKey],
  );

  sendToDaemonRef.current = sendToDaemon;

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (streaming) {
        setQueue(prev => [...prev, trimmed]);
        return;
      }

      setMessages(prev => [...prev, { role: 'user', type: 'text', text: trimmed }]);
      sendToDaemonRef.current(trimmed);
    },
    [streaming],
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  /** Resend the last message that failed; its bubble is already in the thread. */
  const retryLast = useCallback(() => {
    const text = lastFailedRef.current;
    if (!text || abortControllerRef.current) return;
    setError(null);
    setErrorMessage(null);
    sendToDaemonRef.current(text);
  }, []);

  const loadHistory = useCallback(
    async (sid: string | null): Promise<boolean> => {
      if (!userId) return false;
      const token = contextId?.trim() ?? '';
      setHistoryLoading(true);
      setError(null);
      try {
        let data;
        if (token) {
          data = await daemonApi.agentTokenChatHistory(userId, token);
        } else {
          if (!sid?.trim()) return false;
          data = await daemonApi.agentChatHistory(sid.trim(), userId);
        }
        const list = mapAgentHistoryRowsToChatMessages(data.messages ?? []);
        setMessages(list);
        if (token) {
          const resolved = sid?.trim() || null;
          setSessionId(resolved);
          if (typeof localStorage !== 'undefined') {
            if (resolved) localStorage.setItem(getSessionStorageKey(), resolved);
            else localStorage.removeItem(getSessionStorageKey());
          }
        } else {
          setSessionId(sid!.trim());
          if (typeof localStorage !== 'undefined') localStorage.setItem(getSessionStorageKey(), sid!.trim());
        }
        return true;
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 404) {
          if (!token) {
            setSessionId(null);
            if (typeof localStorage !== 'undefined') localStorage.removeItem(getSessionStorageKey());
          }
        }
        return false;
      } finally {
        setHistoryLoading(false);
      }
    },
    [userId, contextId, getSessionStorageKey],
  );

  /** Restore session from localStorage and load history. Call once on mount (e.g. from chat page). No-op if userId is empty. */
  const loadSavedSession = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    if (typeof localStorage === 'undefined') return false;
    const storageKey = getSessionStorageKey();
    const token = contextId?.trim() ?? '';

    if (token) {
      let sid: string | null = localStorage.getItem(storageKey)?.trim() || null;
      if (!sid) {
        try {
          const sessions = await daemonApi.agentChatSessions(userId, contextId);
          sid = sessions.sessions?.[0]?.id?.trim() || null;
        } catch {
          sid = null;
        }
      }
      const restored = await loadHistory(sid);
      return restored;
    }

    const saved = localStorage.getItem(storageKey);
    if (saved?.trim()) {
      const restored = await loadHistory(saved.trim());
      if (restored) return true;
      localStorage.removeItem(storageKey);
    }
    // If no local session is saved, resume latest persisted session for this user/context.
    try {
      const sessions = await daemonApi.agentChatSessions(userId, contextId);
      const latest = sessions.sessions?.[0]?.id;
      if (!latest) return false;
      const restored = await loadHistory(latest);
      if (restored) localStorage.setItem(storageKey, latest);
      return restored;
    } catch {
      return false;
    }
  }, [userId, contextId, loadHistory, getSessionStorageKey]);

  const newSession = useCallback(() => {
    abort();
    setSessionId(null);
    setMessages([]);
    setQueue([]);
    setStreamText('');
    setStreaming(false);
    setError(null);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(getSessionStorageKey());
  }, [abort, getSessionStorageKey]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setErrorMessage(null);
  }, []);

  return {
    messages,
    sessionId,
    streaming,
    streamText,
    queue,
    error,
    errorMessage,
    historyLoading,
    send,
    abort,
    retryLast,
    newSession,
    loadHistory,
    loadSavedSession,
    removeFromQueue,
    clearError,
  };
}
