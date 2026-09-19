/**
 * Purpose: useRaiseBounty POSTs the contract's route with `{ amount }` through
 *          the daemon proxy, returns the updated post when the tracker sends
 *          one (null otherwise, the post being invalidated either way), and
 *          turns the four named refusals into plain toasts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const mockAddToast = vi.fn();
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ toasts: [], addToast: mockAddToast, dismissToast: vi.fn() }),
}));
vi.mock('@/lib/config/app.config', () => ({
  appConfig: { daemonUrl: 'http://localhost:7841/api/v1', apiBaseUrl: 'http://localhost:7842' },
}));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => ({ connected: true }) }));

import { readRaisedPost, useAwardBounty, useRaiseBounty } from '../use-community';
import { queryKeys } from '@/lib/api/keys';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

const raised = {
  id: 'p9',
  author: 'agent-me',
  authorTier: 'Gold',
  title: 'Need Q3 data',
  content: 'Need it',
  tab: 'recent',
  upvotes: 1,
  replies: 1,
  time: '2026-09-10T00:00:00Z',
  tags: [],
  category: 'request',
  viewCount: 3,
  isAuthor: true,
  bounty: {
    amount: 60,
    currency: 'credits',
    daysRemaining: 7,
    status: 'open',
    expires_at: '2026-09-23T00:00:00Z',
    extended: false,
    refunded_at: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRaiseBounty', () => {
  it('POSTs /bounty/raise with the amount and returns the updated post', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: raised }), { status: 200 }));
    const { result } = renderHook(() => useRaiseBounty(), { wrapper: createWrapper() });
    result.current.mutate({ postId: 'p9', amount: 60 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/portal/board/posts/p9/bounty/raise',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ amount: 60 }) }),
    );
    expect(result.current.data?.bounty).toMatchObject({ amount: 60, status: 'open' });
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bounty raised to 60', variant: 'success' }));
  });

  it('returns null for an answer without a post, and still succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }));
    const { result } = renderHook(() => useRaiseBounty(), { wrapper: createWrapper() });
    result.current.mutate({ postId: 'p9', amount: 80 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(readRaisedPost({ post: raised })?.id).toBe('p9');
    expect(readRaisedPost(null)).toBeNull();
  });

  it.each([
    ['INSUFFICIENT_CREDITS', 402, 'Not enough credits to raise the bounty'],
    ['BOUNTY_NOT_AUTHOR', 403, 'Only the author can raise the bounty'],
    ['BOUNTY_NOT_OPEN', 409, 'This bounty is no longer open'],
    ['VALIDATION_ERROR', 400, 'The amount must be above the current bounty'],
  ])('toasts %s plainly', async (code, status, title) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: { code, message: 'no' } }), { status }));
    const { result } = renderHook(() => useRaiseBounty(), { wrapper: createWrapper() });
    result.current.mutate({ postId: 'p9', amount: 60 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockAddToast).toHaveBeenCalledWith({ title, variant: 'error' });
  });
});

describe('useAwardBounty', () => {
  it('refreshes the thread of the awarded post as well as the feed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: raised }), { status: 200 }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useAwardBounty(), { wrapper });
    result.current.mutate({ postId: 'p9', replyId: 'r1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidate.mock.calls.map(c => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.board.post('p9')));
    expect(keys).toContain(JSON.stringify(queryKeys.board.posts));
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bounty awarded' }));
  });
});
