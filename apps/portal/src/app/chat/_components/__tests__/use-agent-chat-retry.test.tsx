/**
 * Purpose: useAgentChat keeps the message the agent never answered and resends it on
 *          retryLast, without a second user bubble; a Stop is the owner's choice and arms
 *          no retry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { ApiRequestError } from '@/lib/api/errors';

const agentChat = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/daemon', () => ({
  daemonApi: {
    agentChat,
    agentChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
    agentChatSessions: vi.fn().mockResolvedValue({ sessions: [] }),
  },
}));

import { useAgentChat } from '../use-agent-chat';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  agentChat.mockReset();
  localStorage.clear();
});

describe('useAgentChat retryLast', () => {
  it('resends the failed message once and keeps a single user bubble', async () => {
    agentChat.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ response: 'pong', session_id: 's1' });
    const { result } = renderHook(() => useAgentChat({ userId: 'peer-1' }), { wrapper });
    act(() => result.current.send('ping'));
    await waitFor(() => expect(result.current.error).toBe('network'), { timeout: 5_000 });
    expect(result.current.messages.filter(m => m.role === 'user')).toHaveLength(1);

    act(() => result.current.retryLast());
    await waitFor(() => expect(result.current.messages.some(m => m.role === 'assistant' && m.text === 'pong')).toBe(true), {
      timeout: 5_000,
    });
    expect(result.current.error).toBeNull();
    expect(result.current.messages.filter(m => m.role === 'user')).toHaveLength(1);
    expect(agentChat).toHaveBeenCalledTimes(2);
    expect(agentChat.mock.calls[1][0]).toMatchObject({ messages: [{ role: 'user', content: 'ping' }] });

    /* Nothing left to retry after a success. */
    act(() => result.current.retryLast());
    expect(agentChat).toHaveBeenCalledTimes(2);
  });

  it('arms the retry for a server answer and a relay failure, not for a Stop', async () => {
    agentChat.mockRejectedValueOnce(new ApiRequestError(500, { code: 'INTERNAL_ERROR', message: 'boom' }));
    const { result } = renderHook(() => useAgentChat({ userId: 'peer-1' }), { wrapper });
    act(() => result.current.send('one'));
    await waitFor(() => expect(result.current.error).toBe('server'), { timeout: 5_000 });
    agentChat.mockResolvedValueOnce({ response: 'ok' });
    act(() => result.current.retryLast());
    await waitFor(() => expect(result.current.error).toBeNull(), { timeout: 5_000 });
    expect(agentChat).toHaveBeenCalledTimes(2);

    agentChat.mockImplementationOnce(
      (_body: unknown, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    act(() => result.current.send('two'));
    await waitFor(() => expect(result.current.streaming).toBe(true), { timeout: 5_000 });
    act(() => result.current.abort());
    await waitFor(() => expect(result.current.error).toBe('stopped'), { timeout: 5_000 });
    act(() => result.current.retryLast());
    expect(agentChat).toHaveBeenCalledTimes(3);
  });
});
