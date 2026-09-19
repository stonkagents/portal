/**
 * Purpose: A post card tags request and token offer posts by category, the way a bounty
 *          post gets its bounty badge; general posts carry no category tag.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostCard } from '../PostCard';
import type { Post } from '@/lib/types/community';

vi.mock('react-markdown', () => ({ default: ({ children }: { children: string }) => <div>{children}</div> }));

const post: Post = {
  id: 'p1',
  author: '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab',
  authorType: 'agent',
  authorTier: 'gold',
  timestamp: '1h ago',
  body: 'hello',
  tags: [],
  upvotes: 0,
  commentCount: 0,
  category: 'general',
  viewCount: 0,
  acceptedReplyId: null,
  hidden: false,
  pinned: false,
  watching: false,
  mentions: [],
  room: null,
  roomPinned: false,
  routedCount: 0,
};

describe('PostCard category tag', () => {
  it('tags a request post', () => {
    render(<PostCard post={{ ...post, category: 'request' }} onClick={() => {}} />);
    expect(screen.getByTestId('post-p1-category')).toHaveTextContent('Request');
  });

  it('tags a token offer post', () => {
    render(<PostCard post={{ ...post, category: 'token-offer' }} onClick={() => {}} />);
    expect(screen.getByTestId('post-p1-category')).toHaveTextContent('Token offer');
  });

  it('leaves a general post untagged and keeps the bounty badge for a bounty post', () => {
    const { unmount } = render(<PostCard post={post} onClick={() => {}} />);
    expect(screen.queryByTestId('post-p1-category')).not.toBeInTheDocument();
    unmount();

    render(
      <PostCard
        post={{ ...post, category: 'bounty', bounty: { amount: 50, currency: 'credits', daysRemaining: 7, status: 'open', extended: false, refundedAt: null } }}
        onClick={() => {}}
      />,
    );
    expect(screen.queryByTestId('post-p1-category')).not.toBeInTheDocument();
    expect(screen.getByText('Bounty')).toBeInTheDocument();
  });
});

describe('PostCard bounty states', () => {
  const NOW = Date.parse('2026-09-16T12:00:00Z');
  const openBounty = {
    amount: 200,
    currency: 'credits',
    daysRemaining: 3,
    status: 'open' as const,
    expiresAt: '2026-09-19T11:00:00Z',
    extended: false,
    refundedAt: null,
  };

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says when an open bounty expires, from expires_at', () => {
    render(<PostCard post={{ ...post, category: 'bounty', bounty: openBounty }} onClick={() => {}} />);
    expect(screen.getByTestId('post-p1-bounty-expiry')).toHaveTextContent('Expires in 3d');
    expect(screen.queryByTestId('post-p1-bounty-extend')).not.toBeInTheDocument();
  });

  it('falls back to daysRemaining for a tracker without expiry', () => {
    const { expiresAt: _omit, ...legacy } = openBounty;
    void _omit;
    render(<PostCard post={{ ...post, category: 'bounty', bounty: { ...legacy, daysRemaining: 5 } }} onClick={() => {}} />);
    expect(screen.getByTestId('post-p1-bounty-expiry')).toHaveTextContent('Expires in 5d');
  });

  it('offers the author one 7-day extension while open, without opening the thread', () => {
    const onExtend = vi.fn();
    const onClick = vi.fn();
    render(
      <PostCard post={{ ...post, isAuthor: true, category: 'bounty', bounty: openBounty }} onClick={onClick} onExtendBounty={onExtend} />,
    );
    fireEvent.click(screen.getByTestId('post-p1-bounty-extend'));
    expect(onExtend).toHaveBeenCalledWith('p1');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('hides the extension once used, for non-authors, and while the agent is offline', () => {
    const onExtend = vi.fn();
    const { unmount } = render(
      <PostCard
        post={{ ...post, isAuthor: true, category: 'bounty', bounty: { ...openBounty, extended: true } }}
        onClick={() => {}}
        onExtendBounty={onExtend}
      />,
    );
    expect(screen.queryByTestId('post-p1-bounty-extend')).not.toBeInTheDocument();
    expect(screen.getByText('Extended')).toBeInTheDocument();
    unmount();

    const second = render(
      <PostCard post={{ ...post, isAuthor: false, category: 'bounty', bounty: openBounty }} onClick={() => {}} onExtendBounty={onExtend} />,
    );
    expect(screen.queryByTestId('post-p1-bounty-extend')).not.toBeInTheDocument();
    second.unmount();

    render(<PostCard post={{ ...post, isAuthor: true, category: 'bounty', bounty: openBounty }} onClick={() => {}} />);
    expect(screen.queryByTestId('post-p1-bounty-extend')).not.toBeInTheDocument();
  });

  it('reports a refund on an expired bounty, or just that it expired', () => {
    const { unmount } = render(
      <PostCard
        post={{
          ...post,
          category: 'bounty',
          bounty: { ...openBounty, status: 'expired', refundedAt: '2026-09-16T10:00:00Z' },
        }}
        onClick={() => {}}
      />,
    );
    expect(screen.getByTestId('post-p1-bounty-expired')).toHaveTextContent('Expired, 200 credits returned');
    unmount();

    render(<PostCard post={{ ...post, category: 'bounty', bounty: { ...openBounty, status: 'expired' } }} onClick={() => {}} />);
    expect(screen.getByTestId('post-p1-bounty-expired')).toHaveTextContent(/^Expired$/);
  });

  it('leaves a completed bounty as before', () => {
    render(
      <PostCard
        post={{ ...post, isAuthor: true, category: 'bounty', bounty: { ...openBounty, status: 'completed', awardedTo: 'peer-winner-1234567' } }}
        onClick={() => {}}
        onExtendBounty={vi.fn()}
      />,
    );
    expect(screen.getByText(/Awarded to/)).toBeInTheDocument();
    expect(screen.queryByTestId('post-p1-bounty-extend')).not.toBeInTheDocument();
  });
});

describe('PostCard upvote on your own post', () => {
  it('greys the control with the reason and never calls onUpvote', () => {
    const onUpvote = vi.fn();
    render(<PostCard post={{ ...post, isAuthor: true }} onClick={() => {}} onUpvote={onUpvote} />);
    const upvote = screen.getByTestId('post-p1-upvote');
    expect(upvote).toBeDisabled();
    expect(upvote).toHaveAttribute('title', 'You cannot upvote your own post');
    fireEvent.click(upvote);
    expect(onUpvote).not.toHaveBeenCalled();
  });

  it('stays live on someone else\'s post', () => {
    const onUpvote = vi.fn();
    render(<PostCard post={{ ...post, isAuthor: false }} onClick={() => {}} onUpvote={onUpvote} />);
    const upvote = screen.getByTestId('post-p1-upvote');
    expect(upvote).toBeEnabled();
    fireEvent.click(upvote);
    expect(onUpvote).toHaveBeenCalledWith('p1');
  });
});
