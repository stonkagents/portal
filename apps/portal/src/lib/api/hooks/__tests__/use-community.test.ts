/**
 * Purpose: Tests for useCreatePost, useUpvotePost, useReplyToThread mutation hooks
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// Mock useToast before importing hooks
const mockAddToast = vi.fn();
vi.mock('@/providers/ToastProvider', () => ({
  useToast: () => ({ toasts: [], addToast: mockAddToast, dismissToast: vi.fn() }),
}));

// Mock app config
vi.mock('@/lib/config/app.config', () => ({
  appConfig: {
    daemonUrl: 'http://localhost:7841/api/v1',
    apiBaseUrl: 'http://localhost:7842',
  },
}));

// The board list is gated on the agent; the mutations under test do not read it
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

import {
  useCreatePost,
  useUpvotePost,
  useReplyToThread,
  useCommunityInfinite,
  useExtendBounty,
  usePost,
  buildBoardPostsPath,
  DEFAULT_BOARD_QUERY,
} from '../use-community';
import { ApiRequestError } from '@/lib/api/errors';

/** The board list is an infinite query: key [...byTab(tab), limit], data { pages: [{ posts, meta }], pageParams }. */
const RECENT_PAGE_KEY = ['board', 'posts', 'recent', 20] as const;

function seedInfiniteBoardCache<TPost>(qc: QueryClient, posts: TPost[]) {
  qc.setQueryData(RECENT_PAGE_KEY, {
    pages: [{ posts, meta: { total: posts.length, limit: 20, offset: 0 } }],
    pageParams: [0],
  });
}

function firstCachedPost<TPost>(qc: QueryClient): TPost | undefined {
  return qc.getQueryData<{ pages: { posts: TPost[] }[] }>(RECENT_PAGE_KEY)?.pages[0]?.posts[0];
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useCreatePost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST to daemon proxy with correct body', async () => {
    const mockPost = {
      id: 'p1',
      author: 'agent-abc',
      authorTier: 'Bronze',
      title: '',
      content: 'Hello world',
      tab: 'recent',
      upvotes: 0,
      replies: 0,
      time: '2026-02-11T00:00:00Z',
      tags: [],
      upvotedByMe: false,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: mockPost }), { status: 200 }));

    const { result } = renderHook(() => useCreatePost(), { wrapper: createWrapper() });

    result.current.mutate({ body: 'Hello world', tags: [], category: '' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/portal/board/posts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: 'Hello world', tags: [], category: '' }),
      }),
    );
  });

  it('shows error toast on API failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Body is required' } }), { status: 400 }),
    );

    const { result } = renderHook(() => useCreatePost(), { wrapper: createWrapper() });

    result.current.mutate({ body: '', tags: [], category: '' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });
});

describe('useUpvotePost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST to upvote endpoint and returns response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { upvote_count: 5, upvoted_by_me: true } }), { status: 200 }),
    );

    const { result } = renderHook(() => useUpvotePost(), { wrapper: createWrapper() });

    result.current.mutate('post-123');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/portal/board/posts/post-123/upvote',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows error toast on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Post not found' } }), { status: 404 }),
    );

    const { result } = renderHook(() => useUpvotePost(), { wrapper: createWrapper() });

    result.current.mutate('nonexistent');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });

  it('says you cannot upvote your own post on UPVOTE_OWN', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'UPVOTE_OWN', message: 'own post' } }), { status: 409 }),
    );
    const { result } = renderHook(() => useUpvotePost(), { wrapper: createWrapper() });
    result.current.mutate('p1');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockAddToast).toHaveBeenCalledWith({ title: 'You cannot upvote your own post', variant: 'error' });
  });

  it('optimistically toggles upvote in cached query data', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    // Seed cache with a post under the 'recent' tab key
    const seedPost = {
      id: 'p1',
      author: 'agent-abc',
      authorTier: 'Bronze' as const,
      title: '',
      content: 'Hello',
      tab: 'recent' as const,
      upvotes: 3,
      replies: 0,
      time: '2026-02-11T00:00:00Z',
      tags: [] as string[],
      upvotedByMe: false,
    };
    seedInfiniteBoardCache(qc, [seedPost]);

    // Delay the fetch response so we can check optimistic state
    let resolveFetch!: (v: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise(resolve => {
        resolveFetch = resolve;
      }),
    );

    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: qc }, children);
    }

    const { result } = renderHook(() => useUpvotePost(), { wrapper: Wrapper });

    result.current.mutate('p1');

    // Wait for onMutate to fire — cache should reflect optimistic toggle
    await waitFor(() => {
      const cached = firstCachedPost<typeof seedPost>(qc);
      expect(cached?.upvotedByMe).toBe(true);
      expect(cached?.upvotes).toBe(4);
    });

    // Resolve the fetch to complete the mutation
    resolveFetch(new Response(JSON.stringify({ data: { upvote_count: 4, upvoted_by_me: true } }), { status: 200 }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back optimistic update on API error', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const seedPost = {
      id: 'p1',
      author: 'agent-abc',
      authorTier: 'Bronze' as const,
      title: '',
      content: 'Hello',
      tab: 'recent' as const,
      upvotes: 3,
      replies: 0,
      time: '2026-02-11T00:00:00Z',
      tags: [] as string[],
      upvotedByMe: false,
    };
    seedInfiniteBoardCache(qc, [seedPost]);

    // Hold the response until the optimistic toggle has landed, so the rollback is exercised for real
    let rejectFetch!: (v: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise(resolve => {
        rejectFetch = resolve;
      }),
    );

    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: qc }, children);
    }

    const { result } = renderHook(() => useUpvotePost(), { wrapper: Wrapper });

    result.current.mutate('p1');

    await waitFor(() => expect(firstCachedPost<typeof seedPost>(qc)?.upvotedByMe).toBe(true));

    rejectFetch(new Response(JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'Boom' } }), { status: 500 }));

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Cache should have rolled back to original values
    const cached = firstCachedPost<typeof seedPost>(qc);
    expect(cached?.upvotedByMe).toBe(false);
    expect(cached?.upvotes).toBe(3);
  });
});

describe('useReplyToThread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST to replies endpoint with body', async () => {
    const mockReply = {
      id: 'r1',
      postId: 'p1',
      author: 'agent-abc',
      content: 'Great post!',
      time: '2026-02-11T00:00:00Z',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: mockReply }), { status: 200 }));

    const { result } = renderHook(() => useReplyToThread(), { wrapper: createWrapper() });

    result.current.mutate({ postId: 'p1', body: 'Great post!' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/portal/board/posts/p1/replies',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ body: 'Great post!' }),
      }),
    );
  });

  it('shows error toast on API failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'No API key' } }), { status: 401 }),
    );

    const { result } = renderHook(() => useReplyToThread(), { wrapper: createWrapper() });

    result.current.mutate({ postId: 'p1', body: 'test' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });
});

describe('useCommunityInfinite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    mockDaemon.connected = true;
  });

  /* The public reads without an agent are in use-community-public.test.ts. */
  it('leaves Mine idle while the agent is offline: no viewer, nothing to list', () => {
    mockDaemon.connected = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(() => useCommunityInfinite({ ...DEFAULT_BOARD_QUERY, tab: 'mine' }, 20), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads the board through the daemon proxy while connected', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [], meta: { total: 0, limit: 20, offset: 0 } }), { status: 200 }));

    const { result } = renderHook(() => useCommunityInfinite(DEFAULT_BOARD_QUERY, 20), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/v1/portal/board/posts?tab=recent'), expect.anything());
  });
});

describe('buildBoardPostsPath', () => {
  it('sends only the tab and paging by default', () => {
    expect(buildBoardPostsPath(DEFAULT_BOARD_QUERY, 20, 0)).toBe('/board/posts?tab=recent&limit=20&offset=0');
  });

  it('adds category and a trimmed, capped q', () => {
    const path = buildBoardPostsPath({ ...DEFAULT_BOARD_QUERY, tab: 'top', category: 'request', q: '  llama bench  ' }, 10, 20);
    expect(path).toBe('/board/posts?tab=top&category=request&q=llama+bench&limit=10&offset=20');
    const long = buildBoardPostsPath({ ...DEFAULT_BOARD_QUERY, q: 'x'.repeat(250) }, 20, 0);
    expect(new URL(`http://t${long}`).searchParams.get('q')).toHaveLength(200);
  });

  it('sends author= or participant= for an agent activity view, never mine or room', () => {
    const agent = { ...DEFAULT_BOARD_QUERY, agent: 'peer-a', room: 'Mint111' };
    expect(buildBoardPostsPath(agent, 20, 0)).toBe('/board/posts?tab=recent&author=peer-a&limit=20&offset=0');
    expect(buildBoardPostsPath({ ...agent, activity: 'replies', tab: 'top', category: 'request', q: 'x' }, 20, 0)).toBe(
      '/board/posts?tab=top&participant=peer-a&category=request&q=x&limit=20&offset=0',
    );
    expect(buildBoardPostsPath({ ...agent, tab: 'mine', mine: 'replies' }, 20, 0)).toBe('/board/posts?tab=recent&author=peer-a&limit=20&offset=0');
  });

  it('asks for open bounties with tab=bounties', () => {
    expect(buildBoardPostsPath({ ...DEFAULT_BOARD_QUERY, tab: 'bounties' }, 20, 0)).toBe('/board/posts?tab=bounties&limit=20&offset=0');
  });

  it('sends mine=posts|replies|bounties instead of a tab for the Mine view', () => {
    expect(buildBoardPostsPath({ ...DEFAULT_BOARD_QUERY, tab: 'mine', mine: 'replies' }, 20, 0)).toBe(
      '/board/posts?mine=replies&limit=20&offset=0',
    );
    expect(buildBoardPostsPath({ ...DEFAULT_BOARD_QUERY, tab: 'mine', mine: 'bounties', category: 'bounty' }, 20, 0)).toBe(
      '/board/posts?mine=bounties&category=bounty&limit=20&offset=0',
    );
  });
});

describe('useCommunityInfinite params', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes category, q and mine through to the tracker', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ data: [], meta: { total: 0, limit: 20, offset: 0 } }), { status: 200 }));
    const { result } = renderHook(() => useCommunityInfinite({ ...DEFAULT_BOARD_QUERY, tab: 'mine', category: 'request', q: 'q3 data', mine: 'replies' }, 20), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/portal/board/posts?mine=replies&category=request&q=q3+data&limit=20&offset=0',
      expect.anything(),
    );
  });
});

describe('useExtendBounty', () => {
  const extended = {
    id: 'p9',
    author: 'agent-me',
    authorTier: 'Gold',
    title: 'Need Q3 data',
    content: 'Need it',
    tab: 'recent',
    upvotes: 1,
    replies: 0,
    time: '2026-09-10T00:00:00Z',
    tags: [],
    category: 'bounty',
    viewCount: 3,
    isAuthor: true,
    bounty: { amount: 200, currency: 'credits', daysRemaining: 10, status: 'open', expires_at: '2026-09-26T00:00:00Z', extended: true, refunded_at: null },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts to /bounty/extend and returns the updated post with its new expiry', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: extended }), { status: 200 }));
    const { result } = renderHook(() => useExtendBounty(), { wrapper: createWrapper() });
    result.current.mutate('p9');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/portal/board/posts/p9/bounty/extend',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.data?.bounty).toMatchObject({ extended: true, expiresAt: '2026-09-26T00:00:00Z', refundedAt: null });
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bounty extended', variant: 'success' }));
  });

  it("puts the tracker's refusals in our words", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'BOUNTY_ALREADY_EXTENDED', message: 'already extended' } }), { status: 409 }),
    );
    const { result } = renderHook(() => useExtendBounty(), { wrapper: createWrapper() });
    result.current.mutate('p9');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiRequestError);
    expect(mockAddToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Already extended', variant: 'error' }));
  });
});

describe('usePost', () => {
  const raw = {
    id: 'p3',
    author: 'agent-me',
    authorTier: 'Gold',
    title: 'T',
    content: 'c',
    tab: 'recent',
    upvotes: 0,
    replies: 0,
    time: '2026-09-16T00:00:00Z',
    tags: [],
    category: 'bounty',
    viewCount: 1,
    isAuthor: true,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    mockDaemon.connected = true;
  });

  it('reads a deep-linked post through the agent while connected, so isAuthor comes back', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: raw }), { status: 200 }));
    const { result } = renderHook(() => usePost('p3'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:7841/api/v1/portal/board/posts/p3', expect.anything());
    expect(result.current.data?.isAuthor).toBe(true);
  });

  it('falls back to the tracker itself while the agent is offline', async () => {
    mockDaemon.connected = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: raw }), { status: 200 }));
    const { result } = renderHook(() => usePost('p3'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSpy.mock.calls[0][0]).toContain('/api/board/posts/p3');
    expect(fetchSpy.mock.calls[0][0]).not.toContain('/portal/');
  });
});
