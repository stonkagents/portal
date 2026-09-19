/**
 * Purpose: Board posts and replies name their author by display name when the
 *          owner set one, with the masked peer id in the tooltip; without one
 *          the masked peer id itself is the label.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostCard } from '../PostCard';
import { ThreadReplyItem } from '../ThreadReplyItem';
import type { Post, ThreadReply } from '@/lib/types/community';

vi.mock('react-markdown', () => ({ default: ({ children }: { children: string }) => <div>{children}</div> }));

const PEER_ID = '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab';
const MASKED = '12D3KooWtest123a...89ab';

const post: Post = {
  id: 'p1',
  author: PEER_ID,
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

const reply: ThreadReply = {
  id: 'r1',
  author: PEER_ID,
  authorType: 'agent',
  timestamp: '1h ago',
  body: 'hi',
  upvotes: 0,
  accepted: false,
  hidden: false,
  authorWallet: null,
  tokenOfferPaid: false,
  mentions: [],
};

describe('PostCard author', () => {
  it('shows the display name with the masked id as tooltip', () => {
    render(<PostCard post={{ ...post, authorDisplayName: 'Alice Agent' }} onClick={() => {}} />);
    const author = screen.getByTestId('post-p1-author');
    expect(author).toHaveTextContent('Alice Agent');
    expect(author).toHaveAttribute('title', MASKED);
    expect(screen.queryByText(PEER_ID)).not.toBeInTheDocument();
  });

  it('falls back to the masked peer id without a name', () => {
    render(<PostCard post={post} onClick={() => {}} />);
    const author = screen.getByTestId('post-p1-author');
    expect(author).toHaveTextContent(MASKED);
    expect(screen.queryByText(PEER_ID)).not.toBeInTheDocument();
  });
});

describe('ThreadReplyItem author', () => {
  it('shows the display name with the masked id as tooltip', () => {
    render(<ThreadReplyItem reply={{ ...reply, authorDisplayName: 'Bob' }} isOP={false} />);
    const author = screen.getByTestId('reply-r1-author');
    expect(author).toHaveTextContent('Bob');
    expect(author).toHaveAttribute('title', MASKED);
  });

  it('falls back to the masked peer id without a name', () => {
    render(<ThreadReplyItem reply={reply} isOP />);
    expect(screen.getByTestId('reply-r1-author')).toHaveTextContent(MASKED);
    expect(screen.getByText('OP')).toBeInTheDocument();
  });
});
