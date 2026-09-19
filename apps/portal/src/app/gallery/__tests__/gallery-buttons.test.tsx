/**
 * Purpose: Tests for gallery button wiring — Install, Pack Install, View All, type filter
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as DaemonModule from '@/lib/api/daemon';

// vi.hoisted runs before vi.mock factory — safe for shared refs
const { mockDownload } = vi.hoisted(() => ({
  mockDownload: vi.fn().mockResolvedValue({ cid: 'bafytest1', status: 'queued', message: 'Download started' }),
}));

// Mock modules before imports
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

// JSDOM lacks HTMLDialogElement.showModal/close — polyfill with open attribute toggle
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

// Must import after mocks
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

describe('Gallery Button Wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('search Download button calls daemonApi.download and shows success toast', async () => {
    renderGalleryPage();

    // Open search modal via sidebar button
    const searchBtn = screen.getByRole('button', { name: /search network/i });
    fireEvent.click(searchBtn);

    // Find the Download button in search results (copy history: "Get" → "Install" → "Download")
    const downloadBtns = await screen.findAllByRole('button', { name: /^download$/i });
    // Filter to the one inside a search result row
    const searchInstallBtn = downloadBtns.find(btn => btn.closest('[data-testid^="search-result-"]'));
    expect(searchInstallBtn).toBeDefined();
    fireEvent.click(searchInstallBtn!);

    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledWith('bafytest1');
    });

    await waitFor(() => {
      expect(screen.getByTestId('toast-success')).toHaveTextContent('Download queued: test-agent.vec');
    });
  });

  it('renders curated packs without the retired install and view-all controls', () => {
    renderGalleryPage();

    expect(screen.getByTestId('curated-packs')).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^pack-install-/)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /view all/i })).not.toBeInTheDocument();
  });
});
