/**
 * Purpose: The phase 1 board hooks call exactly the contract's routes through
 *          the daemon proxy, with the contract's bodies, and turn the named
 *          refusals into toasts: accept, report, watch, pin, hide, reports,
 *          uphold / dismiss, peers/me, reputation, display names.
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
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

import { useAcceptReply, useReportContent, useWatchPost } from '../use-board-thread';
import { useHideContent, useOpenReports, usePinPost, useResolveReport } from '../use-board-platform';
import { useBoardReputation, useDisplayNameSearch, usePeerMe } from '../use-board-peers';

const PROXY = 'http://localhost:7841/api/v1/portal';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200 });
}

function refused(status: number, code: string, message = 'no') {
  return new Response(JSON.stringify({ error: { code, message } }), { status });
}

function lastCall(): [string, RequestInit] {
  const { calls } = vi.mocked(globalThis.fetch).mock;
  return calls[calls.length - 1] as unknown as [string, RequestInit];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAcceptReply', () => {
  it('POSTs /board/posts/{id}/accept with the reply id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ ok: true }));
    const { result } = renderHook(() => useAcceptReply(), { wrapper: createWrapper() });
    result.current.mutate({ postId: 'p1', replyId: 'r2' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = lastCall();
    expect(url).toBe(`${PROXY}/board/posts/p1/accept`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ reply_id: 'r2' });
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Answer accepted' }));
  });

  it('names the refusal for accepting your own reply', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(refused(409, 'ACCEPT_OWN_REPLY'));
    const { result } = renderHook(() => useAcceptReply(), { wrapper: createWrapper() });
    result.current.mutate({ postId: 'p1', replyId: 'r2' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Not your own reply', variant: 'error' }));
  });
});

describe('useReportContent', () => {
  it('POSTs the post or reply report route with reason and a trimmed note', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok({ ok: true }));
    const { result } = renderHook(() => useReportContent(), { wrapper: createWrapper() });
    result.current.mutate({ target: 'post', id: 'p1', reason: 'spam', note: '  bots  ' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    let [url, init] = lastCall();
    expect(url).toBe(`${PROXY}/board/posts/p1/report`);
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'spam', note: 'bots' });

    result.current.mutate({ target: 'reply', id: 'r1', reason: 'abuse', note: '   ' });
    await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(2));
    [url, init] = lastCall();
    expect(url).toBe(`${PROXY}/board/replies/r1/report`);
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'abuse' });
  });

  it('toasts the duplicate and own-content refusals', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(refused(409, 'REPORT_DUPLICATE')).mockResolvedValueOnce(refused(409, 'REPORT_OWN'));
    const { result } = renderHook(() => useReportContent(), { wrapper: createWrapper() });
    result.current.mutate({ target: 'post', id: 'p1', reason: 'spam' });
    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Already reported' })));
    result.current.mutate({ target: 'post', id: 'p1', reason: 'spam' });
    await waitFor(() => expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Your own content' })));
  });
});

describe('useWatchPost', () => {
  it('POSTs to watch and DELETEs to unwatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok({ ok: true }));
    const { result } = renderHook(() => useWatchPost(), { wrapper: createWrapper() });
    result.current.mutate({ postId: 'p1', watch: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastCall()[0]).toBe(`${PROXY}/board/posts/p1/watch`);
    expect(lastCall()[1].method).toBe('POST');
    result.current.mutate({ postId: 'p1', watch: false });
    await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(2));
    expect(lastCall()[1].method).toBe('DELETE');
  });
});

describe('platform hooks', () => {
  it('pin, hide (post and reply), reports list and uphold / dismiss use the contract routes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok([]));
    const wrapper = createWrapper();
    const pin = renderHook(() => usePinPost(), { wrapper });
    pin.result.current.mutate({ postId: 'p1', pin: true });
    await waitFor(() => expect(pin.result.current.isSuccess).toBe(true));
    expect(lastCall()[0]).toBe(`${PROXY}/board/posts/p1/pin`);
    expect(lastCall()[1].method).toBe('POST');

    const hide = renderHook(() => useHideContent(), { wrapper });
    hide.result.current.mutate({ target: 'reply', id: 'r1', postId: 'p1', hide: false });
    await waitFor(() => expect(hide.result.current.isSuccess).toBe(true));
    expect(lastCall()[0]).toBe(`${PROXY}/board/replies/r1/hide`);
    expect(lastCall()[1].method).toBe('DELETE');

    const resolve = renderHook(() => useResolveReport(), { wrapper });
    resolve.result.current.mutate({ reportId: 'rep1', action: 'uphold' });
    await waitFor(() => expect(resolve.result.current.isSuccess).toBe(true));
    expect(lastCall()[0]).toBe(`${PROXY}/board/reports/rep1/uphold`);

    const reports = renderHook(() => useOpenReports(true), { wrapper });
    await waitFor(() => expect(reports.result.current.isSuccess).toBe(true));
    expect(lastCall()[0]).toBe(`${PROXY}/board/reports?status=open`);
    expect(reports.result.current.data).toEqual([]);
  });

  it('says platform peers only on NOT_PLATFORM', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(refused(403, 'NOT_PLATFORM'));
    const { result } = renderHook(() => usePinPost(), { wrapper: createWrapper() });
    result.current.mutate({ postId: 'p1', pin: true });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Platform peers only' }));
  });
});

describe('peer hooks', () => {
  it('usePeerMe reads GET /peers/me through the agent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok({ peer_id: 'me', platform: true, wallet_address: 'W' }));
    const { result } = renderHook(() => usePeerMe(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastCall()[0]).toBe(`${PROXY}/peers/me`);
    expect(result.current.data).toMatchObject({ peerId: 'me', platform: true, walletAddress: 'W' });
  });

  it('useBoardReputation goes through the agent for the owner and straight to the tracker otherwise', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok({ tier: 'trusted', score: 150, bounties_won: 2 }));
    const wrapper = createWrapper();
    const own = renderHook(() => useBoardReputation('me', true), { wrapper });
    await waitFor(() => expect(own.result.current.isSuccess).toBe(true));
    expect(lastCall()[0]).toBe(`${PROXY}/peers/me/reputation`);
    expect(own.result.current.data).toMatchObject({ tier: 'trusted', score: 150, bountiesWon: 2 });

    const other = renderHook(() => useBoardReputation('peer-x'), { wrapper });
    await waitFor(() => expect(other.result.current.isSuccess).toBe(true));
    expect(lastCall()[0]).toBe('http://localhost:7842/api/peers/peer-x/reputation');
  });

  it('useDisplayNameSearch asks the public route with the prefix and idles when empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok([{ peer_id: 'a', display_name: 'alice', reputation_tier: 'top' }]));
    const wrapper = createWrapper();
    const idle = renderHook(() => useDisplayNameSearch('  '), { wrapper });
    expect(idle.result.current.fetchStatus).toBe('idle');
    const { result } = renderHook(() => useDisplayNameSearch('al'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastCall()[0]).toBe('http://localhost:7842/api/peers/display-names?q=al&limit=8');
    expect(result.current.data).toEqual([{ peerId: 'a', displayName: 'alice', reputationTier: 'top' }]);
  });
});

describe('patchAcceptedReply', () => {
  it('moves the accepted flag to the new reply in every cached replies list and updates the cached post at once', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ok({ ok: true }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
    const replies = [
      { id: 'r1', accepted: true, body: 'a' },
      { id: 'r2', accepted: false, body: 'b' },
    ];
    qc.setQueryData(['board', 'posts', 'p1', 'replies', 'all', 'via-agent'], replies);
    qc.setQueryData(['board', 'posts', 'p1', 'replies', 'hide-auto', 'direct'], replies);
    qc.setQueryData(['board', 'posts', 'p1', 'via-agent'], { id: 'p1', acceptedReplyId: 'r1' });
    qc.setQueryData(['board', 'posts', 'p2', 'replies', 'all', 'via-agent'], replies);

    const { result } = renderHook(() => useAcceptReply(), { wrapper });
    result.current.mutate({ postId: 'p1', replyId: 'r2' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    for (const key of [
      ['board', 'posts', 'p1', 'replies', 'all', 'via-agent'],
      ['board', 'posts', 'p1', 'replies', 'hide-auto', 'direct'],
    ]) {
      expect(qc.getQueryData<{ id: string; accepted: boolean }[]>(key)?.map(r => [r.id, r.accepted])).toEqual([
        ['r1', false],
        ['r2', true],
      ]);
    }
    expect(qc.getQueryData<{ acceptedReplyId: string }>(['board', 'posts', 'p1', 'via-agent'])?.acceptedReplyId).toBe('r2');
    expect(qc.getQueryData<{ id: string; accepted: boolean }[]>(['board', 'posts', 'p2', 'replies', 'all', 'via-agent'])?.[0].accepted).toBe(true);
  });
});
