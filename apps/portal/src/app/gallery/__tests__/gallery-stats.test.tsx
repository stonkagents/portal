/**
 * Purpose: Tests for stats bar wiring — speeds from DaemonProvider, peer count, offline fallback
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as DaemonModule from '@/lib/api/daemon';

const { mockUseDaemon, mockUsePeers } = vi.hoisted(() => ({
  mockUseDaemon: vi.fn().mockReturnValue({
    connected: true,
    daemonStatus: 'online',
    health: {
      status: 'ok',
      peerId: '12D3KooWtest',
      peers: 1,
      uptimeSeconds: 100,
      sharedAssets: 0,
      transfer: {
        uploadSpeedBps: 0,
        downloadSpeedBps: 0,
        shareRatio: 0,
        totalUploadedBytes: 0,
        totalDownloadedBytes: 0,
      },
      healthIndicators: { natStatus: 'unknown', dhtReady: true, mdnsReady: true, relayConnected: true },
    },
  }),
  mockUsePeers: vi.fn().mockReturnValue({ data: [] }),
}));

vi.mock('@/lib/api/hooks/use-gallery', () => ({
  useGallery: () => ({
    data: {
      results: [],
      stats: { uploadSpeed: 0, downloadSpeed: 0, activePeers: 0, totalShared: '42' },
      packs: [],
      activity: [],
    },
    isLoading: false,
  }),
}));

vi.mock('@/lib/api/hooks/use-peers', () => ({
  usePeers: mockUsePeers,
  usePeerReputation: () => ({ data: { clout: 50, rank: 'silver', factors: [] } }),
}));

vi.mock('@/lib/api/daemon', async () => {
  const actual = await vi.importActual<typeof DaemonModule>('@/lib/api/daemon');
  return { ...actual, USE_REAL_DAEMON: true };
});

vi.mock('@/components/features/network-map', () => ({
  NetworkMap: () => <div data-testid="network-map">NetworkMap</div>,
}));

vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: mockUseDaemon,
}));

// JSDOM dialog polyfill
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

import GalleryPage from '../page';
import { ToastProvider } from '@/providers/ToastProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <GalleryPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Stats Bar Wiring (DaemonProvider)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePeers.mockReturnValue({ data: [] });
  });

  it('shows speeds from DaemonProvider transfer data when connected', () => {
    mockUseDaemon.mockReturnValue({
      connected: true,
      daemonStatus: 'online',
      health: {
        status: 'ok',
        peerId: '12D3KooWtest',
        peers: 1,
        uptimeSeconds: 100,
        sharedAssets: 0,
        transfer: {
          uploadSpeedBps: 1048576, // 1 MB/s
          downloadSpeedBps: 524288, // 512 KB/s
          shareRatio: 1.5,
          totalUploadedBytes: 0,
          totalDownloadedBytes: 0,
        },
        healthIndicators: { natStatus: 'unknown', dhtReady: true, mdnsReady: true, relayConnected: true },
      },
    });

    renderPage();
    const stats = screen.getByTestId('gallery-stats');
    expect(stats.textContent).toContain('1.0 MB/s');
    expect(stats.textContent).toContain('512.0 KB/s');
  });

  it('shows 0 B/s speeds and the offline note when daemon offline', () => {
    mockUseDaemon.mockReturnValue({
      connected: false,
      daemonStatus: 'offline',
      health: {
        status: 'offline',
        peerId: '',
        peers: 0,
        uptimeSeconds: 0,
        sharedAssets: 0,
        transfer: {
          uploadSpeedBps: 0,
          downloadSpeedBps: 0,
          shareRatio: 0,
          totalUploadedBytes: 0,
          totalDownloadedBytes: 0,
        },
        healthIndicators: { natStatus: 'unknown', dhtReady: false, mdnsReady: false, relayConnected: false },
      },
    });

    renderPage();
    const stats = screen.getByTestId('gallery-stats');
    const values = stats.querySelectorAll('.text-2xl');
    expect(values[0].textContent).toBe('0 B/s');
    expect(values[1].textContent).toBe('0 B/s');
    expect(screen.getByTestId('gallery-offline-note')).toHaveTextContent('Start your agent to see live transfers');
  });

  it('shows peer count from usePeers', () => {
    mockUsePeers.mockReturnValue({ data: [{ id: '1' }, { id: '2' }, { id: '3' }] });

    renderPage();
    const stats = screen.getByTestId('gallery-stats');
    expect(stats.textContent).toContain('3');
  });

  it('shows totalShared from gallery data', () => {
    renderPage();
    const stats = screen.getByTestId('gallery-stats');
    expect(stats.textContent).toContain('42');
  });
});
