/**
 * Purpose: Tests for getNetworkStats WebMCP tool — home page stats for social proof
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApiClient = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
}));

import { networkStatsTool } from '../tools/network-stats';

const MOCK_HOME_RESPONSE = {
  visionStats: [
    { value: '1,247', label: 'Active Peers', trend: '+12%' },
    { value: '45,892', label: 'Files Shared', trend: '+8%' },
    { value: '2,341', label: 'Syncs Today', trend: '+15%' },
  ],
  trendingAssets: [
    { rank: 1, name: 'llama-3-weights.safetensors', type: 'model', author: 'AIResearcher', metric: 342, metricLabel: 'downloads' },
    { rank: 2, name: 'rlhf-dataset-v2.jsonl', type: 'dataset', author: 'DataAgent', metric: 156, metricLabel: 'downloads' },
  ],
  mostInstalled: [
    { rank: 1, name: 'stable-diffusion-xl.safetensors', type: 'model', author: 'GenAI', metric: 1200, metricLabel: 'installs' },
  ],
  recentlyShared: [
    { name: 'code-review-agent.py', type: 'code', author: 'CodeMaster', size: 4096, time: '5 min ago', agents: 3, verified: true },
  ],
};

describe('networkStatsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct tool name', () => {
    expect(networkStatsTool.name).toBe('getNetworkStats');
  });

  it('has no required parameters', () => {
    expect(networkStatsTool.inputSchema.required).toBeUndefined();
  });

  it('calls /api/home endpoint', async () => {
    mockApiClient.mockResolvedValueOnce(MOCK_HOME_RESPONSE);
    await networkStatsTool.execute({});
    expect(mockApiClient).toHaveBeenCalledWith('/api/home');
  });

  it('extracts stats from visionStats', async () => {
    mockApiClient.mockResolvedValueOnce(MOCK_HOME_RESPONSE);
    const result = (await networkStatsTool.execute({})) as Record<string, unknown>;
    const stats = result.stats as Record<string, unknown>[];
    expect(stats).toHaveLength(3);
    expect(stats[0]).toEqual({ value: '1,247', label: 'Active Peers', trend: '+12%' });
  });

  it('includes trending assets with downloads', async () => {
    mockApiClient.mockResolvedValueOnce(MOCK_HOME_RESPONSE);
    const result = (await networkStatsTool.execute({})) as Record<string, unknown>;
    const trending = result.trending as Record<string, unknown>[];
    expect(trending).toHaveLength(2);
    expect(trending[0].name).toBe('llama-3-weights.safetensors');
    expect(trending[0].downloads).toBe(342);
  });

  it('strips author from trending assets', async () => {
    mockApiClient.mockResolvedValueOnce(MOCK_HOME_RESPONSE);
    const result = (await networkStatsTool.execute({})) as Record<string, unknown>;
    const trending = result.trending as Record<string, unknown>[];
    expect(trending[0]).not.toHaveProperty('author');
  });

  it('includes recent activity', async () => {
    mockApiClient.mockResolvedValueOnce(MOCK_HOME_RESPONSE);
    const result = (await networkStatsTool.execute({})) as Record<string, unknown>;
    const recent = result.recent_activity as Record<string, unknown>[];
    expect(recent).toHaveLength(1);
    expect(recent[0].title).toBe('code-review-agent.py');
    expect(recent[0].time_ago).toBe('5 min ago');
  });

  it('includes access block', async () => {
    mockApiClient.mockResolvedValueOnce(MOCK_HOME_RESPONSE);
    const result = (await networkStatsTool.execute({})) as Record<string, unknown>;
    const access = result.access as Record<string, unknown>;
    expect(access.requires_daemon).toBe(true);
  });

  it('returns graceful error on failure', async () => {
    mockApiClient.mockRejectedValueOnce(new Error('Network error'));
    const result = (await networkStatsTool.execute({})) as Record<string, unknown>;
    expect(result.error).toBeDefined();
    expect(result.stats).toEqual([]);
  });
});
