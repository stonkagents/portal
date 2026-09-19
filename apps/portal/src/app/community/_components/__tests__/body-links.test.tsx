/**
 * Purpose: Our own paths and URLs in a body become links (a bare /tokens/<mint>
 *          and an absolute URL on this site's domain), in markdown for the
 *          cards and as anchors in the thread, beside the mentions; a link
 *          already in markdown is left alone. The "Hide auto posts and
 *          replies" switch is shared and remembered; an auto post carries the
 *          tag replies carry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { config } from '@/config';
import { linkMentionsMarkdown, linkOwnPathsMarkdown, MentionedText, splitLinks } from '../../_lib/mentions';
import { HIDE_AUTO_KEY, setHideAuto, useHideAuto } from '../../_lib/hide-auto';
import { PostCard } from '../PostCard';
import type { Post } from '@/lib/types/community';

vi.mock('react-markdown', () => ({ default: ({ children }: { children: string }) => <div>{children}</div> }));

const MINT = 'So11111111111111111111111111111111111111112';
const DOMAIN = config.brand.domain;

describe('own links in markdown', () => {
  it('links a bare token path and an absolute URL on our domain, keeping the sentence stop out', () => {
    expect(linkOwnPathsMarkdown(`Token page: /tokens/${MINT}`)).toBe(`Token page: [/tokens/${MINT}](/tokens/${MINT})`);
    expect(linkOwnPathsMarkdown(`See https://${DOMAIN}/tokens/${MINT}.`)).toBe(
      `See [https://${DOMAIN}/tokens/${MINT}](https://${DOMAIN}/tokens/${MINT}).`,
    );
    expect(linkOwnPathsMarkdown(`https://www.${DOMAIN}`)).toBe(`[https://www.${DOMAIN}](https://www.${DOMAIN})`);
  });

  it('leaves other hosts, short paths and links already in markdown alone', () => {
    expect(linkOwnPathsMarkdown('see https://example.com/tokens/x and /tokens/short')).toBe('see https://example.com/tokens/x and /tokens/short');
    const already = `[Token page](/tokens/${MINT}) and [https://${DOMAIN}/x](https://${DOMAIN}/x)`;
    expect(linkOwnPathsMarkdown(already)).toBe(already);
  });

  it('links mentions and own paths together', () => {
    const out = linkMentionsMarkdown(`@alice see /tokens/${MINT}`, [{ peerId: 'peer-a', displayName: 'alice' }]);
    expect(out).toBe(`[@alice](/community?agent=peer-a) see [/tokens/${MINT}](/tokens/${MINT})`);
  });
});

describe('own links in the thread', () => {
  it('splits a body into text, mention links and own links', () => {
    const parts = splitLinks(`hi @alice, page /tokens/${MINT}.`, [{ peerId: 'peer-a', displayName: 'alice' }]);
    expect(parts).toEqual([
      { text: 'hi ' },
      { text: '@alice', href: '/community?agent=peer-a', testId: 'mention-peer-a' },
      { text: ', page ' },
      { text: `/tokens/${MINT}`, href: `/tokens/${MINT}`, testId: undefined },
      { text: '.' },
    ]);
  });

  it('renders own links as anchors', () => {
    render(<MentionedText body={`Token page: /tokens/${MINT}`} mentions={[]} data-testid="body" />);
    expect(screen.getByRole('link', { name: `/tokens/${MINT}` })).toHaveAttribute('href', `/tokens/${MINT}`);
    expect(screen.getByTestId('body')).toHaveTextContent(`Token page: /tokens/${MINT}`);
  });
});

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

describe('auto posts', () => {
  beforeEach(() => {
    window.localStorage.removeItem(HIDE_AUTO_KEY);
    setHideAuto(false);
  });

  it('tags a post an autopilot wrote and leaves a typed one alone', () => {
    const { unmount } = render(<PostCard post={{ ...post, auto: true }} onClick={() => {}} />);
    expect(screen.getByTestId('post-p1-auto')).toHaveTextContent('auto');
    unmount();
    render(<PostCard post={post} onClick={() => {}} />);
    expect(screen.queryByTestId('post-p1-auto')).not.toBeInTheDocument();
  });

  it('shares the hide switch and remembers it in this browser', () => {
    function Probe() {
      const [on, set] = useHideAuto();
      return (
        <button data-testid="probe" data-on={on ? 'true' : 'false'} onClick={() => set(!on)}>
          toggle
        </button>
      );
    }
    render(
      <>
        <Probe />
        <Probe />
      </>,
    );
    const [a, b] = screen.getAllByTestId('probe');
    expect(a).toHaveAttribute('data-on', 'false');
    act(() => {
      fireEvent.click(a);
    });
    expect(a).toHaveAttribute('data-on', 'true');
    expect(b).toHaveAttribute('data-on', 'true');
    expect(window.localStorage.getItem(HIDE_AUTO_KEY)).toBe('1');
  });

  it('does not open the thread when a link in the card is clicked', () => {
    const onClick = vi.fn();
    render(<PostCard post={{ ...post, room: { mint: MINT, symbol: 'STONK' } }} onClick={onClick} showRoomChip />);
    fireEvent.click(screen.getByTestId('post-p1-room'));
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('post-p1'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
