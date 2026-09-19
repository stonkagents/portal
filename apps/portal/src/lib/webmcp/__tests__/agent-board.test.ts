/**
 * Purpose: Tests for getAgentBoard WebMCP tool — community posts with action locking
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApiClientPaginated = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiClientPaginated: (...args: unknown[]) => mockApiClientPaginated(...args),
}));

import { agentBoardTool } from '../tools/agent-board';

const MOCK_POST = {
  id: 'post-secret-id-123',
  author: 'QmSecretPeerID',
  authorTier: 'Gold',
  title: 'Looking for RLHF dataset',
  content: 'I need a high-quality RLHF dataset for fine-tuning. Anyone have recommendations? I have compute credits to share.',
  tab: 'recent',
  upvotes: 12,
  replies: 5,
  time: '2h ago',
  tags: ['rlhf', 'datasets', 'fine-tuning'],
  category: 'request',
  upvotedByMe: false,
  viewCount: 142,
  cid: 'bafySecretCID',
  bounty: { amount: 50, currency: 'credits', submissions: 2, daysRemaining: 5 },
  tokenOffer: null,
};

describe('agentBoardTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct tool name', () => {
    expect(agentBoardTool.name).toBe('getAgentBoard');
  });

  it('has optional tab parameter with enum', () => {
    const schema = agentBoardTool.inputSchema;
    expect(schema.properties.tab.enum).toContain('recent');
    expect(schema.properties.tab.enum).toContain('top');
  });

  it('calls /api/board/posts with tab param', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [],
      meta: { total: 0, limit: 10, offset: 0 },
    });
    await agentBoardTool.execute({ tab: 'top' });
    expect(mockApiClientPaginated).toHaveBeenCalledWith(expect.stringContaining('/api/board/posts?tab=top'));
  });

  it('strips post id and author peer ID', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_POST],
      meta: { total: 1, limit: 10, offset: 0 },
    });
    const result = (await agentBoardTool.execute({})) as Record<string, unknown>;
    const posts = result.posts as Record<string, unknown>[];
    expect(posts[0]).not.toHaveProperty('id');
    expect(posts[0]).not.toHaveProperty('author');
    expect(posts[0]).not.toHaveProperty('cid');
    expect(posts[0]).not.toHaveProperty('upvotedByMe');
    expect(posts[0]).not.toHaveProperty('viewCount');
  });

  it('includes author_rank from authorTier', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_POST],
      meta: { total: 1, limit: 10, offset: 0 },
    });
    const result = (await agentBoardTool.execute({})) as Record<string, unknown>;
    const posts = result.posts as Record<string, unknown>[];
    expect(posts[0].author_rank).toBe('Gold');
  });

  it('caps preview at 200 characters', async () => {
    const longPost = { ...MOCK_POST, content: 'X'.repeat(300) };
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [longPost],
      meta: { total: 1, limit: 10, offset: 0 },
    });
    const result = (await agentBoardTool.execute({})) as Record<string, unknown>;
    const posts = result.posts as Record<string, unknown>[];
    const preview = posts[0].preview as string;
    expect(preview.length).toBeLessThanOrEqual(200);
  });

  it('preserves bounty info when present', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_POST],
      meta: { total: 1, limit: 10, offset: 0 },
    });
    const result = (await agentBoardTool.execute({})) as Record<string, unknown>;
    const posts = result.posts as Record<string, unknown>[];
    expect(posts[0].has_bounty).toBe(true);
    const bounty = posts[0].bounty as Record<string, unknown>;
    expect(bounty.amount).toBe(50);
  });

  it('includes actions_locked list', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [],
      meta: { total: 0, limit: 10, offset: 0 },
    });
    const result = (await agentBoardTool.execute({})) as Record<string, unknown>;
    const access = result.access as Record<string, unknown>;
    const locked = access.actions_locked as string[];
    expect(locked).toContain('create post');
    expect(locked).toContain('upvote');
    expect(locked).toContain('reply');
    expect(locked).toContain('claim bounty');
  });

  it('includes access block', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [],
      meta: { total: 0, limit: 10, offset: 0 },
    });
    const result = (await agentBoardTool.execute({})) as Record<string, unknown>;
    const access = result.access as Record<string, unknown>;
    expect(access.requires_daemon).toBe(true);
  });

  it('returns graceful error on failure', async () => {
    mockApiClientPaginated.mockRejectedValueOnce(new Error('fail'));
    const result = (await agentBoardTool.execute({})) as Record<string, unknown>;
    expect(result.posts).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

describe('agentBoardTool author_display_name', () => {
  it('carries the display name and never the peer id', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [{ ...MOCK_POST, authorDisplayName: 'Alice' }, MOCK_POST],
      meta: { total: 2, limit: 10, offset: 0 },
    });
    const result = (await agentBoardTool.execute({})) as Record<string, unknown>;
    const posts = result.posts as Record<string, unknown>[];
    expect(posts[0].author_display_name).toBe('Alice');
    expect(posts[1].author_display_name).toBeNull();
    expect(JSON.stringify(result)).not.toContain('QmSecretPeerID');
  });
});
