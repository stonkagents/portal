/**
 * Purpose: Phase 1 fields on the board DTOs (reputation tier, accepted reply,
 *          hidden / pinned / watching, mentions, the settled token offer, the
 *          replier's wallet) and the peer-side readers (peers/me, reputation,
 *          display names, open reports), in both spellings.
 */
import { describe, it, expect } from 'vitest';
import { transformPost, transformReply } from '../community';
import { parseActivityItem, parseBoardReport, parseBoardReports } from '../board';
import { parseAgentBoardSummary, parseBoardReputation, parseDisplayNameSuggestions, parsePeerMe } from '../board-peers';
import type { PortalPost, PortalReply } from '@/lib/types/backend';

const basePost: PortalPost = {
  id: 'p1',
  author: 'peer-a',
  authorTier: 'new',
  title: 'T',
  content: 'hello @alice',
  tab: 'recent',
  upvotes: 1,
  replies: 2,
  time: '2026-09-16T10:00:00Z',
  tags: [],
  category: 'token-offer',
  viewCount: 0,
};

describe('transformPost phase 1', () => {
  it('defaults the new fields when the tracker predates them', () => {
    const post = transformPost(basePost);
    expect(post.acceptedReplyId).toBeNull();
    expect(post.hidden).toBe(false);
    expect(post.pinned).toBe(false);
    expect(post.watching).toBe(false);
    expect(post.mentions).toEqual([]);
    expect(post).not.toHaveProperty('authorReputationTier');
    expect(post.tokenOffer).toBeUndefined();
  });

  it('reads snake_case fields and the settled token offer', () => {
    const post = transformPost({
      ...basePost,
      reputation_tier: 'Trusted',
      accepted_reply_id: 'r9',
      hidden: true,
      pinned: true,
      watching: true,
      mentions: [{ peer_id: 'peer-b', display_name: 'alice' }, { peer_id: '' }],
      token_offer: { mint: 'Mint111', symbol: 'STONK', decimals: 6, amount: 1_500_000, max: 10, paid: 3 },
    });
    expect(post.authorReputationTier).toBe('trusted');
    expect(post.acceptedReplyId).toBe('r9');
    expect(post.hidden).toBe(true);
    expect(post.pinned).toBe(true);
    expect(post.watching).toBe(true);
    expect(post.mentions).toEqual([{ peerId: 'peer-b', displayName: 'alice' }]);
    expect(post.tokenOffer).toEqual({ mint: 'Mint111', symbol: 'STONK', decimals: 6, amount: 1_500_000, max: 10, paid: 3 });
  });

  it('reads camelCase spellings and the nested author tier', () => {
    const post = transformPost({
      ...basePost,
      author: { peer_id: 'peer-a', display_name: 'Ann', reputation_tier: 'top' },
      acceptedReplyId: 'r1',
      mentions: [{ peerId: 'peer-b', displayName: 'bob' }],
      tokenOffer: { mint: 'M', symbol: 'S', decimals: 0, amount: 5, max: 2, paid: 0 },
    });
    expect(post.authorReputationTier).toBe('top');
    expect(post.authorDisplayName).toBe('Ann');
    expect(post.acceptedReplyId).toBe('r1');
    expect(post.mentions[0]).toEqual({ peerId: 'peer-b', displayName: 'bob' });
    expect(post.tokenOffer?.symbol).toBe('S');
  });

  it('maps the pre-phase-1 token offer shape onto the new one', () => {
    const post = transformPost({ ...basePost, tokenOffer: { amount: 100, token: 'OLD', accepted: 2 } });
    expect(post.tokenOffer).toEqual({ mint: '', symbol: 'OLD', decimals: 0, amount: 100, max: 0, paid: 2 });
  });

  it('ignores a tier word it does not know', () => {
    expect(transformPost({ ...basePost, reputation_tier: 'legend' })).not.toHaveProperty('authorReputationTier');
  });
});

describe('transformReply phase 1', () => {
  const raw: PortalReply = { id: 'r1', postId: 'p1', author: 'peer-b', content: 'c', time: 't' };

  it('defaults accepted, hidden, wallet, paid and mentions', () => {
    expect(transformReply(raw)).toMatchObject({ accepted: false, hidden: false, authorWallet: null, tokenOfferPaid: false, mentions: [] });
  });

  it('reads the phase 1 fields in either spelling', () => {
    expect(
      transformReply({ ...raw, accepted: true, hidden: true, author_wallet: 'Wallet111', token_offer_paid: true, reputation_tier: 'active' }),
    ).toMatchObject({ accepted: true, hidden: true, authorWallet: 'Wallet111', tokenOfferPaid: true, authorReputationTier: 'active' });
    expect(transformReply({ ...raw, authorWallet: 'W2', tokenOfferPaid: true })).toMatchObject({ authorWallet: 'W2', tokenOfferPaid: true });
    expect(transformReply({ ...raw, author_wallet: null }).authorWallet).toBeNull();
  });
});

describe('parsePeerMe', () => {
  it('reads the platform flag, the linked wallet and the tier', () => {
    expect(
      parsePeerMe({ data: { peer_id: 'me', display_name: 'Me', platform: true, wallet_address: 'W', reputation_tier: 'top', reputation_score: 640 } }),
    ).toEqual({ peerId: 'me', displayName: 'Me', platform: true, walletAddress: 'W', reputationTier: 'top', reputationScore: 640 });
  });

  it('is not platform unless the tracker says so, and null without a peer id', () => {
    expect(parsePeerMe({ peerId: 'me' })).toEqual({
      peerId: 'me',
      displayName: null,
      platform: false,
      walletAddress: null,
      reputationTier: 'new',
      reputationScore: null,
    });
    expect(parsePeerMe({ data: { platform: true } })).toBeNull();
    expect(parsePeerMe(null)).toBeNull();
  });
});

describe('parseBoardReputation', () => {
  it('reads the breakdown and the score when sent', () => {
    expect(
      parseBoardReputation({
        data: { tier: 'trusted', score: 120, bounties_won: 3, answers_accepted: 4, upvotes_received: 15, computed_at: '2026-09-16T02:00:00Z' },
      }),
    ).toEqual({ tier: 'trusted', score: 120, bountiesWon: 3, answersAccepted: 4, upvotesReceived: 15, computedAt: '2026-09-16T02:00:00Z' });
  });

  it('reads the board tier from reputation_tier beside the P2P rank in tier', () => {
    expect(parseBoardReputation({ tier: 'gold', reputation_tier: 'active', composite_score: 0.7, badges: [] }).tier).toBe('active');
    expect(parseBoardReputation({ tier: 'gold' }).tier).toBe('new');
    expect(parseBoardReputation({ tier: 'trusted' }).tier).toBe('trusted');
  });

  it('leaves the score null for another peer and defaults the rest', () => {
    expect(parseBoardReputation({ tier: 'active', bounties_won: 1 })).toEqual({
      tier: 'active',
      score: null,
      bountiesWon: 1,
      answersAccepted: 0,
      upvotesReceived: 0,
      computedAt: null,
    });
    expect(parseBoardReputation(undefined).tier).toBe('new');
  });
});

describe('parseDisplayNameSuggestions', () => {
  it('reads a bare array or the envelope and drops rows without both ids', () => {
    const rows = [
      { peer_id: 'a', display_name: 'alice', reputation_tier: 'top' },
      { peerId: 'b', displayName: 'bob' },
      { peer_id: 'c' },
    ];
    expect(parseDisplayNameSuggestions(rows)).toEqual([
      { peerId: 'a', displayName: 'alice', reputationTier: 'top' },
      { peerId: 'b', displayName: 'bob', reputationTier: 'new' },
    ]);
    expect(parseDisplayNameSuggestions({ data: rows })).toHaveLength(2);
    expect(parseDisplayNameSuggestions('nope')).toEqual([]);
  });
});

describe('parseBoardReport', () => {
  it('reads a report row and falls back to the target for a post id', () => {
    expect(
      parseBoardReport({
        id: 'rep1',
        target_type: 'post',
        target_id: 'p1',
        reason: 'scam',
        note: 'looks fake',
        reporter_peer_id: 'peer-r',
        reporter_display_name: 'Rita',
        reporter_tier: 'active',
        created_at: '2026-09-16T10:00:00Z',
        excerpt: 'buy now',
      }),
    ).toEqual({
      id: 'rep1',
      targetType: 'post',
      targetId: 'p1',
      postId: 'p1',
      reason: 'scam',
      note: 'looks fake',
      reporterPeerId: 'peer-r',
      reporterDisplayName: 'Rita',
      reporterTier: 'active',
      createdAt: '2026-09-16T10:00:00Z',
      excerpt: 'buy now',
    });
  });

  it('drops rows it cannot act on and sorts newest first', () => {
    const list = parseBoardReports({
      data: [
        { id: 'old', target_type: 'reply', target_id: 'r1', post_id: 'p1', reason: 'weird', created_at: '2026-09-15T10:00:00Z' },
        { id: 'new', targetType: 'post', targetId: 'p2', reason: 'spam', createdAt: '2026-09-16T10:00:00Z' },
        { id: 'bad', target_type: 'user', target_id: 'x' },
        { target_type: 'post', target_id: 'p3' },
      ],
    });
    expect(list.map(r => r.id)).toEqual(['new', 'old']);
    expect(list[1]).toMatchObject({ targetType: 'reply', postId: 'p1', reason: 'other', reporterTier: 'new' });
  });
});

describe('parseActivityItem phase 1 kinds', () => {
  it('carries the actor tier when sent and leaves it off otherwise', () => {
    expect(parseActivityItem({ id: 'a', kind: 'mentioned', post_id: 'p', actor_reputation_tier: 'active' })?.actorReputationTier).toBe('active');
    expect(parseActivityItem({ id: 'a', kind: 'mentioned', post_id: 'p' })).not.toHaveProperty('actorReputationTier');
    expect(parseActivityItem({ id: 'a', kind: 'mentioned', post_id: 'p', actor_reputation_tier: 'gold' })).not.toHaveProperty('actorReputationTier');
  });

  it('keeps the new kinds and the token symbol and decimals', () => {
    const row = parseActivityItem({
      id: 'a1',
      kind: 'token_offer_paid',
      post_id: 'p1',
      amount: 1_500_000,
      symbol: 'STONK',
      decimals: 6,
      created_at: '2026-09-16T10:00:00Z',
    });
    expect(row).toMatchObject({ kind: 'token_offer_paid', amount: 1_500_000, symbol: 'STONK', decimals: 6 });
    for (const kind of ['reply_accepted', 'reply_in_watched', 'mentioned']) {
      expect(parseActivityItem({ id: kind, kind, post_id: 'p1' })?.kind).toBe(kind);
    }
  });
});

describe('parseAgentBoardSummary', () => {
  it('reads the summary in both spellings and defaults the rest', () => {
    expect(
      parseAgentBoardSummary({
        data: {
          peer_id: 'peer-a',
          display_name: 'Agent Bot',
          reputation_tier: 'trusted',
          posts: 12,
          replies: 40,
          accepted_answers: 3,
          bounties_won: 2,
          last_active_at: '2026-09-16T09:00:00Z',
        },
      }),
    ).toEqual({
      peerId: 'peer-a',
      displayName: 'Agent Bot',
      reputationTier: 'trusted',
      posts: 12,
      replies: 40,
      acceptedAnswers: 3,
      bountiesWon: 2,
      lastActiveAt: '2026-09-16T09:00:00Z',
    });
    expect(parseAgentBoardSummary({ peerId: 'peer-b', acceptedAnswers: 1, bountiesWon: 1, lastActiveAt: null, display_name: '' })).toEqual({
      peerId: 'peer-b',
      displayName: null,
      reputationTier: 'new',
      posts: 0,
      replies: 0,
      acceptedAnswers: 1,
      bountiesWon: 1,
      lastActiveAt: null,
    });
  });

  it('is null without a peer id', () => {
    expect(parseAgentBoardSummary({ data: { posts: 3 } })).toBeNull();
    expect(parseAgentBoardSummary(null)).toBeNull();
  });
});
