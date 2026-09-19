/**
 * Purpose: Tests for PeerAssetsSection — shared files list with loading/empty states
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { PortalPeerAsset } from '@/lib/types/backend';

const mockUsePeerAssets = vi.fn();

vi.mock('@/lib/api/hooks/use-peers', () => ({
  usePeerAssets: (...args: unknown[]) => mockUsePeerAssets(...args),
}));

import { PeerAssetsSection } from '../PeerAssetsSection';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const ASSETS: PortalPeerAsset[] = [
  { cid: 'Qm1', filename: 'knowledge-base.json', file_type: 'json', size_bytes: 2048, download_count: 15 },
  { cid: 'Qm2', filename: 'model-weights.bin', file_type: 'bin', size_bytes: 1073741824, download_count: 3 },
];

describe('PeerAssetsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton while fetching', () => {
    mockUsePeerAssets.mockReturnValue({ data: undefined, isLoading: true });
    render(<PeerAssetsSection peerId="peer-1" />, { wrapper });
    expect(screen.getByTestId('peer-assets-loading')).toBeTruthy();
  });

  it('shows empty state when no assets', () => {
    mockUsePeerAssets.mockReturnValue({ data: [], isLoading: false });
    render(<PeerAssetsSection peerId="peer-1" />, { wrapper });
    expect(screen.getByText('No shared assets yet.')).toBeTruthy();
  });

  it('renders asset filenames', () => {
    mockUsePeerAssets.mockReturnValue({ data: ASSETS, isLoading: false });
    render(<PeerAssetsSection peerId="peer-1" />, { wrapper });
    expect(screen.getByText('knowledge-base.json')).toBeTruthy();
    expect(screen.getByText('model-weights.bin')).toBeTruthy();
  });

  it('renders file type badges', () => {
    mockUsePeerAssets.mockReturnValue({ data: ASSETS, isLoading: false });
    render(<PeerAssetsSection peerId="peer-1" />, { wrapper });
    expect(screen.getByText('json')).toBeTruthy();
    expect(screen.getByText('bin')).toBeTruthy();
  });

  it('renders human-readable file sizes', () => {
    mockUsePeerAssets.mockReturnValue({ data: ASSETS, isLoading: false });
    render(<PeerAssetsSection peerId="peer-1" />, { wrapper });
    expect(screen.getByText('2.0 KB')).toBeTruthy();
    expect(screen.getByText('1.0 GB')).toBeTruthy();
  });

  it('renders download counts', () => {
    mockUsePeerAssets.mockReturnValue({ data: ASSETS, isLoading: false });
    render(<PeerAssetsSection peerId="peer-1" />, { wrapper });
    expect(screen.getByText('15')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('passes peerId to usePeerAssets hook', () => {
    mockUsePeerAssets.mockReturnValue({ data: [], isLoading: false });
    render(<PeerAssetsSection peerId="peer-xyz" />, { wrapper });
    expect(mockUsePeerAssets).toHaveBeenCalledWith('peer-xyz');
  });

  it('renders section heading', () => {
    mockUsePeerAssets.mockReturnValue({ data: ASSETS, isLoading: false });
    render(<PeerAssetsSection peerId="peer-1" />, { wrapper });
    expect(screen.getByText('Shared Assets')).toBeTruthy();
  });
});
