/**
 * Purpose: Tests for sidebar wiring — real daemon data for Agent card + transfer stats + peer reputation
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Full-length libp2p peer id (52 chars) — truncateAgentId only shortens ids longer than 24 chars. */
const TEST_PEER_ID = '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab';

const { mockUseDaemon, mockUseTransferStats, mockUsePeerReputation } = vi.hoisted(() => ({
  mockUseDaemon: vi.fn().mockReturnValue({
    connected: true,
    daemonStatus: 'online',
    health: { status: 'ok', peerId: '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab', peers: 5 },
  }),
  mockUseTransferStats: vi.fn().mockReturnValue({
    data: {
      downloading: 2,
      uploading: 1,
      seeding: 0,
      completed: 5,
      failed: 0,
      active: 3,
      totalUp: '0 B',
      totalDown: '0 B',
      speedUp: 0,
      speedDown: 0,
    },
  }),
  mockUsePeerReputation: vi.fn().mockReturnValue({
    data: { clout: 72, rank: 'gold', factors: [] },
  }),
}));

/* The display name is read through its own hook; these tests are about the id and the rest of the surface. */
vi.mock('@/lib/api/hooks/use-agent-identity', () => ({
  useAgentIdentity: () => ({ data: null, isLoading: false, isFetched: true, isError: false }),
}));

vi.mock('@/providers/DaemonProvider', () => ({
  useDaemon: mockUseDaemon,
}));

vi.mock('@/lib/api/hooks/use-transfers', () => ({
  useTransferStats: mockUseTransferStats,
}));

vi.mock('@/lib/api/hooks/use-peers', () => ({
  usePeerReputation: mockUsePeerReputation,
}));

import { GallerySidebar } from '../_components/GallerySidebar';

describe('Sidebar Wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDaemon.mockReturnValue({
      connected: true,
      daemonStatus: 'online',
      health: { status: 'ok', peerId: TEST_PEER_ID, peers: 5 },
    });
    mockUseTransferStats.mockReturnValue({
      data: {
        downloading: 2,
        uploading: 1,
        seeding: 0,
        completed: 5,
        failed: 0,
        active: 3,
        totalUp: '0 B',
        totalDown: '0 B',
        speedUp: 0,
        speedDown: 0,
      },
    });
    mockUsePeerReputation.mockReturnValue({
      data: { clout: 72, rank: 'gold', factors: [] },
    });
  });

  it('shows truncated peerId and online badge when connected', () => {
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const agentCard = screen.getByTestId('your-agent-card');
    // first 16 chars + "..." + last 4 chars
    expect(agentCard.textContent).toContain('12D3KooWtest123a...89ab');
    expect(agentCard.textContent).not.toContain(TEST_PEER_ID);
    expect(agentCard.textContent).toContain('Online');
  });

  it('shows transfer stats from useTransferStats', () => {
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const summary = screen.getByTestId('transfer-summary');
    expect(summary.textContent).toContain('Downloading');
    expect(summary.textContent).toContain('2');
    expect(summary.textContent).toContain('Uploading');
    expect(summary.textContent).toContain('1');
  });

  it('shows rep score from usePeerReputation using daemon peerId', () => {
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const agentCard = screen.getByTestId('your-agent-card');
    // clout=72, displayed as clout/10 = 7.2
    expect(agentCard.textContent).toContain('7.2');
    // usePeerReputation should be called with the daemon's peerId
    expect(mockUsePeerReputation).toHaveBeenCalledWith(TEST_PEER_ID);
  });

  it('shows offline state when daemon disconnected', () => {
    mockUseDaemon.mockReturnValue({
      connected: false,
      daemonStatus: 'offline',
      health: { status: 'offline', peerId: '', peers: 0 },
    });
    mockUseTransferStats.mockReturnValue({ data: undefined });
    mockUsePeerReputation.mockReturnValue({ data: undefined });

    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const agentCard = screen.getByTestId('your-agent-card');
    expect(agentCard.textContent).toContain('Offline');
  });
});
