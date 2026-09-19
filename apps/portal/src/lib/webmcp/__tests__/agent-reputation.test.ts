/**
 * Purpose: Tests for getAgentReputation WebMCP tool — name-based reputation lookup
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockApiClient = vi.fn();
const mockApiClientPaginated = vi.fn();
vi.mock('@/lib/api/client', () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
  apiClientPaginated: (...args: unknown[]) => mockApiClientPaginated(...args),
}));

import { agentReputationTool } from '../tools/agent-reputation';

const MOCK_PEER = {
  id: 'db-id-123',
  peerId: 'QmABC123secretpeerid',
  name: 'CryptoKing',
  status: 'online',
  reputation: 75,
  tier: 'Gold',
  sharedFiles: 42,
};

const MOCK_REPUTATION = {
  composite_score: 0.75,
  bandwidth_score: 0.8,
  quality_score: 0.7,
  security_score: 0.9,
  citizenship_score: 0.6,
  tier: 'Gold',
  badges: [
    { id: 'early-adopter', status: 'earned' },
    { id: 'power-seeder', status: 'earned' },
  ],
  weekly_bonus: 50,
  trend: 0.05,
};

describe('agentReputationTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct tool name', () => {
    expect(agentReputationTool.name).toBe('getAgentReputation');
  });

  it('requires agent_name parameter', () => {
    expect(agentReputationTool.inputSchema.required).toContain('agent_name');
  });

  it('rejects peer_id-shaped input (Qm prefix)', async () => {
    const result = (await agentReputationTool.execute({ agent_name: 'QmABC123abcdefghij' })) as Record<string, unknown>;
    expect(result.error).toContain('display name');
    expect(mockApiClientPaginated).not.toHaveBeenCalled();
  });

  it('rejects peer_id-shaped input (12D prefix)', async () => {
    const result = (await agentReputationTool.execute({ agent_name: '12D3KooWABC123abcde' })) as Record<string, unknown>;
    expect(result.error).toContain('display name');
  });

  it('looks up peer by name then fetches reputation', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_PEER],
      meta: { total: 1, limit: 1, offset: 0 },
    });
    mockApiClient.mockResolvedValueOnce(MOCK_REPUTATION);

    const result = (await agentReputationTool.execute({ agent_name: 'CryptoKing' })) as Record<string, unknown>;

    expect(mockApiClientPaginated).toHaveBeenCalledWith(expect.stringContaining('/api/peers?q=CryptoKing'));
    expect(mockApiClient).toHaveBeenCalledWith(expect.stringContaining('/api/peers/QmABC123secretpeerid/reputation'));
    expect(result.name).toBe('CryptoKing');
  });

  it('never exposes peer_id in response', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_PEER],
      meta: { total: 1, limit: 1, offset: 0 },
    });
    mockApiClient.mockResolvedValueOnce(MOCK_REPUTATION);

    const result = (await agentReputationTool.execute({ agent_name: 'CryptoKing' })) as Record<string, unknown>;
    const json = JSON.stringify(result);
    expect(json).not.toContain('QmABC123');
    expect(json).not.toContain('db-id-123');
  });

  it('includes factor breakdown', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_PEER],
      meta: { total: 1, limit: 1, offset: 0 },
    });
    mockApiClient.mockResolvedValueOnce(MOCK_REPUTATION);

    const result = (await agentReputationTool.execute({ agent_name: 'CryptoKing' })) as Record<string, unknown>;
    const factors = result.factors as Record<string, unknown>;
    expect(factors.bandwidth).toBeDefined();
    expect(factors.quality).toBeDefined();
    expect(factors.security).toBeDefined();
    expect(factors.citizenship).toBeDefined();
  });

  it('includes rank and badges', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_PEER],
      meta: { total: 1, limit: 1, offset: 0 },
    });
    mockApiClient.mockResolvedValueOnce(MOCK_REPUTATION);

    const result = (await agentReputationTool.execute({ agent_name: 'CryptoKing' })) as Record<string, unknown>;
    expect(result.rank).toBe('Gold');
    expect(result.weekly_bonus).toBe(50);
    const badges = result.badges as Record<string, unknown>[];
    expect(badges).toHaveLength(2);
  });

  it('returns error when no peer found', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [],
      meta: { total: 0, limit: 1, offset: 0 },
    });

    const result = (await agentReputationTool.execute({ agent_name: 'NonExistent' })) as Record<string, unknown>;
    expect(result.error).toContain('No agent found');
    expect(mockApiClient).not.toHaveBeenCalled();
  });

  it('includes access block', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({
      data: [MOCK_PEER],
      meta: { total: 1, limit: 1, offset: 0 },
    });
    mockApiClient.mockResolvedValueOnce(MOCK_REPUTATION);

    const result = (await agentReputationTool.execute({ agent_name: 'CryptoKing' })) as Record<string, unknown>;
    const access = result.access as Record<string, unknown>;
    expect(access.requires_daemon).toBe(true);
  });

  it('returns graceful error on API failure', async () => {
    mockApiClientPaginated.mockRejectedValueOnce(new Error('Network error'));
    const result = (await agentReputationTool.execute({ agent_name: 'CryptoKing' })) as Record<string, unknown>;
    expect(result.error).toBeDefined();
  });
});

describe('agentReputationTool display_name', () => {
  it('returns the display name without the peer id', async () => {
    mockApiClientPaginated.mockResolvedValueOnce({ data: [MOCK_PEER], meta: { total: 1, limit: 1, offset: 0 } });
    mockApiClient.mockResolvedValueOnce(MOCK_REPUTATION);
    const result = (await agentReputationTool.execute({ agent_name: 'CryptoKing' })) as Record<string, unknown>;
    expect(result.display_name).toBe('CryptoKing');
    expect(result).not.toHaveProperty('peerId');
  });
});
