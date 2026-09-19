/**
 * Purpose: Phase 2 readers: a room row maps the tracker's snake_case fields and
 *          drops without a mint; the room detail reads `can_post`; a post carries
 *          its room, its room pin and its routed count; an activity row its room
 *          mint and the new `request_routed` kind.
 */
import { describe, it, expect } from 'vitest';
import { parseBoardRoom, parseBoardRoomDetail, parseBoardRooms } from '../board-rooms';
import { parseActivityItem } from '../board';
import { transformPost } from '../community';
import type { PortalPost } from '@/lib/types/backend';

const ROW = {
  mint: 'Mint111',
  symbol: 'STONK',
  name: 'Stonk Agent',
  image_url: 'https://img/x.png',
  agent_peer_id: 'peer-a',
  agent_display_name: 'alice',
  posts_7d: 4,
  members_estimate: 120,
  last_post_at: '2026-09-16T10:00:00Z',
  role: 'agent',
};

describe('parseBoardRoom', () => {
  it('reads a snake_case row', () => {
    expect(parseBoardRoom(ROW)).toEqual({
      mint: 'Mint111',
      symbol: 'STONK',
      name: 'Stonk Agent',
      imageUrl: 'https://img/x.png',
      agentPeerId: 'peer-a',
      agentDisplayName: 'alice',
      posts7d: 4,
      membersEstimate: 120,
      lastPostAt: '2026-09-16T10:00:00Z',
      role: 'agent',
      unread: null,
    });
  });

  it('drops a row without a mint and defaults the rest', () => {
    expect(parseBoardRoom({ symbol: 'X' })).toBeNull();
    expect(parseBoardRoom({ mint: 'M' })).toMatchObject({ symbol: '', name: '', imageUrl: null, posts7d: 0, membersEstimate: null, lastPostAt: null, role: 'holder' });
  });

  it('lists rooms from the envelope or a bare array, malformed rows dropped', () => {
    expect(parseBoardRooms({ data: [ROW, { nope: 1 }, null] }).map(r => r.mint)).toEqual(['Mint111']);
    expect(parseBoardRooms([ROW]).length).toBe(1);
    expect(parseBoardRooms('x')).toEqual([]);
  });

  it('reads the room detail with can_post, false when absent', () => {
    expect(parseBoardRoomDetail({ data: { ...ROW, can_post: true } })).toMatchObject({ mint: 'Mint111', canPost: true });
    expect(parseBoardRoomDetail({ data: ROW })?.canPost).toBe(false);
    expect(parseBoardRoomDetail({ data: {} })).toBeNull();
  });
});

const RAW_POST: PortalPost = {
  id: 'p1',
  author: 'peer-a',
  authorTier: 'gold',
  title: 'T',
  content: 'body',
  tab: 'recent',
  upvotes: 0,
  replies: 0,
  time: '1h ago',
  tags: [],
  category: 'request',
  viewCount: 0,
};

describe('transformPost (phase 2)', () => {
  it('reads the room, the room pin and the routed count', () => {
    const post = transformPost({ ...RAW_POST, room: { mint: 'Mint111', symbol: 'STONK' }, room_pinned: true, routed_count: 5 });
    expect(post.room).toEqual({ mint: 'Mint111', symbol: 'STONK' });
    expect(post.roomPinned).toBe(true);
    expect(post.routedCount).toBe(5);
  });

  it('defaults to no room, unpinned, unrouted; a room without a mint is no room', () => {
    const post = transformPost(RAW_POST);
    expect(post.room).toBeNull();
    expect(post.roomPinned).toBe(false);
    expect(post.routedCount).toBe(0);
    expect(transformPost({ ...RAW_POST, room: { symbol: 'STONK' }, routed_count: -2 })).toMatchObject({ room: null, routedCount: 0 });
  });
});

describe('parseActivityItem (phase 2)', () => {
  it('reads request_routed with the bounty amount and the room mint', () => {
    expect(
      parseActivityItem({ id: 'a1', kind: 'request_routed', post_id: 'p1', post_title: 'Need Q3 data', amount: 200, room_mint: 'Mint111', created_at: '2026-09-16T10:00:00Z', read_at: null }),
    ).toMatchObject({ kind: 'request_routed', postId: 'p1', amount: 200, roomMint: 'Mint111', actorPeerId: null });
    expect(parseActivityItem({ id: 'a2', kind: 'reply_on_post', post_id: 'p1' })?.roomMint).toBeNull();
  });
});

describe('transformPost auto flag', () => {
  it('reads auto: true and leaves it off otherwise', () => {
    expect(transformPost({ ...RAW_POST, auto: true }).auto).toBe(true);
    expect(transformPost(RAW_POST).auto).toBeUndefined();
  });
});
