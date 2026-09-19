/**
 * Purpose: Tests for the autopilot hooks: idle while the agent is offline, load
 *          the policy + status (parsed from camel or snake), null when the agent
 *          predates autopilot, a save writes the cache, and approve / dismiss
 *          drop the suggestion and invalidate the thread it answered.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as AutopilotModule from '@/lib/api/daemon-autopilot';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { parseAutopilotSettings } from '@/lib/api/transformers/community';

const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const client = vi.hoisted(() => ({
  getAutopilot: vi.fn(),
  saveAutopilot: vi.fn(),
  getAutopilotSuggestions: vi.fn(),
  approveAutopilotSuggestion: vi.fn(),
  dismissAutopilotSuggestion: vi.fn(),
}));
vi.mock('@/lib/api/daemon-autopilot', async importOriginal => {
  const actual = await importOriginal<typeof AutopilotModule>();
  return { ...actual, ...client };
});

import {
  useApproveSuggestion,
  useAutopilot,
  useAutopilotSuggestions,
  useDismissSuggestion,
  useSaveAutopilot,
  AUTOPILOT_UNSUPPORTED_MESSAGE,
} from '../use-autopilot';
import { queryKeys } from '@/lib/api/keys';

const SETTINGS = parseAutopilotSettings({
  data: {
    policy: { mode: 'suggest', categories: ['request'], daily_credit_cap: 20, max_replies_per_day: 3 },
    status: { enabled: true, replies_today: 1, credits_spent_today: 5, suggestions_pending: 1, last_run_at: '2026-09-15T10:00:00Z' },
  },
})!;

const SUGGESTION = {
  id: 's1',
  postId: 'p1',
  postTitle: 'Need data',
  postAuthorName: 'Alice',
  category: 'request' as const,
  draft: 'We have it.',
  estimatedCredits: 3,
  createdAt: '2026-09-15T09:00:00Z',
  expiresAt: '2026-09-16T09:00:00Z',
};

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAutopilot', () => {
  it('loads the policy and status from the daemon, snake_case parsed to camelCase', async () => {
    client.getAutopilot.mockResolvedValueOnce({ kind: 'ok', value: SETTINGS });
    const { result } = renderHook(() => useAutopilot(), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.data).toEqual(SETTINGS));
    expect(result.current.data?.policy.dailyCreditCap).toBe(20);
    expect(result.current.data?.status.suggestionsPending).toBe(1);
  });

  it('asks nothing while the agent is offline', () => {
    mockDaemon.connected = false;
    const { result } = renderHook(() => useAutopilot(), { wrapper: wrapperFor(makeClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(client.getAutopilot).not.toHaveBeenCalled();
  });

  it('is null when the running agent predates autopilot', async () => {
    client.getAutopilot.mockResolvedValueOnce({ kind: 'unsupported' });
    const { result } = renderHook(() => useAutopilot(), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });
});

describe('useSaveAutopilot', () => {
  it('POSTs the partial policy and writes the answer to the cache', async () => {
    const saved = { ...SETTINGS, policy: { ...SETTINGS.policy, mode: 'auto' as const } };
    client.saveAutopilot.mockResolvedValueOnce({ kind: 'ok', value: saved });
    const qc = makeClient();
    const { result } = renderHook(() => useSaveAutopilot(), { wrapper: wrapperFor(qc) });
    await result.current.mutateAsync({ mode: 'auto' });
    expect(client.saveAutopilot).toHaveBeenCalledWith({ mode: 'auto' });
    expect(qc.getQueryData(queryKeys.daemon.autopilot)).toEqual(saved);
  });

  it('rejects with the update message when the agent has no autopilot surface', async () => {
    client.saveAutopilot.mockResolvedValueOnce({ kind: 'unsupported' });
    const { result } = renderHook(() => useSaveAutopilot(), { wrapper: wrapperFor(makeClient()) });
    await expect(result.current.mutateAsync({ mode: 'off' })).rejects.toMatchObject({
      message: AUTOPILOT_UNSUPPORTED_MESSAGE,
      code: 'UNSUPPORTED',
    });
  });

  it('rejects with the daemon message on a refusal', async () => {
    client.saveAutopilot.mockResolvedValueOnce({ kind: 'error', message: 'cap too high', code: 'INVALID_REQUEST' });
    const { result } = renderHook(() => useSaveAutopilot(), { wrapper: wrapperFor(makeClient()) });
    await expect(result.current.mutateAsync({ dailyCreditCap: 1e9 })).rejects.toMatchObject({ message: 'cap too high' });
  });
});

describe('useAutopilotSuggestions', () => {
  it('loads the inbox and is empty for an agent that predates autopilot', async () => {
    client.getAutopilotSuggestions.mockResolvedValueOnce({ kind: 'ok', value: [SUGGESTION] });
    const { result } = renderHook(() => useAutopilotSuggestions(), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.data).toEqual([SUGGESTION]));

    client.getAutopilotSuggestions.mockResolvedValueOnce({ kind: 'unsupported' });
    const old = renderHook(() => useAutopilotSuggestions(), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(old.result.current.isFetched).toBe(true));
    expect(old.result.current.data).toEqual([]);
  });
});

describe('approve / dismiss', () => {
  it('approve posts through the daemon, drops the row and invalidates the thread', async () => {
    client.approveAutopilotSuggestion.mockResolvedValueOnce({ kind: 'ok', value: { replyId: 'r9' } });
    const qc = makeClient();
    qc.setQueryData(queryKeys.daemon.autopilotSuggestions, [SUGGESTION, { ...SUGGESTION, id: 's2' }]);
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useApproveSuggestion(), { wrapper: wrapperFor(qc) });
    await expect(result.current.mutateAsync(SUGGESTION)).resolves.toEqual({ replyId: 'r9' });
    expect(client.approveAutopilotSuggestion).toHaveBeenCalledWith('s1');
    expect(qc.getQueryData(queryKeys.daemon.autopilotSuggestions)).toEqual([{ ...SUGGESTION, id: 's2' }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.board.post('p1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.board.posts });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.daemon.autopilot });
  });

  it('dismiss drops the row without touching the board', async () => {
    client.dismissAutopilotSuggestion.mockResolvedValueOnce({ kind: 'ok', value: true });
    const qc = makeClient();
    qc.setQueryData(queryKeys.daemon.autopilotSuggestions, [SUGGESTION]);
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useDismissSuggestion(), { wrapper: wrapperFor(qc) });
    await result.current.mutateAsync(SUGGESTION);
    expect(client.dismissAutopilotSuggestion).toHaveBeenCalledWith('s1');
    expect(qc.getQueryData(queryKeys.daemon.autopilotSuggestions)).toEqual([]);
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.board.post('p1') });
  });
});
