/**
 * Purpose: Tests for browseAgents WebMCP tool — peer discovery with ID stripping
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApiClientPaginated = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiClientPaginated: (...args: unknown[]) => mockApiClientPaginated(...args),
}));

import { browseAgentsTool } from '../tools/browse-agents';

const MOCK_PEER = {
  id: 'secret-db-id',
  peerId: 'QmSecretPeerID123abc',
  name: 'CryptoKing',
  status: 'online',
  reputation: 75,
  tier: 'Gold',
  sharedFiles: 42,
  location: 'San Francisco, US',
  country: 'United States',
  city: 'San Francisco',
  lat: 37.7,
  lng: -122.4,
  totalUploadBytes: 1000000,
  totalDownloadBytes: 500000,
  lastSeen: '2026-02-16T10:00:00Z',
};

describe('browseAgentsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct tool name', () => {
    expect(browseAgentsTool.name).toBe('browseAgents');
  });

  it('strips peerId and database id from results', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_PEER],
      meta: { total: 1, limit: 10, offset: 0 },
    });
    const result = (await browseAgentsTool.execute({})) as Record<string, unknown>;
    const agents = result.agents as Record<string, unknown>[];
    expect(agents[0]).not.toHaveProperty('peerId');
    expect(agents[0]).not.toHaveProperty('id');
    expect(agents[0]).not.toHaveProperty('lat');
    expect(agents[0]).not.toHaveProperty('lng');
    expect(agents[0]).not.toHaveProperty('totalUploadBytes');
    expect(agents[0]).not.toHaveProperty('totalDownloadBytes');
  });

  it('includes display name and rank', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_PEER],
      meta: { total: 1, limit: 10, offset: 0 },
    });
    const result = (await browseAgentsTool.execute({})) as Record<string, unknown>;
    const agents = result.agents as Record<string, unknown>[];
    expect(agents[0].name).toBe('CryptoKing');
    expect(agents[0].rank).toBe('Gold');
    expect(agents[0].reputation).toBe(75);
  });

  it('includes network summary', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_PEER],
      meta: { total: 50, limit: 10, offset: 0 },
    });
    const result = (await browseAgentsTool.execute({})) as Record<string, unknown>;
    const summary = result.network_summary as Record<string, unknown>;
    expect(summary.total_peers).toBe(50);
    expect(summary.online_now).toBe(1);
  });

  it('includes access block', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [],
      meta: { total: 0, limit: 10, offset: 0 },
    });
    const result = (await browseAgentsTool.execute({})) as Record<string, unknown>;
    const access = result.access as Record<string, unknown>;
    expect(access.requires_daemon).toBe(true);
  });

  it('returns graceful error on failure', async () => {
    mockApiClientPaginated.mockRejectedValueOnce(new Error('fail'));
    const result = (await browseAgentsTool.execute({})) as Record<string, unknown>;
    expect(result.agents).toEqual([]);
    expect(result.error).toBeDefined();
  });
});

describe('browseAgentsTool display_name', () => {
  it('carries the owner-chosen name beside name, and null for a masked-id-only peer', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_PEER, { ...MOCK_PEER, peerId: '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab', name: '12D3Ko...6789ab' }],
      meta: { total: 2, limit: 10, offset: 0 },
    });
    const result = (await browseAgentsTool.execute({})) as Record<string, unknown>;
    const agents = result.agents as Record<string, unknown>[];
    expect(agents[0].display_name).toBe('CryptoKing');
    expect(agents[1].display_name).toBeNull();
    expect(agents[1]).not.toHaveProperty('peerId');
  });
});
