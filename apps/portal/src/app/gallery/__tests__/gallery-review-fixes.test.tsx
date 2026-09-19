/**
 * Purpose: Tests for review fixes — mock fallback, error mapper, offline stats
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as DaemonModule from '@/lib/api/daemon';

const { mockDownload } = vi.hoisted(() => ({
  mockDownload: vi.fn().mockResolvedValue({ cid: 'bafytest1', status: 'queued', message: 'Download started' }),
}));

vi.mock('@/lib/api/hooks/use-gallery', () => ({
  useGallery: () => ({
    data: {
      results: [
        {
          cid: 'bafytest1',
          name: 'test-agent.vec',
          type: '.vec',
          size: '2.0 KB',
          seeds: 5,
          downloads: 10,
          author: '',
          verified: false,
        },
      ],
      stats: { uploadSpeed: 0, downloadSpeed: 0, activePeers: 3, totalShared: '42' },
      packs: [],
      activity: [],
    },
    isLoading: false,
  }),
}));

vi.mock('@/lib/api/daemon', async () => {
  const actual = await vi.importActual<typeof DaemonModule>('@/lib/api/daemon');
  return {
    ...actual,
    USE_REAL_DAEMON: true,
    daemonApi: {
      ...actual.daemonApi,
      download: mockDownload,
    },
  };
});

vi.mock('@/lib/api/hooks/use-gallery-search', () => ({
  useGallerySearch: () => ({
    data: {
      results: [
        {
          cid: 'bafytest1',
          name: 'test-agent.vec',
          type: '.vec',
          size: '2.0 KB',
          seeds: 5,
          downloads: 10,
          author: '',
          verified: false,
        },
      ],
      stats: { uploadSpeed: 0, downloadSpeed: 0, activePeers: 0, totalShared: '0' },
      packs: [],
      activity: [],
    },
    isLoading: false,
  }),
}));

vi.mock('@/components/features/network-map', () => ({
  NetworkMap: () => <div data-testid="network-map">NetworkMap</div>,
}));

vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: () => ({
    connected: true,
    daemonStatus: 'online',
    health: {
      status: 'ok',
      peerId: '12D3KooWtest',
      peers: 1,
      uptimeSeconds: 100,
      sharedAssets: 0,
      transfer: { uploadSpeedBps: 0, downloadSpeedBps: 0, shareRatio: 0, totalUploadedBytes: 0, totalDownloadedBytes: 0 },
      healthIndicators: { natStatus: 'unknown', dhtReady: true, mdnsReady: true, relayConnected: true },
    },
  }),
}));

// Mock useActivity to return undefined (simulating tracker unreachable)
vi.mock('@/lib/api/hooks/use-activity', () => ({
  useActivity: () => ({ data: undefined, isLoading: false }),
}));

// JSDOM lacks HTMLDialogElement.showModal/close
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

import GalleryPage from '../page';
import { ToastProvider, useToast } from '@/providers/ToastProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function ToastSpy() {
  const { toasts } = useToast();
  return (
    <div data-testid="toast-spy">
      {toasts.map(t => (
        <div key={t.id} data-testid={`toast-${t.variant}`}>
          {t.title}
        </div>
      ))}
    </div>
  );
}

function renderGalleryPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <GalleryPage />
        <ToastSpy />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('Review Fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty activity state when tracker returns no data (no mock fallback)', () => {
    renderGalleryPage();
    // Activity feed should show "No recent activity" — NOT mock data rows
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument();
    // Mock activity items should NOT be present
    expect(screen.queryByText(/synced research-pack/i)).not.toBeInTheDocument();
  });

  it('install error uses branded error mapper message (not hardcoded string)', async () => {
    mockDownload.mockResolvedValueOnce(null);
    renderGalleryPage();

    // Open search modal
    const searchBtn = screen.getByRole('button', { name: /search network/i });
    fireEvent.click(searchBtn);

    const downloadBtns = await screen.findAllByRole('button', { name: /^download$/i });
    const searchInstallBtn = downloadBtns.find(btn => btn.closest('[data-testid^="search-result-"]'));
    expect(searchInstallBtn).toBeDefined();
    fireEvent.click(searchInstallBtn!);

    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledWith('bafytest1');
    });

    // Should use error mapper branded message, not hardcoded "Download failed"
    await waitFor(() => {
      const errorToast = screen.getByTestId('toast-error');
      // Error mapper SERVICE_UNAVAILABLE returns "Service unavailable" or similar branded text
      expect(errorToast).toBeInTheDocument();
      // Should NOT contain the old hardcoded string
      expect(errorToast.textContent).not.toContain('Download failed');
    });
  });
});
