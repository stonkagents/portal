/**
 * Purpose: The room switcher beside the board's tabs (phase 2): All (the main
 *          feed) then every token room the viewer may post in, from
 *          GET /board/rooms?mine=1, each with its symbol and a dot when the
 *          room has posts newer than the viewer's last visit (kept in this
 *          browser). A room reached by link that the viewer is not in is still
 *          listed, from the room itself, so the URL always has a chip.
 *          Selection is URL state: `?room=<mint>`.
 */
'use client';

import { useEffect, useMemo, useReducer } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon } from '@/components/ui';
import { useMyRooms, useRoom } from '@/lib/api/hooks/use-board-rooms';
import { lastRoomVisit, markRoomVisited, roomHasUnread } from '../_lib/room-visits';
import type { BoardRoom } from '@/lib/types/community';

interface RoomSwitcherProps {
  /** The selected room's mint; empty for the main feed. */
  room: string;
  onChange: (room: string) => void;
}

const CHIP_CLS =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 min-h-[44px] text-xs font-bold transition-colors border select-none whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-green';

const NO_ROOMS: BoardRoom[] = [];

export function RoomSwitcher({ room, onChange }: RoomSwitcherProps) {
  /* One stable empty list while offline, so the effects below do not re-run every render. */
  const { data: mine = NO_ROOMS } = useMyRooms();
  /* A room in the URL that is not among the viewer's: read on its own so the chip can still be shown. */
  const listed = mine.some(r => r.mint === room);
  const { data: linked } = useRoom(room && !listed ? room : null);
  const rooms: BoardRoom[] = useMemo(() => (linked && !listed ? [...mine, linked] : mine), [mine, linked, listed]);

  /* The open room is visited on entry and again on leave (posts that arrived meanwhile were seen);
     the dot on the others compares their newest post against the visit this browser remembers. */
  const [, visited] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!room) return;
    markRoomVisited(room);
    visited();
    return () => markRoomVisited(room);
  }, [room]);

  if (rooms.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none" role="group" aria-label="Rooms" data-testid="room-switcher">
      <button
        type="button"
        onClick={() => onChange('')}
        aria-pressed={room === ''}
        className={cn(
          CHIP_CLS,
          room === ''
            ? 'border-accent-green bg-accent-green/10 text-accent-green'
            : 'border-border-default bg-bg-secondary text-text-secondary hover:border-border-hover hover:text-text-primary',
        )}
        data-testid="room-all"
      >
        <Icon name="message-square" size="sm" /> All
      </button>
      {rooms.map(r => {
        const active = room === r.mint;
        /* Round 2: the tracker counts posts since the viewer's last visit; older trackers get the local dot. */
        const count = typeof r.unread === 'number' ? r.unread : null;
        const unread = !active && (count !== null ? count > 0 : roomHasUnread(r.lastPostAt, lastRoomVisit(r.mint)));
        return (
          <button
            key={r.mint}
            type="button"
            onClick={() => onChange(r.mint)}
            aria-pressed={active}
            title={r.name || r.symbol}
            className={cn(
              CHIP_CLS,
              active
                ? 'border-accent-green bg-accent-green/10 text-accent-green'
                : 'border-border-default bg-bg-secondary text-text-secondary hover:border-border-hover hover:text-text-primary',
            )}
            data-testid={`room-${r.mint}`}
            data-unread={unread ? 'true' : undefined}
          >
            <Icon name="coins" size="sm" /> {r.symbol || r.name || 'Room'}
            {unread && count !== null && (
              <span
                className="min-w-[18px] px-1 py-px rounded-full bg-accent-green text-black text-[10px] font-bold text-center"
                aria-label={`${count} new ${count === 1 ? 'post' : 'posts'}`}
                data-testid={`room-${r.mint}-unread`}
                data-count={count}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
            {unread && count === null && <span className="w-1.5 h-1.5 rounded-full bg-accent-green" aria-label="New posts" data-testid={`room-${r.mint}-unread`} />}
          </button>
        );
      })}
    </div>
  );
}
