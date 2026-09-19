/**
 * Purpose: Tests for PeerActivitySection — activity timeline with loading/empty states
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { PortalPeerActivity } from '@/lib/types/backend';

const mockUsePeerActivity = vi.fn();

vi.mock('@/lib/api/hooks/use-peers', () => ({
  usePeerActivity: (...args: unknown[]) => mockUsePeerActivity(...args),
}));

import { PeerActivitySection } from '../PeerActivitySection';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const ACTIVITIES: PortalPeerActivity[] = [
  { action: 'shared', details: 'Uploaded knowledge-base.json', time: '2026-02-16T10:00:00Z' },
  { action: 'trusted', details: 'Trusted peer AlphaAgent', time: '2026-02-16T09:30:00Z' },
];

describe('PeerActivitySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton while fetching', () => {
    mockUsePeerActivity.mockReturnValue({ data: undefined, isLoading: true });
    render(<PeerActivitySection peerId="peer-1" />, { wrapper });
    expect(screen.getByTestId('peer-activity-loading')).toBeTruthy();
  });

  it('shows empty state when no activity', () => {
    mockUsePeerActivity.mockReturnValue({ data: [], isLoading: false });
    render(<PeerActivitySection peerId="peer-1" />, { wrapper });
    expect(screen.getByText('No recent activity')).toBeTruthy();
  });

  it('renders activity actions', () => {
    mockUsePeerActivity.mockReturnValue({ data: ACTIVITIES, isLoading: false });
    render(<PeerActivitySection peerId="peer-1" />, { wrapper });
    expect(screen.getByText('shared')).toBeTruthy();
    expect(screen.getByText('trusted')).toBeTruthy();
  });

  it('renders activity details', () => {
    mockUsePeerActivity.mockReturnValue({ data: ACTIVITIES, isLoading: false });
    render(<PeerActivitySection peerId="peer-1" />, { wrapper });
    expect(screen.getByText('Uploaded knowledge-base.json')).toBeTruthy();
    expect(screen.getByText('Trusted peer AlphaAgent')).toBeTruthy();
  });

  it('passes peerId to usePeerActivity hook', () => {
    mockUsePeerActivity.mockReturnValue({ data: [], isLoading: false });
    render(<PeerActivitySection peerId="peer-xyz" />, { wrapper });
    expect(mockUsePeerActivity).toHaveBeenCalledWith('peer-xyz');
  });

  it('renders section heading', () => {
    mockUsePeerActivity.mockReturnValue({ data: ACTIVITIES, isLoading: false });
    render(<PeerActivitySection peerId="peer-1" />, { wrapper });
    expect(screen.getByText('Recent Activity')).toBeTruthy();
  });
});
