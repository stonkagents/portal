/**
 * Purpose: The board's side readers: counts map the tracker's `token-offer` and
 *          `open_bounties` keys; the activity feed accepts snake_case rows, drops
 *          rows without an id or with an unknown kind, sorts newest first, and
 *          counts unread itself when the tracker sends no total.
 */
import { describe, it, expect } from 'vitest';
import { parseActivityFeed, parseActivityItem, parseBoardCounts, EMPTY_BOARD_COUNTS } from '../board';
import { transformPost } from '../community';
import type { PortalPost } from '@/lib/types/backend';

describe('parseBoardCounts', () => {
  it('maps every key, with zero for anything missing', () => {
    expect(parseBoardCounts({ data: { all: 5, request: 2, 'token-offer': 1, open_bounties: 3 } })).toEqual({
      all: 5,
      general: 0,
      request: 2,
      bounty: 0,
      tokenOffer: 1,
      discovery: 0,
      openBounties: 3,
    });
    expect(parseBoardCounts(null)).toEqual(EMPTY_BOARD_COUNTS);
    expect(parseBoardCounts({ data: 'nope' })).toEqual(EMPTY_BOARD_COUNTS);
  });
});

describe('parseActivityItem', () => {
  it('reads a snake_case row', () => {
    expect(
      parseActivityItem({
        id: 'a1',
        kind: 'bounty_awarded',
        post_id: 'p1',
        post_title: 'T',
        reply_id: 'r1',
        actor_peer_id: 'peer-2',
        actor_display_name: 'Bob',
        amount: 200,
        created_at: '2026-09-16T10:00:00Z',
        read_at: null,
      }),
    ).toEqual({
      id: 'a1',
      kind: 'bounty_awarded',
      postId: 'p1',
      postTitle: 'T',
      replyId: 'r1',
      actorPeerId: 'peer-2',
      actorDisplayName: 'Bob',
      amount: 200,
      symbol: null,
      decimals: null,
      createdAt: '2026-09-16T10:00:00Z',
      roomMint: null,
      readAt: null,
      reasons: [],
    });
  });

  it('drops rows without an id, without a post, or of a kind it cannot show', () => {
    expect(parseActivityItem({ kind: 'reply_on_post', post_id: 'p1' })).toBeNull();
    expect(parseActivityItem({ id: 'a', kind: 'reply_on_post' })).toBeNull();
    expect(parseActivityItem({ id: 'a', kind: 'something_new', post_id: 'p1' })).toBeNull();
    expect(parseActivityItem('x')).toBeNull();
  });
});

describe('parseActivityFeed', () => {
  it('sorts newest first and takes the unread count from the tracker', () => {
    const feed = parseActivityFeed({
      data: {
        items: [
          { id: 'old', kind: 'post_upvoted', post_id: 'p', created_at: '2026-09-15T10:00:00Z', read_at: '2026-09-15T11:00:00Z' },
          { id: 'new', kind: 'reply_on_post', post_id: 'p', created_at: '2026-09-16T10:00:00Z', read_at: null },
          { id: 'bad' },
        ],
        unread: 7,
      },
    });
    expect(feed.items.map(i => i.id)).toEqual(['new', 'old']);
    expect(feed.unread).toBe(7);
  });

  it('counts unread rows itself without a total, and is empty for nothing', () => {
    const feed = parseActivityFeed({
      items: [
        { id: 'a', kind: 'bounty_expiring', post_id: 'p', created_at: '2026-09-16T10:00:00Z', read_at: null },
        { id: 'b', kind: 'bounty_expired_refunded', post_id: 'p', amount: 50, created_at: '2026-09-16T09:00:00Z', read_at: '2026-09-16T09:30:00Z' },
      ],
    });
    expect(feed.unread).toBe(1);
    expect(parseActivityFeed(undefined)).toEqual({ items: [], unread: 0 });
  });
});

describe('transformPost bounty expiry', () => {
  const raw: PortalPost = {
    id: 'p1',
    author: 'peer-1',
    authorTier: 'Gold',
    title: 'T',
    content: 'c',
    tab: 'recent',
    upvotes: 0,
    replies: 0,
    time: '2026-09-16T10:00:00Z',
    tags: [],
    category: 'bounty',
    viewCount: 0,
    bounty: { amount: 200, currency: 'credits', daysRemaining: 3, status: 'open' },
  };

  it('reads expires_at, extended and refunded_at, snake or camel', () => {
    expect(
      transformPost({
        ...raw,
        bounty: { ...raw.bounty!, expires_at: '2026-09-19T10:00:00Z', extended: true, refunded_at: null },
      }).bounty,
    ).toEqual({ amount: 200, currency: 'credits', daysRemaining: 3, status: 'open', awardedTo: undefined, expiresAt: '2026-09-19T10:00:00Z', extended: true, refundedAt: null });
    expect(
      transformPost({
        ...raw,
        bounty: { ...raw.bounty!, status: 'expired', expiresAt: '2026-09-15T10:00:00Z', refundedAt: '2026-09-15T10:05:00Z' },
      }).bounty,
    ).toMatchObject({ status: 'expired', expiresAt: '2026-09-15T10:00:00Z', extended: false, refundedAt: '2026-09-15T10:05:00Z' });
  });

  it('defaults for a tracker that predates expiry', () => {
    const bounty = transformPost(raw).bounty!;
    expect(bounty.expiresAt).toBeUndefined();
    expect(bounty.extended).toBe(false);
    expect(bounty.refundedAt).toBeNull();
  });
});
