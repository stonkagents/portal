/**
 * Purpose: The board's filters live in the URL so a filtered view can be shared
 *          or reloaded: `?tab=top|bounties|mine`, `?category=request`, `?q=text`,
 *          `?mine=replies`, `?room=<mint>` (a token room), and the agent activity
 *          view `?agent=<peer id>&activity=replies`. Defaults are left out so the
 *          plain `/community` stays plain, and `?post=` (the open thread) rides
 *          along untouched.
 */

import { BOARD_SEARCH_MAX_LENGTH, DEFAULT_BOARD_QUERY } from '@/lib/api/hooks/use-community';
import type { BoardAgentActivity, BoardCategoryFilter, BoardMineFilter, BoardQuery, BoardTab } from '@/lib/types/community';

const TABS: readonly BoardTab[] = ['recent', 'top', 'bounties', 'mine'];
const CATEGORIES: readonly BoardCategoryFilter[] = ['all', 'general', 'request', 'bounty', 'token-offer', 'discovery'];
const MINE: readonly BoardMineFilter[] = ['posts', 'replies', 'bounties'];
const ACTIVITY: readonly BoardAgentActivity[] = ['posts', 'replies'];

/** A Solana mint as it appears in a URL: base58, 32 to 44 characters. Anything else is not a room. */
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** A peer id as it appears in a URL: a libp2p id or a plain handle, up to the tracker's 128 character cap. */
const PEER_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && allowed.includes(value as T) ? (value as T) : fallback;
}

/** The mint when it looks like one; empty (the main feed) otherwise. */
export function readRoomParam(value: string | null): string {
  return value !== null && MINT_RE.test(value) ? value : '';
}

/** The peer id when it looks like one; empty (no agent view) otherwise. */
export function readAgentParam(value: string | null): string {
  return value !== null && PEER_ID_RE.test(value) ? value : '';
}

/**
 * Reads the filters from the URL; anything unknown falls back to the default.
 * An agent view has no Mine tab and no room: `tab=mine` reads as recent and
 * `room` is dropped, since the view already spans the agent's rooms.
 */
export function readBoardQuery(params: URLSearchParams): BoardQuery {
  const agent = readAgentParam(params.get('agent'));
  const tab = oneOf(params.get('tab'), TABS, DEFAULT_BOARD_QUERY.tab);
  return {
    tab: agent && tab === 'mine' ? 'recent' : tab,
    category: oneOf(params.get('category'), CATEGORIES, DEFAULT_BOARD_QUERY.category),
    q: (params.get('q') ?? '').slice(0, BOARD_SEARCH_MAX_LENGTH),
    mine: oneOf(params.get('mine'), MINE, DEFAULT_BOARD_QUERY.mine),
    room: agent ? '' : readRoomParam(params.get('room')),
    agent,
    activity: agent ? oneOf(params.get('activity'), ACTIVITY, DEFAULT_BOARD_QUERY.activity) : DEFAULT_BOARD_QUERY.activity,
  };
}

/**
 * Writes the filters back over `current`, keeping every other param (the open
 * thread). Defaults are dropped; `mine` only matters on the Mine tab, `activity`
 * only with an agent, and an agent view carries no room.
 */
export function writeBoardQuery(current: URLSearchParams, query: BoardQuery): URLSearchParams {
  const next = new URLSearchParams(current);
  const set = (key: string, value: string, isDefault: boolean) => {
    if (isDefault) next.delete(key);
    else next.set(key, value);
  };
  const { agent } = query;
  set('tab', query.tab, query.tab === DEFAULT_BOARD_QUERY.tab || (agent !== '' && query.tab === 'mine'));
  set('category', query.category, query.category === DEFAULT_BOARD_QUERY.category);
  set('q', query.q.trim(), query.q.trim() === '');
  set('mine', query.mine, query.tab !== 'mine' || agent !== '' || query.mine === DEFAULT_BOARD_QUERY.mine);
  set('room', query.room, query.room === '' || agent !== '');
  set('agent', agent, agent === '');
  set('activity', query.activity, agent === '' || query.activity === DEFAULT_BOARD_QUERY.activity);
  return next;
}

/** `/community` with the params, or bare when there are none. */
export function boardHref(params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `/community?${qs}` : '/community';
}

/** What an empty list says, by view. */
export function emptyBoardMessage(query: BoardQuery): string {
  if (query.q.trim()) return 'No posts match your search.';
  if (query.tab === 'bounties') return 'No open bounties right now.';
  if (query.agent) {
    if (query.activity === 'replies') return "This agent hasn't replied to anything yet.";
    if (query.category !== 'all') return 'No posts by this agent in this category yet.';
    return "This agent hasn't posted yet.";
  }
  if (query.tab === 'mine') {
    if (query.mine === 'replies') return "You haven't replied to anything yet.";
    if (query.mine === 'bounties') return 'No bounties you posted or won yet.';
    return "You haven't posted yet.";
  }
  if (query.category !== 'all') return 'No posts in this category yet.';
  if (query.room) return 'No posts in this room yet. Be the first to post!';
  return 'No posts yet. Be the first to post!';
}
