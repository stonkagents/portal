/**
 * Purpose: Tests for sidebar label changes (Seeding/My Library) and share ratio display
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUseDaemon, mockUseTransferStats, mockUsePeerReputation } = vi.hoisted(() => ({
  mockUseDaemon: vi.fn(),
  mockUseTransferStats: vi.fn(),
  mockUsePeerReputation: vi.fn(),
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

describe('WI-4 + WI-5 + WI-6: Sidebar labels, share ratio, rep score', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDaemon.mockReturnValue({
      connected: true,
      daemonStatus: 'online',
      health: { status: 'ok', peerId: '12D3KooWtest123abcdef', peers: 5 },
    });
    mockUseTransferStats.mockReturnValue({
      data: {
        downloading: 2, uploading: 1, seeding: 3, library: 7,
        completed: 7, failed: 0, active: 3,
        totalUp: '0 B', totalDown: '0 B',
        totalUpBytes: 0, totalDownBytes: 1500,
        shareRatio: 0, speedUp: 0, speedDown: 0,
      },
    });
    mockUsePeerReputation.mockReturnValue({
      data: { clout: 92, rank: 'og', factors: [] },
    });
  });

  it('shows "Seeding" label instead of "Completed"', () => {
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const summary = screen.getByTestId('transfer-summary');
    expect(summary.textContent).toContain('Seeding');
    expect(summary.textContent).not.toContain('Completed');
  });

  it('shows "My Library" label instead of "Failed"', () => {
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const summary = screen.getByTestId('transfer-summary');
    expect(summary.textContent).toContain('My Library');
    expect(summary.textContent).not.toContain('Failed');
  });

  it('shows seeding count from stats', () => {
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const summary = screen.getByTestId('transfer-summary');
    expect(summary.textContent).toContain('3');
  });

  it('shows library count from stats', () => {
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const summary = screen.getByTestId('transfer-summary');
    expect(summary.textContent).toContain('7');
  });

  it('shows share ratio value from stats', () => {
    mockUseTransferStats.mockReturnValue({
      data: {
        downloading: 0, uploading: 0, seeding: 0, library: 0,
        completed: 0, failed: 0, active: 0,
        totalUp: '0 B', totalDown: '0 B',
        totalUpBytes: 3000, totalDownBytes: 1500,
        shareRatio: 2, speedUp: 0, speedDown: 0,
      },
    });
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const agentCard = screen.getByTestId('your-agent-card');
    expect(agentCard.textContent).toContain('2.00');
  });

  it('shows 0.00 share ratio when daemon offline (no bare dashes)', () => {
    mockUseDaemon.mockReturnValue({
      connected: false,
      daemonStatus: 'offline',
      health: null,
    });
    mockUseTransferStats.mockReturnValue({ data: undefined });
    mockUsePeerReputation.mockReturnValue({ data: undefined });
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const agentCard = screen.getByTestId('your-agent-card');
    const ratioSection = agentCard.textContent ?? '';
    expect(ratioSection).toContain('0.00');
    expect(ratioSection).not.toContain('-');
  });

  it('shows rep score as clout/10 with one decimal', () => {
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const agentCard = screen.getByTestId('your-agent-card');
    // clout=92 → 92/10 = 9.2
    expect(agentCard.textContent).toContain('9.2');
  });

  it('shows 0.0 rep score when data unavailable (no bare dashes)', () => {
    mockUsePeerReputation.mockReturnValue({ data: undefined });
    render(<GallerySidebar onSearchOpen={vi.fn()} onShareOpen={vi.fn()} />);
    const agentCard = screen.getByTestId('your-agent-card');
    expect(agentCard.textContent).toContain('Rep Score');
    expect(agentCard.textContent).toContain('0.0');
    expect(agentCard.textContent).not.toContain('-');
  });
});
