/**
 * Purpose: Tests for useUpdateStatus hook — polling, transform, mutations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// Mock app config
const mockConfig = vi.hoisted(() => ({
  daemonUrl: 'http://localhost:7841/api/v1',
  controllerUrl: 'http://localhost:7840',
  useRealDaemon: true,
  downloadBaseUrl: 'https://releases.dev.example',
}));
vi.mock('@/lib/config/app.config', () => ({
  appConfig: mockConfig,
}));

/* PERF-3: the hook only asks a connected daemon. */
const mockDaemon = vi.hoisted(() => ({ connected: true }));
vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => mockDaemon,
}));

import { useUpdateStatus } from '../use-update-status';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

/** Raw controller response (snake_case, matches Go JSON tags) */
const RAW_IDLE = {
  state: 'IDLE',
  current_version: '0.2.0',
  latest_version: '0.2.0',
  release_notes: '',
  force: false,
  progress: 0,
  error: null,
};

const RAW_AVAILABLE = {
  state: 'AVAILABLE',
  current_version: '0.2.0',
  latest_version: '0.3.0',
  release_notes: 'Bug fixes and improvements',
  force: false,
  progress: 0,
  error: null,
};

describe('useUpdateStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.useRealDaemon = true;
    mockDaemon.connected = true;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('polls daemon proxy at correct URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(RAW_IDLE), { status: 200 }));

    vi.useRealTimers();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:7841/api/v1/controller/update/status',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('manual (Windows) updates hand out THIS site installer, version and notes, not the agent one', async () => {
    const siteManifest = {
      schema_version: 1,
      latest_version: '2.4.1',
      min_supported: '2.1.1',
      released: '2026-09-17',
      release_notes: 'StonkAgents 2.4.1: dev notes',
      platforms: { 'windows/amd64': { url: 'https://releases.dev.example/2.4.1/x.exe', sha256: 'a', size: 1, installer: { url: 'https://releases.dev.example/2.4.1/StonkAgents-Setup-2.4.1.exe', sha256: 'b', size: 2 } } },
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/controller/update/status')) {
        return new Response(JSON.stringify({ ...RAW_AVAILABLE, manual_install: true, installer_url: 'https://releases.stg.example/2.4.1/StonkAgents-Setup-2.4.1.exe', release_notes: 'StonkAgents 2.4.1 (staging): ...' }), { status: 200 });
      }
      if (url.includes('manifest.json')) return new Response(JSON.stringify(siteManifest), { status: 200 });
      return new Response('{}', { status: 404 });
    });

    vi.useRealTimers();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.installerUrl).toBeDefined());
    expect(result.current.data!.installerUrl).toBe('https://releases.dev.example/2.4.1/StonkAgents-Setup-2.4.1.exe');
    expect(result.current.data!.latestVersion).toBe('2.4.1');
    expect(result.current.data!.releaseNotes).toBe('StonkAgents 2.4.1: dev notes');
  });

  it('transforms snake_case response to camelCase', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(RAW_AVAILABLE), { status: 200 }));

    vi.useRealTimers();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    const data = result.current.data!;
    expect(data.state).toBe('AVAILABLE');
    expect(data.currentVersion).toBe('0.2.0');
    expect(data.latestVersion).toBe('0.3.0');
    expect(data.releaseNotes).toBe('Bug fixes and improvements');
    expect(data.force).toBe(false);
    expect(data.progress).toBe(0);
    expect(data.error).toBeNull();
  });

  it('returns correct UpdateState enum values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...RAW_IDLE, state: 'DOWNLOADING', progress: 45 }), { status: 200 }),
    );

    vi.useRealTimers();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.state).toBe('DOWNLOADING');
    expect(result.current.data!.progress).toBe(45);
  });

  it('does not poll when useRealDaemon is false', () => {
    mockConfig.useRealDaemon = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });

    expect(result.current.data).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not poll while the daemon is disconnected', () => {
    mockDaemon.connected = false;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });

    expect(result.current.data).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('startUpdate sends POST to correct endpoint', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(RAW_AVAILABLE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    vi.useRealTimers();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    await act(async () => {
      await result.current.startUpdate();
    });

    const { calls } = vi.mocked(globalThis.fetch).mock;
    const postCall = calls.find(c => (c[1] as RequestInit)?.method === 'POST' && (c[0] as string).includes('start'));
    expect(postCall).toBeDefined();
    expect(postCall![0]).toBe('http://localhost:7841/api/v1/controller/update/start');
  });

  it('cancelUpdate sends POST to correct endpoint', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(RAW_AVAILABLE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    vi.useRealTimers();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    await act(async () => {
      await result.current.cancelUpdate();
    });

    const { calls } = vi.mocked(globalThis.fetch).mock;
    const postCall = calls.find(c => (c[1] as RequestInit)?.method === 'POST' && (c[0] as string).includes('cancel'));
    expect(postCall).toBeDefined();
    expect(postCall![0]).toBe('http://localhost:7841/api/v1/controller/update/cancel');
  });

  it('uses 3s polling during active update states', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ...RAW_IDLE, state: 'DOWNLOADING', progress: 30 }), { status: 200 }),
    );

    vi.useRealTimers();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    // The hook should expose the current poll interval or refetchInterval should be 3000
    expect(result.current.pollInterval).toBe(3_000);
  });

  it('uses 10s polling for non-active states', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(RAW_IDLE), { status: 200 }));

    vi.useRealTimers();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.pollInterval).toBe(10_000);
  });

  it('falls back to direct controller URL when daemon unreachable', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // First call: daemon proxy fails
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      // Second call: direct controller succeeds
      .mockResolvedValueOnce(new Response(JSON.stringify(RAW_AVAILABLE), { status: 200 }));

    vi.useRealTimers();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());

    // Should have tried fallback URL
    const urls = fetchSpy.mock.calls.map(c => c[0]);
    expect(urls).toContain('http://localhost:7840/update/status');
  });
});
