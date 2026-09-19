/**
 * Purpose: Tests for useDaemonSetup — polls only while connected, maps the 404
 *          pre-endpoint case to "unsupported", and applies fixes then re-polls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const daemon = vi.hoisted(() => ({ connected: false }));
vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => daemon }));

const api = vi.hoisted(() => ({ getSetupStatus: vi.fn(), applySetupFix: vi.fn() }));
vi.mock('@/lib/api/daemon-setup', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/daemon-setup')>();
  return { ...actual, getSetupStatus: api.getSetupStatus, applySetupFix: api.applySetupFix };
});

import { useDaemonSetup, stateOf } from '../use-daemon-setup';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  daemon.connected = false;
});

describe('stateOf', () => {
  it('maps results to the step state; 404 and unreachable never block', () => {
    expect(stateOf(undefined, false)).toBe('idle');
    expect(stateOf(undefined, true)).toBe('checking');
    expect(stateOf({ kind: 'unsupported' }, true)).toBe('unsupported');
    expect(stateOf({ kind: 'unreachable' }, true)).toBe('unreachable');
    expect(stateOf({ kind: 'ok', status: { checks: [{ id: 'firewall', status: 'ok' }] } }, true)).toBe('ready');
    expect(stateOf({ kind: 'ok', status: { checks: [{ id: 'firewall', status: 'missing' }] } }, true)).toBe('blocked');
    /* Nothing to grant for a P2P or tracker check that is still settling: not a wall. */
    expect(stateOf({ kind: 'ok', status: { checks: [{ id: 'p2p', status: 'failed' }, { id: 'tracker', status: 'missing' }] } }, true)).toBe('ready');
  });
});

describe('useDaemonSetup', () => {
  it('never asks a disconnected agent (unsupported platforms stay silent)', async () => {
    const { result } = renderHook(() => useDaemonSetup(), { wrapper: wrapper() });
    expect(result.current.state).toBe('idle');
    await new Promise(r => setTimeout(r, 20));
    expect(api.getSetupStatus).not.toHaveBeenCalled();
  });

  it('polls once connected and reports blocked checks', async () => {
    daemon.connected = true;
    api.getSetupStatus.mockResolvedValue({ kind: 'ok', status: { checks: [{ id: 'storage', status: 'missing' }] } });
    const { result } = renderHook(() => useDaemonSetup(), { wrapper: wrapper() });
    expect(result.current.state).toBe('checking');
    await waitFor(() => expect(result.current.state).toBe('blocked'));
    expect(result.current.status?.checks[0].id).toBe('storage');
  });

  it('reads a 404 as unsupported', async () => {
    daemon.connected = true;
    api.getSetupStatus.mockResolvedValue({ kind: 'unsupported' });
    const { result } = renderHook(() => useDaemonSetup(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.state).toBe('unsupported'));
  });

  it('applies a fix, re-polls, and surfaces a fix error', async () => {
    daemon.connected = true;
    api.getSetupStatus
      .mockResolvedValueOnce({ kind: 'ok', status: { checks: [{ id: 'firewall', status: 'missing' }] } })
      .mockResolvedValue({ kind: 'ok', status: { checks: [{ id: 'firewall', status: 'ok' }] } });
    api.applySetupFix.mockResolvedValueOnce({ kind: 'ok', check: { id: 'firewall', status: 'ok' } });
    const { result } = renderHook(() => useDaemonSetup(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.state).toBe('blocked'));

    await act(async () => {
      await result.current.applyFix('firewall');
    });
    expect(api.applySetupFix).toHaveBeenCalledWith('firewall');
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.fixing).toBeNull();
    expect(result.current.fixError).toBeNull();

    api.applySetupFix.mockResolvedValueOnce({ kind: 'error', message: 'Elevation was refused' });
    await act(async () => {
      await result.current.applyFix('firewall');
    });
    expect(result.current.fixError).toBe('Elevation was refused');
  });
});
