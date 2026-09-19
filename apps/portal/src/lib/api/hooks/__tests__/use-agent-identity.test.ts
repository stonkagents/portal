/**
 * Purpose: Tests for useAgentIdentity / useSaveAgentIdentity: idle while the
 *          agent is offline, loads from the daemon, null when the agent has no
 *          identity endpoint, and a save writes the cache and invalidates the
 *          peer and profile queries so the rest of the portal follows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as IdentityModule from '@/lib/api/daemon-identity';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => mockDaemon }));

const identityClient = vi.hoisted(() => ({
  getAgentIdentity: vi.fn(),
  saveAgentIdentity: vi.fn(),
}));
vi.mock('@/lib/api/daemon-identity', async importOriginal => {
  const actual = await importOriginal<typeof IdentityModule>();
  return { ...actual, ...identityClient };
});

import { useAgentIdentity, useSaveAgentIdentity, IDENTITY_UNSUPPORTED_MESSAGE } from '../use-agent-identity';
import { queryKeys } from '@/lib/api/keys';

const IDENTITY = { peerId: '12D3KooWabc', displayName: 'Alice' };

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDaemon.connected = true;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAgentIdentity', () => {
  it('loads the identity from the daemon', async () => {
    identityClient.getAgentIdentity.mockResolvedValueOnce({ kind: 'ok', identity: IDENTITY });
    const { result } = renderHook(() => useAgentIdentity(), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.data).toEqual(IDENTITY));
  });

  it('asks nothing while the agent is offline', () => {
    mockDaemon.connected = false;
    const { result } = renderHook(() => useAgentIdentity(), { wrapper: wrapperFor(makeClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(identityClient.getAgentIdentity).not.toHaveBeenCalled();
  });

  it('is null when the running agent predates the endpoint', async () => {
    identityClient.getAgentIdentity.mockResolvedValueOnce({ kind: 'unsupported' });
    const { result } = renderHook(() => useAgentIdentity(), { wrapper: wrapperFor(makeClient()) });
    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('errors with the daemon message when it does not answer', async () => {
    identityClient.getAgentIdentity.mockResolvedValue({ kind: 'error', message: 'no answer', code: null });
    const { result } = renderHook(() => useAgentIdentity(), { wrapper: wrapperFor(makeClient()) });
    /* The hook retries once (1 s back-off) before it settles on the error. */
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
    expect(result.current.error?.message).toBe('no answer');
  });
});

describe('useSaveAgentIdentity', () => {
  it('writes the identity cache and invalidates peers and profile on success', async () => {
    const qc = makeClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    identityClient.saveAgentIdentity.mockResolvedValueOnce({ kind: 'ok', identity: { ...IDENTITY, displayName: 'Bob' } });

    const { result } = renderHook(() => useSaveAgentIdentity(), { wrapper: wrapperFor(qc) });
    result.current.mutate('Bob');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(identityClient.saveAgentIdentity).toHaveBeenCalledWith('Bob');
    expect(qc.getQueryData(queryKeys.daemon.identity)).toEqual({ ...IDENTITY, displayName: 'Bob' });
    const keys = invalidate.mock.calls.map(([opts]) => JSON.stringify(opts?.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.peers.all));
    expect(keys).toContain(JSON.stringify(queryKeys.profile.me));
    expect(keys).toContain(JSON.stringify(queryKeys.daemon.identity));
  });

  it('rejects with the daemon message and code on a refusal', async () => {
    identityClient.saveAgentIdentity.mockResolvedValueOnce({ kind: 'error', message: 'too long', code: 'INVALID_REQUEST' });
    const { result } = renderHook(() => useSaveAgentIdentity(), { wrapper: wrapperFor(makeClient()) });
    result.current.mutate('x');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('too long');
    expect(result.current.error?.code).toBe('INVALID_REQUEST');
  });

  it('explains an agent without the endpoint', async () => {
    identityClient.saveAgentIdentity.mockResolvedValueOnce({ kind: 'unsupported' });
    const { result } = renderHook(() => useSaveAgentIdentity(), { wrapper: wrapperFor(makeClient()) });
    result.current.mutate('x');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(IDENTITY_UNSUPPORTED_MESSAGE);
  });
});
