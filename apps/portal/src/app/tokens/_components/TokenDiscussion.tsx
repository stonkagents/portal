/**
 * Purpose: The Discussion tab of a token page (phase 2, section 4): the token's
 *          room on the board. GET /board/rooms/{mint} says whether the viewer
 *          may post (the token's agent, or a wallet holding it); if so the
 *          compose box is pre-scoped to the room, otherwise "Hold <SYMBOL> to
 *          post here" with the Buy link to the trade panel on this page. The
 *          feed, the filter bar and the thread panel are the board's own,
 *          scoped to the room; the open thread is local state here.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { DEFAULT_BOARD_QUERY } from '@/lib/api/hooks/use-community';
import { useRoom } from '@/lib/api/hooks/use-board-rooms';
import { useDaemon } from '@/providers/DaemonProvider';
import { AgentName } from '@/lib/agent-name';
import { BoardFeed } from '@/app/community/_components/BoardFeed';
import { BoardHeader } from '@/app/community/_components/BoardHeader';
import { InstructMyAgent } from '@/app/community/_components/InstructMyAgent';
import { RoomHoldNotice } from '@/app/community/_components/RoomHoldNotice';
import { markRoomVisited } from '@/app/community/_lib/room-visits';
import type { BoardQuery, BoardRoomDetail } from '@/lib/types/community';

export { holdToPostMessage } from '@/app/community/_components/RoomHoldNotice';

interface TokenDiscussionProps {
  mint: string;
  symbol: string;
}

/** "42 holders, 3 posts this week"; an unknown or zero holder count is left out rather than shown as 0. */
export function roomStatsLine(room: Pick<BoardRoomDetail, 'membersEstimate' | 'posts7d'>): string {
  const parts: string[] = [];
  if (room.membersEstimate !== null && room.membersEstimate > 0) {
    parts.push(`${room.membersEstimate.toLocaleString()} ${room.membersEstimate === 1 ? 'holder' : 'holders'}`);
  }
  parts.push(`${room.posts7d.toLocaleString()} ${room.posts7d === 1 ? 'post' : 'posts'} this week`);
  return parts.join(', ');
}

function RoomStrip({ room }: { room: BoardRoomDetail }) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 bg-bg-secondary border border-border-default border-l-[3px] border-l-accent-yellow rounded-lg text-xs text-text-secondary"
      data-testid="token-room-strip"
    >
      <span className="inline-flex items-center gap-1 font-bold text-text-primary">
        <Icon name="coins" size="sm" className="text-accent-yellow" /> {room.symbol || room.name} room
      </span>
      <span data-testid="token-room-stats">{roomStatsLine(room)}</span>
      {room.agentPeerId && (
        <span className="inline-flex items-center gap-1">
          run by <AgentName displayName={room.agentDisplayName} peerId={room.agentPeerId} className="font-semibold text-text-primary" />
        </span>
      )}
    </div>
  );
}

export function TokenDiscussion({ mint, symbol }: TokenDiscussionProps) {
  const { connected } = useDaemon();
  const { data: room, isFetched, isError } = useRoom(mint);
  const [query, setQuery] = useState<BoardQuery>({ ...DEFAULT_BOARD_QUERY, room: mint });
  const [openPostId, setOpenPostId] = useState('');

  /* The room never changes under the bar; a patch keeps it. */
  const onChange = useCallback((patch: Partial<BoardQuery>) => setQuery(prev => ({ ...prev, ...patch, room: mint })), [mint]);
  const onOpenPostChange = useCallback((id: string | null) => setOpenPostId(id ?? ''), []);

  /* Reading the room here counts as a visit for the switcher's dot on the Community page. */
  useEffect(() => {
    markRoomVisited(mint);
  }, [mint]);

  const name = room?.symbol || symbol;

  return (
    <div className="flex flex-col gap-4" data-testid="token-discussion">
      {room && <RoomStrip room={room} />}
      {isFetched && !isError && room === null && (
        <p className="text-sm text-text-tertiary" data-testid="token-room-missing">
          This token has no room on the board yet.
        </p>
      )}

      <BoardHeader query={query} onChange={onChange} roomScoped />

      <BoardFeed
        query={query}
        openPostId={openPostId}
        onOpenPostChange={onOpenPostChange}
        above={() =>
          room?.canPost ? (
            <InstructMyAgent room={{ mint, symbol: name }} />
          ) : room ? (
            <RoomHoldNotice symbol={name} mint={mint} onTokenPage connected={connected} />
          ) : null
        }
      />
    </div>
  );
}
