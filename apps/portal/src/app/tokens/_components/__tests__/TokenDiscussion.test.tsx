/**
 * Purpose: The Discussion tab is the token's room: the board's bar and feed
 *          scoped to the mint, the compose box pre-scoped to the room when the
 *          viewer may post, and "Hold <SYMBOL> to post here" with the Buy link
 *          when not; a token without a room says so.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { BoardQuery, BoardRoomDetail } from '@/lib/types/community';

const roomQuery = vi.hoisted(() => ({ data: undefined as BoardRoomDetail | null | undefined, isFetched: true, isError: false }));
vi.mock('@/lib/api/hooks/use-board-rooms', () => ({ useRoom: () => roomQuery }));
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));
const feedProps = vi.hoisted(() => ({ query: null as BoardQuery | null }));
vi.mock('@/app/community/_components/BoardFeed', () => ({
  BoardFeed: ({ query, above }: { query: BoardQuery; above?: (open: (id: string) => void) => React.ReactNode }) => {
    feedProps.query = query;
    return (
      <div data-testid="feed" data-room={query.room} data-tab={query.tab}>
        {above?.(() => {})}
      </div>
    );
  },
}));
vi.mock('@/app/community/_components/BoardHeader', () => ({
  BoardHeader: ({ query, onChange, roomScoped }: { query: BoardQuery; onChange: (p: Partial<BoardQuery>) => void; roomScoped?: boolean }) => (
    <button data-testid="header" data-room={query.room} data-scoped={roomScoped ? 'true' : 'false'} onClick={() => onChange({ tab: 'top', room: '' })}>
      header
    </button>
  ),
}));
vi.mock('@/app/community/_components/InstructMyAgent', () => ({
  InstructMyAgent: ({ room }: { room: { mint: string; symbol: string } | null }) => (
    <div data-testid="compose" data-room={room?.mint} data-symbol={room?.symbol} />
  ),
}));
vi.mock('@/lib/agent-name', () => ({ AgentName: ({ displayName, peerId }: { displayName: string | null; peerId: string }) => <span>{displayName ?? peerId}</span> }));

import { TokenDiscussion, holdToPostMessage } from '../TokenDiscussion';

const MINT = 'So11111111111111111111111111111111111111112';
const room: BoardRoomDetail = {
  mint: MINT,
  symbol: 'HOUND',
  name: 'Signal Hound',
  imageUrl: null,
  agentPeerId: 'peer-a',
  agentDisplayName: 'hound',
  posts7d: 3,
  membersEstimate: 42,
  lastPostAt: '2026-09-16T10:00:00Z',
  role: 'holder',
  canPost: true,
};

describe('TokenDiscussion', () => {
  beforeEach(() => {
    roomQuery.data = room;
    roomQuery.isFetched = true;
    roomQuery.isError = false;
    mockDaemon.connected = true;
    window.localStorage.clear();
  });

  it('scopes the bar and the feed to the room and keeps the room across filter changes', () => {
    render(<TokenDiscussion mint={MINT} symbol="HOUND" />);
    expect(screen.getByTestId('header')).toHaveAttribute('data-room', MINT);
    expect(screen.getByTestId('header')).toHaveAttribute('data-scoped', 'true');
    expect(screen.getByTestId('feed')).toHaveAttribute('data-room', MINT);
    fireEvent.click(screen.getByTestId('header'));
    expect(screen.getByTestId('feed')).toHaveAttribute('data-tab', 'top');
    expect(screen.getByTestId('feed')).toHaveAttribute('data-room', MINT);
    expect(screen.getByTestId('token-room-stats')).toHaveTextContent('42 holders, 3 posts this week');
    expect(screen.getByTestId('token-room-strip')).toHaveTextContent('hound');
  });

  it('pre-scopes the compose box to the room when the viewer may post', () => {
    render(<TokenDiscussion mint={MINT} symbol="HOUND" />);
    expect(screen.getByTestId('compose')).toHaveAttribute('data-room', MINT);
    expect(screen.getByTestId('compose')).toHaveAttribute('data-symbol', 'HOUND');
    expect(screen.queryByTestId('token-room-hold')).not.toBeInTheDocument();
  });

  it('says to hold the token, with the Buy link, when the viewer may not post', async () => {
    roomQuery.data = { ...room, canPost: false };
    render(<TokenDiscussion mint={MINT} symbol="HOUND" />);
    expect(holdToPostMessage('HOUND')).toBe('Hold HOUND to post here');
    expect(screen.getByTestId('token-room-hold')).toHaveTextContent('Hold HOUND to post here');
    /* No trade panel on this page (no pool, graduated, legacy): the link is the token page itself, not a dead hash. */
    expect(screen.getByTestId('token-room-buy')).toHaveAttribute('href', `/tokens/${MINT}`);
    expect(screen.queryByTestId('compose')).not.toBeInTheDocument();

    /* The trade panel renders once the pool is read: the link follows it to the anchor. */
    const panel = document.createElement('div');
    panel.id = 'trade';
    document.body.appendChild(panel);
    await waitFor(() => expect(screen.getByTestId('token-room-buy')).toHaveAttribute('href', '#trade'));
    panel.remove();
    await waitFor(() => expect(screen.getByTestId('token-room-buy')).toHaveAttribute('href', `/tokens/${MINT}`));
  });

  it('leaves the holder count out when it is unknown or zero', () => {
    roomQuery.data = { ...room, membersEstimate: 0 };
    const { unmount } = render(<TokenDiscussion mint={MINT} symbol="HOUND" />);
    expect(screen.getByTestId('token-room-stats')).toHaveTextContent(/^3 posts this week$/);
    unmount();
    roomQuery.data = { ...room, membersEstimate: null, posts7d: 1 };
    render(<TokenDiscussion mint={MINT} symbol="HOUND" />);
    expect(screen.getByTestId('token-room-stats')).toHaveTextContent(/^1 post this week$/);
  });

  it('says when the token has no room', () => {
    roomQuery.data = null;
    render(<TokenDiscussion mint={MINT} symbol="HOUND" />);
    expect(screen.getByTestId('token-room-missing')).toBeInTheDocument();
    expect(screen.queryByTestId('compose')).not.toBeInTheDocument();
    expect(screen.queryByTestId('token-room-hold')).not.toBeInTheDocument();
  });
});
