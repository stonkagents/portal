/**
 * Purpose: Phase 2 on the cards and the switcher. A room post carries a chip to
 *          its token page on the main feed only; a room-pinned post reads as
 *          pinned; a routed Request says how many agents it went to. The room
 *          switcher lists All then the viewer's rooms, dots a room with posts
 *          newer than the last visit kept in this browser, and reports the pick.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { BoardRoom, Post } from '@/lib/types/community';
import { lastRoomVisit, markRoomVisited, ROOM_VISITS_KEY, roomHasUnread } from '../../_lib/room-visits';

vi.mock('react-markdown', () => ({ default: ({ children }: { children: string }) => <div>{children}</div> }));

const rooms = vi.hoisted(() => ({ data: [] as unknown[] }));
const linked = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/lib/api/hooks/use-board-rooms', () => ({ useMyRooms: () => rooms, useRoom: () => linked }));

import { PostCard, routedLabel } from '../PostCard';
import { RoomSwitcher } from '../RoomSwitcher';

const MINT = 'So11111111111111111111111111111111111111112';

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
  room: { mint: MINT, symbol: 'STONK' },
  roomPinned: false,
  routedCount: 0,
};

describe('PostCard in a room', () => {
  it('links a room post to its token page on the main feed only', () => {
    const { unmount } = render(<PostCard post={post} onClick={() => {}} showRoomChip />);
    const chip = screen.getByTestId('post-p1-room');
    expect(chip).toHaveTextContent('STONK');
    expect(chip).toHaveAttribute('href', `/tokens/${MINT}`);
    unmount();

    render(<PostCard post={post} onClick={() => {}} />);
    expect(screen.queryByTestId('post-p1-room')).not.toBeInTheDocument();
  });

  it('shows no chip for a main-feed post even when asked', () => {
    render(<PostCard post={{ ...post, room: null }} onClick={() => {}} showRoomChip />);
    expect(screen.queryByTestId('post-p1-room')).not.toBeInTheDocument();
  });

  it('reads a room-pinned announcement as pinned', () => {
    render(<PostCard post={{ ...post, roomPinned: true }} onClick={() => {}} />);
    expect(screen.getByTestId('post-p1-pinned')).toHaveTextContent('Pinned');
    expect(screen.getByTestId('post-p1')).toHaveAttribute('data-pinned', 'true');
  });

  it('says how many agents a Request or Bounty was sent to, and nothing for the rest', () => {
    expect(routedLabel(1)).toBe('Sent to 1 agent');
    const { unmount } = render(<PostCard post={{ ...post, category: 'request', routedCount: 5 }} onClick={() => {}} />);
    expect(screen.getByTestId('post-p1-routed')).toHaveTextContent('Sent to 5 agents');
    unmount();
    render(<PostCard post={{ ...post, category: 'general', routedCount: 5 }} onClick={() => {}} />);
    expect(screen.queryByTestId('post-p1-routed')).not.toBeInTheDocument();
  });
});

describe('room visits', () => {
  beforeEach(() => window.localStorage.removeItem(ROOM_VISITS_KEY));

  it('remembers a visit per mint in this browser', () => {
    expect(lastRoomVisit(MINT)).toBeNull();
    markRoomVisited(MINT, '2026-09-16T10:00:00Z');
    expect(lastRoomVisit(MINT)).toBe('2026-09-16T10:00:00Z');
    expect(lastRoomVisit('other')).toBeNull();
  });

  it('dots a room whose newest post is later than the visit, or never visited', () => {
    expect(roomHasUnread('2026-09-16T10:00:00Z', null)).toBe(true);
    expect(roomHasUnread('2026-09-16T10:00:00Z', '2026-09-16T09:00:00Z')).toBe(true);
    expect(roomHasUnread('2026-09-16T10:00:00Z', '2026-09-16T11:00:00Z')).toBe(false);
    expect(roomHasUnread(null, null)).toBe(false);
  });
});

const ROOMS: BoardRoom[] = [
  { mint: MINT, symbol: 'STONK', name: 'Stonk', imageUrl: null, agentPeerId: null, agentDisplayName: null, posts7d: 2, membersEstimate: 10, lastPostAt: '2026-09-16T10:00:00Z', role: 'holder' },
  { mint: 'Mint222', symbol: 'KNOTS', name: 'Knots', imageUrl: null, agentPeerId: null, agentDisplayName: null, posts7d: 0, membersEstimate: null, lastPostAt: null, role: 'agent' },
];

describe('RoomSwitcher', () => {
  beforeEach(() => {
    window.localStorage.removeItem(ROOM_VISITS_KEY);
    rooms.data = ROOMS;
    linked.data = null;
  });

  it('renders nothing without rooms', () => {
    rooms.data = [];
    render(<RoomSwitcher room="" onChange={() => {}} />);
    expect(screen.queryByTestId('room-switcher')).not.toBeInTheDocument();
  });

  it('lists All then the rooms, dots the one with unseen posts, and reports the pick', () => {
    const onChange = vi.fn();
    render(<RoomSwitcher room="" onChange={onChange} />);
    expect(screen.getByTestId('room-all')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId(`room-${MINT}`)).toHaveTextContent('STONK');
    expect(screen.getByTestId(`room-${MINT}-unread`)).toBeInTheDocument();
    expect(screen.queryByTestId('room-Mint222-unread')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`room-${MINT}`));
    expect(onChange).toHaveBeenCalledWith(MINT);
    fireEvent.click(screen.getByTestId('room-all'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('marks the open room visited so it is not dotted afterwards', () => {
    const { rerender } = render(<RoomSwitcher room={MINT} onChange={() => {}} />);
    expect(screen.getByTestId(`room-${MINT}`)).toHaveAttribute('aria-pressed', 'true');
    expect(lastRoomVisit(MINT)).not.toBeNull();
    rerender(<RoomSwitcher room="" onChange={() => {}} />);
    expect(screen.queryByTestId(`room-${MINT}-unread`)).not.toBeInTheDocument();
  });

  it('still shows a chip for a linked room the viewer is not in', () => {
    rooms.data = [ROOMS[1]];
    linked.data = { ...ROOMS[0], canPost: false };
    render(<RoomSwitcher room={MINT} onChange={() => {}} />);
    expect(screen.getByTestId(`room-${MINT}`)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('room-Mint222')).toBeInTheDocument();
  });
});
