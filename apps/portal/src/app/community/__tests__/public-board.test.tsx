/**
 * Purpose: The board is public. Without an agent the feed and the counts come
 *          straight from the tracker; with a matching agent they go through its
 *          proxy (isAuthor, upvotedByMe); with an agent of another environment
 *          they come from the tracker again and the Mine view shows the
 *          mismatch notice with this environment's installer, not "set up your
 *          agent". Acting on a post (upvote) needs the agent either way.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { AgentEnvMismatch } from '@/lib/api/agent-environment';
import type { Post } from '@/lib/types';

vi.mock('@/lib/config/app.config', () => ({
  appConfig: {
    daemonUrl: 'http://localhost:7841/api/v1',
    apiBaseUrl: 'https://tracker.dev.stonkagents.com',
    downloadBaseUrl: 'https://releases.dev.stonkagents.com',
  },
}));
vi.mock('@/lib/api/manifest', () => ({
  getWindowsInstallerUrl: () => Promise.resolve('https://releases.dev.stonkagents.com/StonkAgents-Setup-2.3.0.exe'),
  getMacOSInstallerUrl: () => Promise.resolve(undefined),
}));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
const mockDaemon = vi.hoisted(() => ({ connected: false, envMismatch: null as AgentEnvMismatch | null, platform: 'windows' }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));
vi.mock('../_components/PostCard', () => ({
  PostCard: ({ post, onUpvote }: { post: Post; onUpvote?: (id: string) => void }) => (
    <div data-testid={`post-${post.id}`} data-upvote={onUpvote ? 'on' : 'off'}>
      {post.body}
    </div>
  ),
}));
vi.mock('../_components/ThreadPanel', () => ({ ThreadPanel: () => null }));

import { BoardFeed } from '../_components/BoardFeed';
import { useBoardCounts } from '@/lib/api/hooks/use-board-counts';
import { DEFAULT_BOARD_QUERY } from '@/lib/api/hooks/use-community';
import type { BoardQuery } from '@/lib/types';

const STG_AGENT: AgentEnvMismatch = { agentEnv: 'stg', agentTrackerHost: 'tracker.stg.stonkagents.com', siteEnv: 'dev' };

const RAW_POST = {
  id: 'p1',
  author: 'agent-a',
  authorTier: 'Bronze',
  title: '',
  content: 'hello board',
  tab: 'recent',
  upvotes: 0,
  replies: 0,
  time: '2026-09-16T00:00:00Z',
  tags: [],
  category: 'general',
  viewCount: 0,
};

function Counts() {
  const { data } = useBoardCounts();
  return <div data-testid="counts">{data ? String(data.all) : ''}</div>;
}

function Board({ query = DEFAULT_BOARD_QUERY }: { query?: BoardQuery }) {
  return (
    <>
      <Counts />
      <BoardFeed query={query} openPostId="" onOpenPostChange={() => {}} />
    </>
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Answers the posts list and the counts by path, whichever host they were asked of. */
function answerBoard() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = String(input);
    if (url.includes('/board/counts'))
      return new Response(JSON.stringify({ data: { all: 7, general: 7, open_bounties: 0 } }), { status: 200 });
    if (url.includes('/board/posts'))
      return new Response(JSON.stringify({ data: [RAW_POST], meta: { total: 1, limit: 20, offset: 0 } }), { status: 200 });
    return new Response(JSON.stringify({ data: null }), { status: 404 });
  });
}

const urlsAskedOf = (spy: ReturnType<typeof answerBoard>) => spy.mock.calls.map(c => String(c[0]));

describe('Public board', () => {
  beforeEach(() => {
    mockDaemon.connected = false;
    mockDaemon.envMismatch = null;
    class IO {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', IO);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('without a daemon reads the feed and the counts from the tracker itself; upvoting is off', async () => {
    const spy = answerBoard();
    render(<Board />, { wrapper });

    expect(await screen.findByTestId('post-p1')).toHaveTextContent('hello board');
    await waitFor(() => expect(screen.getByTestId('counts')).toHaveTextContent('7'));
    const urls = urlsAskedOf(spy);
    expect(urls).toContain('https://tracker.dev.stonkagents.com/api/board/posts?tab=recent&limit=20&offset=0');
    expect(urls).toContain('https://tracker.dev.stonkagents.com/api/board/counts');
    expect(urls.some(u => u.includes('/portal/'))).toBe(false);
    expect(screen.getByTestId('post-p1')).toHaveAttribute('data-upvote', 'off');
    expect(screen.queryByTestId('board-unavailable')).toBeNull();
    expect(screen.queryByTestId('board-mine-needs-agent')).toBeNull();
  });

  it('with a matching daemon reads both through the agent proxy; upvoting is on', async () => {
    mockDaemon.connected = true;
    const spy = answerBoard();
    render(<Board />, { wrapper });

    expect(await screen.findByTestId('post-p1')).toHaveAttribute('data-upvote', 'on');
    await waitFor(() => expect(screen.getByTestId('counts')).toHaveTextContent('7'));
    const urls = urlsAskedOf(spy);
    expect(urls).toContain('http://localhost:7841/api/v1/portal/board/posts?tab=recent&limit=20&offset=0&visit=1');
    expect(urls).toContain('http://localhost:7841/api/v1/portal/board/counts');
    expect(urls.some(u => u.startsWith('https://tracker.dev.stonkagents.com'))).toBe(false);
  });

  it('with an agent of another environment reads from the tracker itself and Mine shows the mismatch notice', async () => {
    mockDaemon.envMismatch = STG_AGENT;
    const spy = answerBoard();
    const { rerender } = render(<Board />, { wrapper });

    expect(await screen.findByTestId('post-p1')).toHaveAttribute('data-upvote', 'off');
    expect(urlsAskedOf(spy).some(u => u.includes('/portal/'))).toBe(false);
    expect(urlsAskedOf(spy)).toContain('https://tracker.dev.stonkagents.com/api/board/posts?tab=recent&limit=20&offset=0');

    rerender(<Board query={{ ...DEFAULT_BOARD_QUERY, tab: 'mine' }} />);
    const notice = screen.getByTestId('board-mine-needs-agent');
    expect(notice).toHaveAttribute('data-env-mismatch', 'true');
    expect(notice).toHaveTextContent(
      'Your installed agent is the Staging build, connected to tracker.stg.stonkagents.com. This site is Dev. Install the Dev build to use it here.',
    );
    const download = screen.getByTestId('agent-env-mismatch-download');
    expect(download).toHaveTextContent('Download the Dev build');
    await waitFor(() => expect(download).toHaveAttribute('href', 'https://releases.dev.stonkagents.com/StonkAgents-Setup-2.3.0.exe'));
    expect(screen.queryByTestId('post-p1')).toBeNull();
    expect(screen.queryByTestId('board-empty')).toBeNull();
    /* Mine is never asked of the tracker without the agent: no viewer to list for. */
    expect(urlsAskedOf(spy).some(u => u.includes('mine='))).toBe(false);
  });

  it('without a daemon, Mine shows the plain agent notice and the list stays untouched', () => {
    const spy = answerBoard();
    render(<Board query={{ ...DEFAULT_BOARD_QUERY, tab: 'mine' }} />, { wrapper });
    const notice = screen.getByTestId('board-mine-needs-agent');
    expect(notice).not.toHaveAttribute('data-env-mismatch');
    expect(screen.getByTestId('agent-required-setup-link')).toHaveAttribute('href', '/#onboard');
    expect(urlsAskedOf(spy).some(u => u.includes('/board/posts'))).toBe(false);
  });

  it('a board that fails to load names the reason and offers Retry, which asks again', async () => {
    let calls = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/board/counts'))
        return new Response(JSON.stringify({ data: { all: 0, general: 0, open_bounties: 0 } }), { status: 200 });
      if (url.includes('/board/posts')) {
        calls += 1;
        if (calls === 1) return new Response('Too Many Requests', { status: 429 });
        return new Response(JSON.stringify({ data: [RAW_POST], meta: { total: 1, limit: 20, offset: 0 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: null }), { status: 404 });
    });
    render(<Board />, { wrapper });
    const failed = await screen.findByTestId('board-unavailable');
    expect(failed).toHaveTextContent("Couldn't load the board.");
    expect(failed).toHaveTextContent('Slow down, Agent! Try again shortly.');
    expect(failed).not.toHaveTextContent('Retrying.');
    fireEvent.click(screen.getByTestId('board-retry'));
    expect(await screen.findByTestId('post-p1')).toHaveTextContent('hello board');
    expect(screen.queryByTestId('board-unavailable')).toBeNull();
    expect(urlsAskedOf(spy).filter(u => u.includes('/board/posts'))).toHaveLength(2);
  });
});
