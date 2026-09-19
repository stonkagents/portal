/**
 * Purpose: Tests for useProfile hook — daemon proxy, mock mode, transformer
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// Mock app config — vi.hoisted ensures mockConfig exists before vi.mock factory runs
const mockConfig = vi.hoisted(() => ({
  daemonUrl: 'http://localhost:7841/api/v1',
  apiBaseUrl: 'http://localhost:7842',
  useRealDaemon: true,
}));
vi.mock('@/lib/config/app.config', () => ({
  appConfig: mockConfig,
}));

// The profile is proxied by the agent; connected unless a test says otherwise
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

import { useProfile } from '../use-profile';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.useRealDaemon = true;
    mockDaemon.connected = true;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls daemon proxy at correct URL', async () => {
    const rawProfile = {
      peer_id: 'p1', masked_peer_id: 'claw-test', rank: 'silver', is_online: true,
      stats: { clout: 45, top_percent: 35, drops: 3, library: 3, uptime_seconds: 100 },
      eigen_trust: {
        bandwidth_score: 0.4, quality_score: 0.5, security_score: 1.0, citizenship_score: 0.8,
        composite_score: 0.45,
        weights: { bandwidth: 0.4, quality: 0.3, security: 0.2, citizenship: 0.1 },
      },
      badges: [], top_drops: [], recent_activity: [],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: rawProfile }), { status: 200 }),
    );

    const { result } = renderHook(() => useProfile(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/portal/profile/me',
      expect.objectContaining({ headers: {} }),
    );
  });

  it('does not execute query when useRealDaemon is false', () => {
    mockConfig.useRealDaemon = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(() => useProfile(), { wrapper: createWrapper() });

    // Query should not be enabled
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not ask the agent for the profile while it is offline', () => {
    mockDaemon.connected = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(() => useProfile(), { wrapper: createWrapper() });

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('transforms raw backend response to TransformedProfile', async () => {
    const rawProfile = {
      peer_id: '12D3KooW123', masked_peer_id: 'claw-alpha', rank: 'gold', is_online: false,
      stats: { clout: 78, top_percent: 12, drops: 5, library: 5, uptime_seconds: 450180 },
      eigen_trust: {
        bandwidth_score: 0.78, quality_score: 0.85, security_score: 1.0, citizenship_score: 0.6,
        composite_score: 0.78,
        weights: { bandwidth: 0.4, quality: 0.3, security: 0.2, citizenship: 0.1 },
      },
      badges: [{ id: 'early_adopter', name: 'Early Adopter', status: 'earned' }],
      top_drops: [{ filename: 'test.at-vec', file_type: '.at-vec', download_count: 10, size_bytes: 500 }],
      recent_activity: [],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: rawProfile }), { status: 200 }),
    );

    const { result } = renderHook(() => useProfile(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data } = result.current;
    expect(data?.profile.name).toBe('claw-alpha');
    expect(data?.profile.rank).toBe('gold');
    expect(data?.stats.cloutRank).toBe('Top 12%');
    expect(data?.eigenTrust).toHaveLength(4);
    expect(data?.eigenTrust[0].name).toBe('Bandwidth');
    expect(data?.eigenTrust[0].value).toBeCloseTo(7.8);
    expect(data?.badges[0].icon).toBe('zap');
    expect(data?.drops[0].type).toBe('.at-vec');
  });
});
