/**
 * Purpose: PERF-3 — transfer and library queries only run against a connected daemon.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const mockDaemon = vi.hoisted(() => ({ connected: false }));
vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => mockDaemon,
}));

const mockSafeFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/daemon', () => ({
  safeFetch: mockSafeFetch,
  withLoopbackTarget: (_url: string, init?: RequestInit) => init ?? {},
  DAEMON_API_V1: 'http://localhost:7841/api/v1',
}));

import { useTransfers, useTransferStats, useTransferHistory, useLibrary } from '../use-transfers';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('transfer queries gate on the daemon (PERF-3)', () => {
  beforeEach(() => {
    mockSafeFetch.mockReset();
    mockSafeFetch.mockResolvedValue(null);
    mockDaemon.connected = false;
  });

  const hooks = { useTransfers, useTransferStats, useTransferHistory, useLibrary };

  it.each(Object.keys(hooks) as (keyof typeof hooks)[])('%s never fetches while disconnected', hookName => {
    renderHook(() => hooks[hookName](), { wrapper });
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it('fetches once the daemon is connected', async () => {
    mockDaemon.connected = true;
    renderHook(() => useTransfers(), { wrapper });
    await waitFor(() => expect(mockSafeFetch).toHaveBeenCalled());
    expect(mockSafeFetch.mock.calls.map(c => c[0])).toContain('http://localhost:7841/api/v1/downloads/status');
  });
});
