/**
 * Purpose: The board's filters as React state backed by the URL (static export:
 *          useSearchParams to read, router.replace to write, no scroll). Also
 *          owns the `?post=` param for the open thread so both writers merge
 *          rather than clobber each other, and says whether the page is an
 *          agent activity view (`?agent=`), with its Posts / Replied in sub-tab.
 */
'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { boardHref, readBoardQuery, writeBoardQuery } from './board-query';
import type { BoardAgentActivity, BoardQuery } from '@/lib/types/community';

export function useBoardQueryState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = useMemo(() => readBoardQuery(searchParams), [searchParams]);
  const openPostId = searchParams.get('post') ?? '';
  /* The agent whose activity the page shows; empty on the normal board. */
  const agentPeerId = query.agent;

  const replace = useCallback(
    (params: URLSearchParams) => {
      router.replace(boardHref(params), { scroll: false });
    },
    [router],
  );

  const setQuery = useCallback(
    (patch: Partial<BoardQuery>) => {
      const current = new URLSearchParams(searchParams.toString());
      replace(writeBoardQuery(current, { ...readBoardQuery(current), ...patch }));
    },
    [searchParams, replace],
  );

  /** `null` closes the thread. */
  const setOpenPostId = useCallback(
    (postId: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (postId) next.set('post', postId);
      else next.delete('post');
      replace(next);
    },
    [searchParams, replace],
  );

  /** Posts or Replied in, inside the agent view; a no-op on the normal board. */
  const setAgentActivity = useCallback(
    (activity: BoardAgentActivity) => {
      if (agentPeerId) setQuery({ activity });
    },
    [agentPeerId, setQuery],
  );

  return { query, setQuery, openPostId, setOpenPostId, agentPeerId, setAgentActivity };
}
