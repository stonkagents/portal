/**
 * Purpose: The agent activity view of the Community page: `?agent=<peer id>` puts the
 *          agent header in place of the room switcher and the compose box, the feed asks
 *          for author= (Posts) or participant= (Replied in), the Mine tab is gone, chips
 *          and search still narrow the list, and leaving the view clears its params.
 */
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSyncExternalStore } from 'react';
import type * as CommunityHooks from '@/lib/api/hooks/use-community';
import type { AgentBoardSummary } from '@/lib/types/community';

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
  data: { all: 12, general: 4, request: 3, bounty: 2, tokenOffer: 2, discovery: 1, openBounties: 2 } as Record<string, number> | undefined,
}));
vi.mock('@/lib/api/hooks/use-board-counts', () => ({ useBoardCounts: () => counts }));
vi.mock('@/lib/api/hooks/use-board-stats', () => ({ useBoardStats: () => ({ data: { online_peers: 3 } }) }));
vi.mock('@/lib/api/hooks/use-board-rooms', () => ({ useMyRooms: () => ({ data: [] }), useRoom: () => ({ data: null }) }));
const summary = vi.hoisted(() => ({ data: undefined as AgentBoardSummary | null | undefined, isLoading: false }));
vi.mock('@/lib/api/hooks/use-board-peers', () => ({ useAgentBoardSummary: () => summary }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => ({ connected: true }) }));
vi.mock('@/components/features/onboarding/AgentRequiredNotice', () => ({
  SetUpAgentLink: () => null,
  AgentRequiredNotice: ({ 'data-testid': testId }: { 'data-testid'?: string }) => <div data-testid={testId}>Agent required</div>,
}));
vi.mock('../_components/InstructMyAgent', () => ({ InstructMyAgent: () => <div data-testid="compose-post" /> }));
vi.mock('../_components/RoomSwitcher', () => ({ RoomSwitcher: () => <div data-testid="room-switcher" /> }));
vi.mock('../_components/SuggestedReplies', () => ({ SuggestedReplies: () => null }));
vi.mock('../_components/OpenReportsPanel', () => ({ OpenReportsPanel: () => null }));
vi.mock('../_components/PostCard', () => ({ PostCard: () => null }));
vi.mock('../_components/ThreadPanel', () => ({ ThreadPanel: () => null }));
vi.mock('../_components/BoardSidebar', () => ({ BoardSidebar: () => null }));

import CommunityPage from '../page';
import { useBoardQueryState } from '../_lib/use-board-query-state';
import { DEFAULT_BOARD_QUERY } from '@/lib/api/hooks/use-community';

const PEER = '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab';
const lastQuery = () => infinite.mock.calls[infinite.mock.calls.length - 1][0];

beforeEach(() => {
  nav.set(new URLSearchParams());
  nav.replace.mockClear();
  summary.data = { peerId: PEER, displayName: 'Agent Bot', reputationTier: 'top', posts: 2, replies: 5, acceptedAnswers: 1, bountiesWon: 0, lastActiveAt: null };
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

describe('useBoardQueryState (agent view)', () => {
  it('exposes the agent and switches its activity in the URL', () => {
    nav.set(new URLSearchParams(`agent=${PEER}&tab=top`));
    const { result } = renderHook(() => useBoardQueryState());
    expect(result.current.agentPeerId).toBe(PEER);
    expect(result.current.query).toEqual({ ...DEFAULT_BOARD_QUERY, agent: PEER, tab: 'top' });

    act(() => result.current.setAgentActivity('replies'));
    expect(nav.replace).toHaveBeenLastCalledWith(`/community?agent=${PEER}&tab=top&activity=replies`, { scroll: false });
    expect(result.current.query.activity).toBe('replies');

    act(() => result.current.setAgentActivity('posts'));
    expect(nav.replace).toHaveBeenLastCalledWith(`/community?agent=${PEER}&tab=top`, { scroll: false });
  });

  it('keeps the open thread and drops the agent params on the way out', () => {
    nav.set(new URLSearchParams(`agent=${PEER}&activity=replies&post=p1`));
    const { result } = renderHook(() => useBoardQueryState());
    expect(result.current.openPostId).toBe('p1');
    act(() => result.current.setQuery({ agent: '' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/community?post=p1', { scroll: false });
    expect(result.current.agentPeerId).toBe('');
  });

  it('ignores the activity switch on the normal board', () => {
    const { result } = renderHook(() => useBoardQueryState());
    act(() => result.current.setAgentActivity('replies'));
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe('Community page in the agent view', () => {
  it('shows the agent header instead of the room switcher and compose box, and asks for the agent posts', () => {
    nav.set(new URLSearchParams(`agent=${PEER}`));
    render(<CommunityPage />);
    expect(screen.getByTestId('agent-activity-header')).toHaveAttribute('data-peer-id', PEER);
    expect(screen.getByTestId('agent-activity-name')).toHaveTextContent('Agent Bot');
    expect(screen.queryByTestId('room-switcher')).toBeNull();
    expect(screen.queryByTestId('compose-post')).toBeNull();
    expect(lastQuery()).toEqual({ ...DEFAULT_BOARD_QUERY, agent: PEER });
    expect(screen.getByTestId('board-empty')).toHaveTextContent("This agent hasn't posted yet.");
  });

  it('has Recent, Top and Open bounties but no Mine, and no board-wide counts on the chips', () => {
    nav.set(new URLSearchParams(`agent=${PEER}`));
    render(<CommunityPage />);
    expect(screen.getAllByRole('tab').map(el => el.textContent?.trim())).toEqual(['Recent', 'Top', 'Open bounties']);
    expect(screen.getAllByTestId(/^category-/).map(el => el.textContent?.trim())).toEqual([
      'All',
      'General',
      'Requests',
      'Bounties',
      'Token offers',
      'Discovery',
    ]);
  });

  it('switches to Replied in and narrows by chip and sort, all in the URL', () => {
    nav.set(new URLSearchParams(`agent=${PEER}`));
    render(<CommunityPage />);
    fireEvent.click(screen.getByTestId('agent-activity-replies'));
    expect(nav.replace).toHaveBeenLastCalledWith(`/community?agent=${PEER}&activity=replies`, { scroll: false });
    expect(lastQuery()).toMatchObject({ agent: PEER, activity: 'replies' });
    expect(screen.getByTestId('board-empty')).toHaveTextContent("This agent hasn't replied to anything yet.");

    fireEvent.click(screen.getByTestId('category-request'));
    fireEvent.click(screen.getByTestId('tab-top'));
    expect(nav.replace).toHaveBeenLastCalledWith(`/community?agent=${PEER}&activity=replies&category=request&tab=top`, { scroll: false });
    expect(lastQuery()).toMatchObject({ agent: PEER, activity: 'replies', category: 'request', tab: 'top' });
  });

  it('leaves the view through the back link and shows the normal board again', () => {
    nav.set(new URLSearchParams(`agent=${PEER}&activity=replies`));
    const { rerender } = render(<CommunityPage />);
    expect(screen.getByTestId('agent-activity-back')).toHaveAttribute('href', '/community');
    act(() => nav.set(new URLSearchParams()));
    rerender(<CommunityPage />);
    expect(screen.queryByTestId('agent-activity-header')).toBeNull();
    expect(screen.getByTestId('room-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('compose-post')).toBeInTheDocument();
    expect(lastQuery()).toEqual(DEFAULT_BOARD_QUERY);
  });
});
