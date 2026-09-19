/**
 * Purpose: A thread opened from ?post= follows the latest usePost answer for that id.
 *          usePost answers straight from the tracker (no viewer, isAuthor false) until
 *          the agent is known to be connected, then again through the agent with
 *          isAuthor; whichever lands first, the thread ends up with the agent's answer.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Post } from '@/lib/types/community';
import type * as CommunityHooks from '@/lib/api/hooks/use-community';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('post=p1'),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

const postQuery = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock('@/lib/api/hooks/use-community', async importOriginal => {
  const actual = await importOriginal<typeof CommunityHooks>();
  return {
    ...actual,
    useCommunityInfinite: () => ({
      data: { pages: [{ posts: [] }] },
      isLoading: false,
      isError: false,
      failureCount: 0,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    }),
    useUpvotePost: () => ({ mutate: vi.fn() }),
    useAwardBounty: () => ({ mutate: vi.fn() }),
    useExtendBounty: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
    useRaiseBounty: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
    usePost: () => postQuery,
  };
});
vi.mock('@/lib/api/hooks/use-board-counts', () => ({ useBoardCounts: () => ({ data: undefined }) }));
vi.mock('@/lib/api/hooks/use-board-stats', () => ({ useBoardStats: () => ({ data: { online_peers: 3 } }) }));
vi.mock('@/lib/api/hooks/use-board-rooms', () => ({ useMyRooms: () => ({ data: [] }), useRoom: () => ({ data: null }) }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => ({ connected: true }) }));
vi.mock('@/components/features/onboarding/AgentRequiredNotice', () => ({
  SetUpAgentLink: () => null,
  AgentRequiredNotice: () => null,
}));
vi.mock('../_components/InstructMyAgent', () => ({ InstructMyAgent: () => null }));
vi.mock('../_components/SuggestedReplies', () => ({ SuggestedReplies: () => null }));
vi.mock('../_components/OpenReportsPanel', () => ({ OpenReportsPanel: () => null }));
vi.mock('../_components/PostCard', () => ({ PostCard: () => null }));
vi.mock('../_components/BoardSidebar', () => ({ BoardSidebar: () => null }));
vi.mock('../_components/ThreadPanel', () => ({
  ThreadPanel: ({ post, open }: { post: Post | null; open: boolean }) =>
    post ? (
      <div data-testid="thread-post" data-open={open ? 'true' : 'false'} data-is-author={post.isAuthor ? 'true' : 'false'}>
        {post.id}
      </div>
    ) : null,
}));

import CommunityPage from '../page';

const base: Post = {
  id: 'p1',
  author: 'peer-me',
  authorType: 'agent',
  authorTier: 'gold',
  timestamp: '1h ago',
  body: 'hello',
  tags: [],
  upvotes: 0,
  commentCount: 0,
  category: 'bounty',
  viewCount: 0,
  acceptedReplyId: null,
  hidden: false,
  pinned: false,
  watching: false,
  mentions: [],
  room: null,
  roomPinned: false,
  routedCount: 0,
  bounty: { amount: 200, currency: 'credits', daysRemaining: 3, status: 'open', extended: false, refundedAt: null },
};
const direct: Post = { ...base, isAuthor: false };
const viaAgent: Post = { ...base, isAuthor: true };

describe('Deep-linked thread follows the latest post answer', () => {
  beforeEach(() => {
    postQuery.data = undefined;
    class IO {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', IO);
  });

  it('applies the agent answer when the direct one landed first', () => {
    postQuery.data = direct;
    const { rerender } = render(<CommunityPage />);
    expect(screen.getByTestId('thread-post')).toHaveAttribute('data-open', 'true');
    expect(screen.getByTestId('thread-post')).toHaveAttribute('data-is-author', 'false');

    // The query key flips to via-agent: nothing for a moment, then the viewer-aware post
    postQuery.data = undefined;
    rerender(<CommunityPage />);
    expect(screen.getByTestId('thread-post')).toHaveAttribute('data-open', 'true');
    postQuery.data = viaAgent;
    rerender(<CommunityPage />);
    expect(screen.getByTestId('thread-post')).toHaveAttribute('data-is-author', 'true');
    expect(screen.getByTestId('thread-post')).toHaveAttribute('data-open', 'true');
  });

  it('keeps the agent answer when it landed first', () => {
    postQuery.data = viaAgent;
    const { rerender } = render(<CommunityPage />);
    expect(screen.getByTestId('thread-post')).toHaveAttribute('data-is-author', 'true');

    postQuery.data = undefined;
    rerender(<CommunityPage />);
    expect(screen.getByTestId('thread-post')).toHaveAttribute('data-is-author', 'true');
    expect(screen.getByTestId('thread-post')).toHaveAttribute('data-open', 'true');
  });

  it('ignores an answer for another post', () => {
    postQuery.data = viaAgent;
    const { rerender } = render(<CommunityPage />);
    postQuery.data = { ...direct, id: 'p2' };
    rerender(<CommunityPage />);
    expect(screen.getByTestId('thread-post')).toHaveTextContent('p1');
    expect(screen.getByTestId('thread-post')).toHaveAttribute('data-is-author', 'true');
  });
});
