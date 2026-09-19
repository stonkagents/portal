/**
 * Purpose: Tests for searchKnowledge WebMCP tool — gallery search with CID stripping
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApiClient = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

import { searchKnowledgeTool } from '../tools/search-knowledge';

describe('searchKnowledgeTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct tool name', () => {
    expect(searchKnowledgeTool.name).toBe('searchKnowledge');
  });

  it('has required query parameter in schema', () => {
    expect(searchKnowledgeTool.inputSchema.required).toContain('query');
  });

  it('calls /api/gallery/search with query param', async () => {
    mockApiClient.mockResolvedValueOnce({ items: [], total: 0, total_size_bytes: 0 });
    await searchKnowledgeTool.execute({ query: 'RLHF training' });
    expect(mockApiClient).toHaveBeenCalledWith(expect.stringContaining('/api/gallery/search?q=RLHF+training'));
  });

  it('strips CIDs from results', async () => {
    mockApiClient.mockResolvedValueOnce({
      items: [
        {
          cid: 'bafyabc123secret',
          name: 'model.bin',
          type: 'model',
          size: 1024,
          peers: 3,
          download_count: 42,
          author_peer_id: 'QmPeer123',
          peer_rep: 80,
        },
      ],
      total: 1,
      total_size_bytes: 1024,
    });
    const result = (await searchKnowledgeTool.execute({ query: 'model' })) as Record<string, unknown>;
    const results = result.results as Record<string, unknown>[];
    expect(results[0]).not.toHaveProperty('cid');
  });

  it('strips author peer IDs from results', async () => {
    mockApiClient.mockResolvedValueOnce({
      items: [
        {
          cid: 'bafyabc',
          name: 'data.csv',
          type: 'dataset',
          size: 2048,
          peers: 5,
          download_count: 10,
          author_peer_id: 'QmSecret456',
          peer_rep: 65,
        },
      ],
      total: 1,
      total_size_bytes: 2048,
    });
    const result = (await searchKnowledgeTool.execute({ query: 'data' })) as Record<string, unknown>;
    const results = result.results as Record<string, unknown>[];
    expect(results[0]).not.toHaveProperty('author_peer_id');
    expect(results[0]).not.toHaveProperty('cid');
  });

  it('caps preview at 200 characters', async () => {
    const longName = 'A'.repeat(300);
    mockApiClient.mockResolvedValueOnce({
      items: [
        {
          cid: 'x',
          name: longName,
          type: 'doc',
          size: 100,
          peers: 1,
          download_count: 0,
          author_peer_id: 'p',
          peer_rep: 50,
        },
      ],
      total: 1,
      total_size_bytes: 100,
    });
    const result = (await searchKnowledgeTool.execute({ query: 'test' })) as Record<string, unknown>;
    const results = result.results as Record<string, unknown>[];
    const preview = results[0].preview as string;
    expect(preview.length).toBeLessThanOrEqual(200);
  });

  it('includes capability_gap in response', async () => {
    mockApiClient.mockResolvedValueOnce({ items: [], total: 0, total_size_bytes: 0 });
    const result = (await searchKnowledgeTool.execute({ query: 'test' })) as Record<string, unknown>;
    const gap = result.capability_gap as Record<string, unknown>;
    expect(gap.with_daemon).toContain('P2P');
    expect(gap.privacy_advantage).toBeDefined();
  });

  it('includes access block with trust signals', async () => {
    mockApiClient.mockResolvedValueOnce({ items: [], total: 0, total_size_bytes: 0 });
    const result = (await searchKnowledgeTool.execute({ query: 'test' })) as Record<string, unknown>;
    const access = result.access as Record<string, unknown>;
    expect(access.requires_daemon).toBe(true);
    const trust = access.trust as Record<string, unknown>;
    expect(trust.company).toContain('Tevaera Labs');
  });

  it('clamps limit to MAX_RESULTS_LIMIT', async () => {
    mockApiClient.mockResolvedValueOnce({ items: [], total: 0, total_size_bytes: 0 });
    await searchKnowledgeTool.execute({ query: 'test', limit: 100 });
    expect(mockApiClient).toHaveBeenCalledWith(expect.stringContaining('limit=20'));
  });

  it('returns graceful error on API failure', async () => {
    mockApiClient.mockRejectedValueOnce(new Error('Network error'));
    const result = (await searchKnowledgeTool.execute({ query: 'test' })) as Record<string, unknown>;
    expect(result.error).toBeDefined();
    expect(result.results).toEqual([]);
  });
});
