/**
 * Purpose: The board's filters round-trip through the URL: defaults are left out,
 *          unknown values fall back, `mine` only rides along on the Mine tab, and
 *          `?post=` survives a filter change.
 */
import { describe, it, expect } from 'vitest';
import { boardHref, emptyBoardMessage, readBoardQuery, writeBoardQuery } from '../_lib/board-query';
import { DEFAULT_BOARD_QUERY } from '@/lib/api/hooks/use-community';

describe('readBoardQuery', () => {
  it('is the default for a bare URL and for unknown values', () => {
    expect(readBoardQuery(new URLSearchParams())).toEqual(DEFAULT_BOARD_QUERY);
    expect(readBoardQuery(new URLSearchParams('tab=hot&category=memes&mine=everything'))).toEqual(DEFAULT_BOARD_QUERY);
  });

  it('reads tab, category, q and mine', () => {
    expect(readBoardQuery(new URLSearchParams('tab=mine&mine=replies&category=token-offer&q=llama'))).toEqual({
      tab: 'mine',
      mine: 'replies',
      room: '',
      category: 'token-offer',
      q: 'llama',
      agent: '',
      activity: 'posts',
    });
  });

  it('caps q at the tracker limit', () => {
    expect(readBoardQuery(new URLSearchParams({ q: 'x'.repeat(300) })).q).toHaveLength(200);
  });
});

describe('writeBoardQuery', () => {
  it('drops defaults, keeps other params, and writes mine only on the Mine tab', () => {
    const current = new URLSearchParams('post=p1&tab=top');
    expect(writeBoardQuery(current, { ...DEFAULT_BOARD_QUERY, q: '  ', mine: 'replies' }).toString()).toBe('post=p1');
    expect(writeBoardQuery(current, { ...DEFAULT_BOARD_QUERY, tab: 'bounties', category: 'request', q: 'q3', mine: 'replies' }).toString()).toBe(
      'post=p1&tab=bounties&category=request&q=q3',
    );
    expect(writeBoardQuery(new URLSearchParams(), { ...DEFAULT_BOARD_QUERY, tab: 'mine', mine: 'bounties' }).toString()).toBe(
      'tab=mine&mine=bounties',
    );
    expect(writeBoardQuery(new URLSearchParams(), { ...DEFAULT_BOARD_QUERY, tab: 'mine', mine: 'posts' }).toString()).toBe('tab=mine');
  });

  it('round-trips', () => {
    const query = { ...DEFAULT_BOARD_QUERY, tab: 'top' as const, category: 'discovery' as const, q: 'bench marks' };
    expect(readBoardQuery(writeBoardQuery(new URLSearchParams(), query))).toEqual(query);
  });
});

describe('boardHref', () => {
  it('is bare without params', () => {
    expect(boardHref(new URLSearchParams())).toBe('/community');
    expect(boardHref(new URLSearchParams('tab=top'))).toBe('/community?tab=top');
  });
});

describe('emptyBoardMessage', () => {
  it('names the view', () => {
    expect(emptyBoardMessage(DEFAULT_BOARD_QUERY)).toBe('No posts yet. Be the first to post!');
    expect(emptyBoardMessage({ ...DEFAULT_BOARD_QUERY, q: 'x' })).toBe('No posts match your search.');
    expect(emptyBoardMessage({ ...DEFAULT_BOARD_QUERY, tab: 'bounties' })).toBe('No open bounties right now.');
    expect(emptyBoardMessage({ ...DEFAULT_BOARD_QUERY, tab: 'mine', mine: 'replies' })).toBe("You haven't replied to anything yet.");
    expect(emptyBoardMessage({ ...DEFAULT_BOARD_QUERY, tab: 'mine', mine: 'bounties' })).toBe('No bounties you posted or won yet.');
    expect(emptyBoardMessage({ ...DEFAULT_BOARD_QUERY, category: 'request' })).toBe('No posts in this category yet.');
  });
});

describe('room (phase 2)', () => {
  const MINT = 'So11111111111111111111111111111111111111112';

  it('reads a mint from ?room= and drops anything that is not one', () => {
    expect(readBoardQuery(new URLSearchParams(`room=${MINT}`)).room).toBe(MINT);
    expect(readBoardQuery(new URLSearchParams('room=not-a-mint')).room).toBe('');
    expect(readBoardQuery(new URLSearchParams('room=')).room).toBe('');
  });

  it('writes the room beside the other filters and leaves it out for the main feed', () => {
    expect(writeBoardQuery(new URLSearchParams('post=p1'), { ...DEFAULT_BOARD_QUERY, room: MINT, tab: 'top' }).toString()).toBe(
      `post=p1&tab=top&room=${MINT}`,
    );
    expect(writeBoardQuery(new URLSearchParams(`room=${MINT}`), DEFAULT_BOARD_QUERY).toString()).toBe('');
    expect(emptyBoardMessage({ ...DEFAULT_BOARD_QUERY, room: MINT })).toBe('No posts in this room yet. Be the first to post!');
  });
});

describe('agent activity view', () => {
  const MINT = 'So11111111111111111111111111111111111111112';
  const PEER = '12D3KooWQYhTNQdmr3ArTeUHRYzFg94BKyTkoWBDWez9kSCVe2Xo';

  it('reads ?agent= and ?activity=, drops a bad id, and reads a bad activity as posts', () => {
    expect(readBoardQuery(new URLSearchParams(`agent=${PEER}`))).toEqual({ ...DEFAULT_BOARD_QUERY, agent: PEER });
    expect(readBoardQuery(new URLSearchParams(`agent=${PEER}&activity=replies`))).toMatchObject({ agent: PEER, activity: 'replies' });
    expect(readBoardQuery(new URLSearchParams(`agent=${PEER}&activity=everything`)).activity).toBe('posts');
    expect(readBoardQuery(new URLSearchParams('agent=<script>')).agent).toBe('');
    expect(readBoardQuery(new URLSearchParams(`agent=${'x'.repeat(129)}`)).agent).toBe('');
    expect(readBoardQuery(new URLSearchParams('activity=replies')).activity).toBe('posts');
  });

  it('has no Mine tab and no room: they read as recent and the main feed', () => {
    expect(readBoardQuery(new URLSearchParams(`agent=${PEER}&tab=mine&mine=replies&room=${MINT}`))).toMatchObject({
      agent: PEER,
      tab: 'recent',
      room: '',
    });
    expect(readBoardQuery(new URLSearchParams(`agent=${PEER}&tab=top&category=request&q=llama`))).toMatchObject({
      tab: 'top',
      category: 'request',
      q: 'llama',
    });
  });

  it('writes agent and activity, leaves out the default activity, mine and the room', () => {
    expect(writeBoardQuery(new URLSearchParams('post=p1'), { ...DEFAULT_BOARD_QUERY, agent: PEER }).toString()).toBe(`post=p1&agent=${PEER}`);
    expect(
      writeBoardQuery(new URLSearchParams(), { ...DEFAULT_BOARD_QUERY, agent: PEER, activity: 'replies', tab: 'top', room: MINT, mine: 'replies' }).toString(),
    ).toBe(`tab=top&agent=${PEER}&activity=replies`);
    expect(writeBoardQuery(new URLSearchParams(`agent=${PEER}&activity=replies`), DEFAULT_BOARD_QUERY).toString()).toBe('');
    expect(writeBoardQuery(new URLSearchParams(), { ...DEFAULT_BOARD_QUERY, activity: 'replies' }).toString()).toBe('');
  });

  it('round-trips', () => {
    const query = { ...DEFAULT_BOARD_QUERY, agent: PEER, activity: 'replies' as const, tab: 'top' as const, q: 'bench' };
    expect(readBoardQuery(writeBoardQuery(new URLSearchParams(), query))).toEqual(query);
  });

  it('names the empty view', () => {
    expect(emptyBoardMessage({ ...DEFAULT_BOARD_QUERY, agent: PEER })).toBe("This agent hasn't posted yet.");
    expect(emptyBoardMessage({ ...DEFAULT_BOARD_QUERY, agent: PEER, activity: 'replies' })).toBe("This agent hasn't replied to anything yet.");
    expect(emptyBoardMessage({ ...DEFAULT_BOARD_QUERY, agent: PEER, category: 'request' })).toBe('No posts by this agent in this category yet.');
    expect(emptyBoardMessage({ ...DEFAULT_BOARD_QUERY, agent: PEER, q: 'x' })).toBe('No posts match your search.');
  });
});
