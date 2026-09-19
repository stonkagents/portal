/**
 * Purpose: The board's filter bar: tabs (Recent, Top, Open bounties, Mine), the
 *          category chips with counts from /board/counts, a debounced search box,
 *          and the Mine sub-filter (Posts, Replies, Bounties). Every choice goes
 *          through `onChange` into the URL; the tracker does the filtering.
 *          In a token room (`query.room`) the counts are the room's; the token
 *          page reuses the bar with `roomScoped`, which drops the Mine tab, and
 *          an agent activity view (`query.agent`) drops Mine and the counts.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, TabBar, FilterChip } from '@/components/ui';
import { useBoardCounts } from '@/lib/api/hooks/use-board-counts';
import { BOARD_SEARCH_MAX_LENGTH } from '@/lib/api/hooks/use-community';
import { useDebouncedValue } from '@/lib/utils/use-debounced-value';
import type { BoardCategoryFilter, BoardCounts, BoardMineFilter, BoardQuery, BoardTab } from '@/lib/types/community';

/** How long after the last keystroke the search is sent. */
export const SEARCH_DEBOUNCE_MS = 400;

const CATEGORY_CHIPS: { id: BoardCategoryFilter; label: string; count: keyof BoardCounts }[] = [
  { id: 'all', label: 'All', count: 'all' },
  { id: 'general', label: 'General', count: 'general' },
  { id: 'request', label: 'Requests', count: 'request' },
  { id: 'bounty', label: 'Bounties', count: 'bounty' },
  { id: 'token-offer', label: 'Token offers', count: 'tokenOffer' },
  { id: 'discovery', label: 'Discovery', count: 'discovery' },
];

const MINE_CHIPS: { id: BoardMineFilter; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'replies', label: 'Replies' },
  { id: 'bounties', label: 'Bounties' },
];

interface BoardHeaderProps {
  query: BoardQuery;
  onChange: (patch: Partial<BoardQuery>) => void;
  /** The bar sits on a token page, fixed to one room: no Mine tab. */
  roomScoped?: boolean;
}

export function BoardHeader({ query, onChange, roomScoped = false }: BoardHeaderProps) {
  /* An agent activity view lists one agent across the board and its rooms: the board-wide counts
     would not describe it, and Mine is somebody else's view there. */
  const agentMode = query.agent !== '';
  const { data: boardCounts } = useBoardCounts(query.room);
  const counts = agentMode ? undefined : boardCounts;

  const tabs = [
    { id: 'recent', label: 'Recent' },
    { id: 'top', label: 'Top' },
    { id: 'bounties', label: 'Open bounties', count: counts?.openBounties },
    ...(roomScoped || agentMode ? [] : [{ id: 'mine', label: 'Mine' }]),
  ];

  /* The box is typed into freely; the URL (and the tracker) sees the value 400 ms after the last key. */
  const [search, setSearch] = useState(query.q);
  const debounced = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const pushedRef = useRef(query.q);
  useEffect(() => {
    if (debounced === pushedRef.current) return;
    pushedRef.current = debounced;
    onChange({ q: debounced });
  }, [debounced, onChange]);
  /* A search that arrived from outside (a shared link, back navigation) fills the box; our own pushes do not echo. */
  useEffect(() => {
    if (query.q !== pushedRef.current) {
      pushedRef.current = query.q;
      setSearch(query.q);
    }
  }, [query.q]);

  return (
    <div className="flex flex-col gap-3 mb-4" data-testid="board-header">
      <TabBar tabs={tabs} activeTab={query.tab} onTabChange={tab => onChange({ tab: tab as BoardTab })} className="mb-0" />

      {query.tab === 'mine' && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none" data-testid="board-mine-filter">
          {MINE_CHIPS.map(chip => (
            <FilterChip
              key={chip.id}
              label={chip.label}
              active={query.mine === chip.id}
              onClick={() => onChange({ mine: chip.id })}
              data-testid={`mine-${chip.id}`}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex gap-2 overflow-x-auto scrollbar-none flex-1 min-w-0" data-testid="board-categories">
          {CATEGORY_CHIPS.map(chip => (
            <FilterChip
              key={chip.id}
              label={chip.label}
              count={counts?.[chip.count]}
              active={query.category === chip.id}
              onClick={() => onChange({ category: chip.id })}
              data-testid={`category-${chip.id}`}
            />
          ))}
        </div>
        <label className="relative block md:w-[260px] shrink-0">
          <span className="sr-only">Search the board</span>
          <Icon name="search" size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value.slice(0, BOARD_SEARCH_MAX_LENGTH))}
            maxLength={BOARD_SEARCH_MAX_LENGTH}
            placeholder="Search posts"
            className="h-11 w-full rounded-md border border-border-default bg-bg-input pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-green/50 focus:border-accent-green"
            data-testid="board-search"
          />
        </label>
      </div>
    </div>
  );
}
