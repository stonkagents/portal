/**
 * Purpose: Tests for BoardSidebar — uses real API hooks, no mock-data imports
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/client', () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from '@/lib/api/client';
import { BoardSidebar } from '../BoardSidebar';

const mockedApiClient = vi.mocked(apiClient);

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('BoardSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders network stats from useBoardStats hook', async () => {
    // First call = stats, second call = seeders
    mockedApiClient
      .mockResolvedValueOnce({
        total_peers: 0,
        online_peers: 42,
        offline_peers: 0,
        total_seeders: 0,
        total_leechers: 0,
        total_assets: 789,
        total_upload_bytes: 0,
        total_download_bytes: 0,
        trending_count: 0,
      })
      .mockResolvedValueOnce([{ rank: 1, masked_peer_id: 'peer-abc1...x7z9', total_upload_bytes: 50000000 }]);

    render(createElement(BoardSidebar), { wrapper: createWrapper() });

    // Wait for async data to render within the stats widget
    await waitFor(() => {
      const statsWidget = screen.getByTestId('network-stats-widget');
      expect(statsWidget.textContent).toContain('42');
    });
    const statsWidget = screen.getByTestId('network-stats-widget');
    expect(statsWidget.textContent).toContain('789');
    expect(statsWidget.textContent).not.toContain('1,247');
    expect(statsWidget.textContent).not.toContain('12,456');
  });

  it('renders top seeders from useTopSeeders hook', async () => {
    mockedApiClient
      .mockResolvedValueOnce({
        total_peers: 0,
        online_peers: 10,
        offline_peers: 0,
        total_seeders: 0,
        total_leechers: 0,
        total_assets: 100,
        total_upload_bytes: 0,
        total_download_bytes: 0,
        trending_count: 0,
      })
      .mockResolvedValueOnce([
        { rank: 1, masked_peer_id: 'peer-abc1...x7z9', total_upload_bytes: 50000000 },
        { rank: 2, masked_peer_id: 'peer-def2...w8y0', total_upload_bytes: 30000000 },
      ]);

    render(createElement(BoardSidebar), { wrapper: createWrapper() });

    // Wait for async seeder data to render
    await waitFor(() => {
      const seedersWidget = screen.getByTestId('top-agents');
      expect(seedersWidget.textContent).toContain('peer-abc1...x7z9');
    });
    const seedersWidget = screen.getByTestId('top-agents');
    expect(seedersWidget.textContent).toContain('peer-def2...w8y0');
    // Should NOT contain hardcoded mock agent names
    expect(seedersWidget.textContent).not.toContain('embedding-factory-v2');
  });
  it('names a seeder by display name when the tracker sends one, masked id in the tooltip', async () => {
    mockedApiClient
      .mockResolvedValueOnce({
        total_peers: 0,
        online_peers: 10,
        offline_peers: 0,
        total_seeders: 0,
        total_leechers: 0,
        total_assets: 100,
        total_upload_bytes: 0,
        total_download_bytes: 0,
        trending_count: 0,
      })
      .mockResolvedValueOnce([
        { rank: 1, masked_peer_id: 'peer-abc1...x7z9', display_name: 'Alice Agent', total_upload_bytes: 50000000 },
        { rank: 2, masked_peer_id: 'peer-def2...w8y0', total_upload_bytes: 30000000 },
      ]);

    render(createElement(BoardSidebar), { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByTestId('top-seeder-1')).toHaveTextContent('Alice Agent'));
    expect(screen.getByTestId('top-seeder-1')).toHaveAttribute('title', 'peer-abc1...x7z9');
    expect(screen.getByTestId('top-seeder-2')).toHaveTextContent('peer-def2...w8y0');
    expect(screen.getByTestId('top-seeder-2')).not.toHaveAttribute('title');
  });
});

