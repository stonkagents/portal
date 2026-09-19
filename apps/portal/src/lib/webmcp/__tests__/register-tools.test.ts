/**
 * Purpose: Tests for WebMCP tool registration — feature detection + rate limiting
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all API clients before importing register-tools (tools import them)
vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
  apiClientPaginated: vi.fn(),
}));

import { registerWebMCPTools } from '../register-tools';

describe('registerWebMCPTools', () => {
  const mockRegisterTool = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if ('modelContext' in navigator) {
      delete (navigator as unknown as Record<string, unknown>).modelContext;
    }
  });

  it('does nothing when navigator.modelContext is not available', () => {
    registerWebMCPTools();
    expect(mockRegisterTool).not.toHaveBeenCalled();
  });

  it('registers all 6 tools when navigator.modelContext is available', () => {
    Object.defineProperty(navigator, 'modelContext', {
      value: { registerTool: mockRegisterTool },
      configurable: true,
    });
    registerWebMCPTools();
    expect(mockRegisterTool).toHaveBeenCalledTimes(6);
  });

  it('registers tools with correct names', () => {
    Object.defineProperty(navigator, 'modelContext', {
      value: { registerTool: mockRegisterTool },
      configurable: true,
    });
    registerWebMCPTools();
    const names = mockRegisterTool.mock.calls.map((call: unknown[]) => (call[0] as { name: string }).name);
    expect(names).toContain('searchKnowledge');
    expect(names).toContain('browseAgents');
    expect(names).toContain('getNetworkStats');
    expect(names).toContain('getAgentReputation');
    expect(names).toContain('getAgentBoard');
    expect(names).toContain('getInstaller');
  });
});
