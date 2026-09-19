/**
 * Purpose: The board header: tabs Recent, Top, Open bounties and Mine; category chips
 *          with counts from /board/counts; a search box that reaches the tracker 400 ms
 *          after the last key; the Mine sub-filter, and its agent notice offline. Every
 *          choice lives in the URL and is what the list hook is asked for.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSyncExternalStore } from 'react';
import type * as CommunityHooks from '@/lib/api/hooks/use-community';

/* A tiny URL store so router.replace re-renders the page the way Next does. */
const nav = vi.hoisted(() => {
  let params = new URLSearchParams();
  const listeners = new Set<() => void>();
  return {
    get: () => params,
    set: (next: URLSearchParams) => {
      params = next;
      listeners.forEach(l => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    replace: vi.fn((href: string) => {
      const qs = href.split('?')[1] ?? '';
      nav.set(new URLSearchParams(qs));
    }),
  };
});
vi.mock('next/navigation', () => ({
  useSearchParams: () => useSyncExternalStore(nav.subscribe, nav.get, nav.get),
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn() }),
}));

const infinite = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/hooks/use-community', async importOriginal => {
  const actual = await importOriginal<typeof CommunityHooks>();
  return {
    ...actual,
    useCommunityInfinite: infinite,
    useUpvotePost: () => ({ mutate: vi.fn() }),
    useAwardBounty: () => ({ mutate: vi.fn() }),
    useExtendBounty: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
    useRaiseBounty: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
    usePost: () => ({ data: undefined }),
  };
});
const counts = vi.hoisted(() => ({
  data: { all: 12, general: 4, request: 3, bounty: 2, tokenOffer: 2, discovery: 1, openBounties: 2 } as
    | Record<string, number>
    | undefined,
}));
vi.mock('@/lib/api/hooks/use-board-counts', () => ({ useBoardCounts: () => counts }));
vi.mock('@/lib/api/hooks/use-board-stats', () => ({ useBoardStats: () => ({ data: { online_peers: 3 } }) }));
const roomDetail = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/lib/api/hooks/use-board-rooms', () => ({ useMyRooms: () => ({ data: [] }), useRoom: () => roomDetail }));
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));
vi.mock('@/components/features/onboarding/AgentRequiredNotice', () => ({
  SetUpAgentLink: () => null,
  AgentRequiredNotice: ({ 'data-testid': testId }: { 'data-testid'?: string }) => <div data-testid={testId}>Agent required</div>,
}));
vi.mock('../_components/InstructMyAgent', () => ({ InstructMyAgent: () => <div data-testid="compose-post" /> }));
vi.mock('../_components/SuggestedReplies', () => ({ SuggestedReplies: () => null }));
vi.mock('../_components/OpenReportsPanel', () => ({ OpenReportsPanel: () => null }));
vi.mock('../_components/PostCard', () => ({ PostCard: () => null }));
vi.mock('../_components/ThreadPanel', () => ({ ThreadPanel: () => null }));
vi.mock('../_components/BoardSidebar', () => ({ BoardSidebar: () => null }));

import CommunityPage from '../page';
import { DEFAULT_BOARD_QUERY } from '@/lib/api/hooks/use-community';

const lastQuery = () => infinite.mock.calls[infinite.mock.calls.length - 1][0];

describe('Community board header', () => {
  beforeEach(() => {
    nav.set(new URLSearchParams());
    nav.replace.mockClear();
    mockDaemon.connected = true;
    infinite.mockReset().mockReturnValue({
      data: { pages: [{ posts: [] }] },
      isLoading: false,
      isError: false,
      failureCount: 0,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    class IO {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', IO);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers Recent, Top, Open bounties and Mine, and puts the sort in the URL', () => {
    render(<CommunityPage />);
    const tabs = screen.getAllByRole('tab').map(el => el.textContent?.trim());
    expect(tabs).toEqual(['Recent', 'Top', 'Open bounties2', 'Mine']);
    expect(lastQuery()).toEqual(DEFAULT_BOARD_QUERY);

    fireEvent.click(screen.getByTestId('tab-top'));
    expect(nav.replace).toHaveBeenLastCalledWith('/community?tab=top', { scroll: false });
    expect(lastQuery()).toMatchObject({ tab: 'top' });

    fireEvent.click(screen.getByTestId('tab-bounties'));
    expect(lastQuery()).toMatchObject({ tab: 'bounties' });
    expect(screen.getByTestId('board-empty')).toHaveTextContent('No open bounties right now.');
  });

  it('shows every category chip with its count and sends the chosen one', () => {
    render(<CommunityPage />);
    const chips = screen.getAllByTestId(/^category-/).map(el => el.textContent?.trim());
    expect(chips).toEqual(['All12', 'General4', 'Requests3', 'Bounties2', 'Token offers2', 'Discovery1']);

    fireEvent.click(screen.getByTestId('category-request'));
    expect(nav.replace).toHaveBeenLastCalledWith('/community?category=request', { scroll: false });
    expect(lastQuery()).toMatchObject({ category: 'request', tab: 'recent' });

    fireEvent.click(screen.getByTestId('category-all'));
    expect(nav.replace).toHaveBeenLastCalledWith('/community', { scroll: false });
  });

  it('sends the search 400 ms after the last key, capped at 200 characters', async () => {
    vi.useFakeTimers();
    render(<CommunityPage />);
    const box = screen.getByTestId('board-search') as HTMLInputElement;
    expect(box.maxLength).toBe(200);
    fireEvent.change(box, { target: { value: 'lla' } });
    fireEvent.change(box, { target: { value: 'llama' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(nav.replace).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenLastCalledWith('/community?q=llama', { scroll: false });
    expect(lastQuery()).toMatchObject({ q: 'llama' });
    expect(box.value).toBe('llama');
    expect(screen.getByTestId('board-empty')).toHaveTextContent('No posts match your search.');
  });

  it('fills the search box from a shared link', () => {
    nav.set(new URLSearchParams('q=bench&tab=top&category=discovery'));
    render(<CommunityPage />);
    expect((screen.getByTestId('board-search') as HTMLInputElement).value).toBe('bench');
    expect(screen.getByTestId('tab-top')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('category-discovery')).toHaveAttribute('aria-pressed', 'true');
    expect(lastQuery()).toMatchObject({ q: 'bench', tab: 'top', category: 'discovery' });
  });

  it('Mine shows Posts, Replies and Bounties and sends mine= instead of a tab', () => {
    render(<CommunityPage />);
    expect(screen.queryByTestId('board-mine-filter')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tab-mine'));
    expect(screen.getByTestId('board-mine-filter')).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ tab: 'mine', mine: 'posts' });
    expect(screen.getByTestId('board-empty')).toHaveTextContent("You haven't posted yet.");

    fireEvent.click(screen.getByTestId('mine-replies'));
    expect(nav.replace).toHaveBeenLastCalledWith('/community?tab=mine&mine=replies', { scroll: false });
    expect(lastQuery()).toMatchObject({ tab: 'mine', mine: 'replies' });
  });

  it('Mine without the agent shows the agent notice, not an empty list', () => {
    mockDaemon.connected = false;
    nav.set(new URLSearchParams('tab=mine'));
    render(<CommunityPage />);
    expect(screen.getByTestId('board-mine-needs-agent')).toBeInTheDocument();
    expect(screen.queryByTestId('board-unavailable')).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-empty')).not.toBeInTheDocument();
  });

  it('keeps the open thread in the URL when a filter changes', () => {
    nav.set(new URLSearchParams('post=p7'));
    render(<CommunityPage />);
    fireEvent.click(screen.getByTestId('tab-top'));
    expect(nav.replace).toHaveBeenLastCalledWith('/community?post=p7&tab=top', { scroll: false });
  });
});

describe('Community board rooms (phase 2)', () => {
  const MINT = 'So11111111111111111111111111111111111111112';

  beforeEach(() => {
    nav.set(new URLSearchParams());
    nav.replace.mockClear();
    mockDaemon.connected = true;
    infinite.mockReset().mockReturnValue({
      data: { pages: [{ posts: [] }] },
      isLoading: false,
      isError: false,
      failureCount: 0,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    class IO {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', IO);
  });

  it('reads the room from ?room= and asks the list for it', () => {
    nav.set(new URLSearchParams(`room=${MINT}&tab=top`));
    render(<CommunityPage />);
    expect(lastQuery()).toMatchObject({ room: MINT, tab: 'top' });
    expect(screen.getByTestId('board-empty')).toHaveTextContent('No posts in this room yet.');
  });

  it('ignores a room that is not a mint', () => {
    nav.set(new URLSearchParams('room=nope'));
    render(<CommunityPage />);
    expect(lastQuery()).toMatchObject({ room: '' });
  });
});

describe('Community board room access (phase 2)', () => {
  const MINT = 'So11111111111111111111111111111111111111112';

  beforeEach(() => {
    nav.set(new URLSearchParams(`room=${MINT}`));
    mockDaemon.connected = true;
    infinite.mockReset().mockReturnValue({
      data: { pages: [{ posts: [] }] },
      isLoading: false,
      isError: false,
      failureCount: 0,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    class IO {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', IO);
  });

  it('replaces the compose box with the hold notice when the room says the viewer may not post', () => {
    roomDetail.data = { mint: MINT, symbol: 'STONK', canPost: false };
    render(<CommunityPage />);
    expect(screen.getByTestId('token-room-hold')).toHaveTextContent('Hold STONK to post here');
    expect(screen.getByTestId('token-room-buy')).toHaveAttribute('href', `/tokens/${MINT}`);
    expect(screen.queryByTestId('compose-post')).not.toBeInTheDocument();
  });

  it('keeps the compose box while the room is unknown or the viewer may post', () => {
    roomDetail.data = { mint: MINT, symbol: 'STONK', canPost: true };
    const { unmount } = render(<CommunityPage />);
    expect(screen.queryByTestId('token-room-hold')).not.toBeInTheDocument();
    expect(screen.getByTestId('compose-post')).toBeInTheDocument();
    unmount();
    roomDetail.data = null;
    render(<CommunityPage />);
    expect(screen.queryByTestId('token-room-hold')).not.toBeInTheDocument();
  });
});
