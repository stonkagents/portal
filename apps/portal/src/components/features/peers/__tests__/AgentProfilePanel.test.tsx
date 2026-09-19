/**
 * Purpose: Tests for AgentProfilePanel — real EigenTrust factors, badges, trust/block actions
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { AgentProfilePanel } from '../AgentProfilePanel';
import type { Peer, PeerReputation, PeerBadge } from '@/lib/types/peer';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const peer: Peer = {
  id: 'peer-1',
  agentId: 'abc123def456',
  displayName: 'DataMax',
  status: 'online',
  reputation: 72,
  rank: 'gold',
  bandwidthUp: 5000000,
  bandwidthDown: 3000000,
  assetsShared: 12,
  country: 'USA',
  city: 'Austin',
  lat: 30.27,
  lng: -97.74,
  lastSeen: '2026-02-16T10:00:00Z',
};

const badges: PeerBadge[] = [
  { id: 'early_adopter', icon: 'zap', label: 'Early Adopter', status: 'earned' },
  { id: 'top_seeder', icon: 'star', label: 'Top Seeder', status: 'rare' },
  { id: 'og_status', icon: 'award', label: 'Og Status', status: 'locked' },
];

const reputation: PeerReputation = {
  clout: 72,
  rank: 'gold',
  factors: [
    { name: 'Bandwidth', value: 8.5, weight: 40, color: 'green' },
    { name: 'Quality', value: 6.0, weight: 30, color: 'blue' },
    { name: 'Security', value: 9.0, weight: 20, color: 'yellow' },
    { name: 'Citizenship', value: 4.5, weight: 10, color: 'green' },
  ],
  badges,
  weeklyBonus: 50,
  trend: 3.2,
};

describe('AgentProfilePanel', () => {
  const defaultProps = {
    peer,
    open: true,
    onClose: vi.fn(),
    onTrust: vi.fn(),
    onBlock: vi.fn(),
    reputation,
  };

  it('renders null when peer is null', () => {
    const { container } = render(<AgentProfilePanel {...defaultProps} peer={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders peer identity', () => {
    render(<AgentProfilePanel {...defaultProps} />, { wrapper });
    expect(screen.getByText('DataMax')).toBeInTheDocument();
    expect(screen.getByText('abc123def456')).toBeInTheDocument();
  });

  it('renders all 4 real EigenTrust factors (not mock virality)', () => {
    render(<AgentProfilePanel {...defaultProps} />, { wrapper });
    expect(screen.getByText('Bandwidth')).toBeInTheDocument();
    expect(screen.getByText('Quality')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Citizenship')).toBeInTheDocument();
    expect(screen.queryByText('Virality')).not.toBeInTheDocument();
  });

  it('renders badges when reputation data is provided', () => {
    render(<AgentProfilePanel {...defaultProps} />, { wrapper });
    expect(screen.getByText('Early Adopter')).toBeInTheDocument();
    expect(screen.getByText('Top Seeder')).toBeInTheDocument();
    expect(screen.getByText('Og Status')).toBeInTheDocument();
  });

  it('renders trend indicator when trend is present', () => {
    render(<AgentProfilePanel {...defaultProps} />, { wrapper });
    expect(screen.getByTestId('reputation-trend')).toBeInTheDocument();
  });

  it('renders weekly bonus when present', () => {
    render(<AgentProfilePanel {...defaultProps} />, { wrapper });
    expect(screen.getByText(/\+50/)).toBeInTheDocument();
  });

  it('renders without badges section when reputation has empty badges', () => {
    const repNoBadges = { ...reputation, badges: [] };
    render(<AgentProfilePanel {...defaultProps} reputation={repNoBadges} />, { wrapper });
    expect(screen.queryByTestId('badges-section')).not.toBeInTheDocument();
  });

  it('renders loading state when reputation is undefined', () => {
    render(<AgentProfilePanel {...defaultProps} reputation={undefined} />, { wrapper });
    expect(screen.getByTestId('reputation-loading')).toBeInTheDocument();
  });

  it('calls onTrust with peer id', () => {
    const onTrust = vi.fn();
    render(<AgentProfilePanel {...defaultProps} onTrust={onTrust} />, { wrapper });
    fireEvent.click(screen.getByTestId('agent-profile-trust'));
    expect(onTrust).toHaveBeenCalledWith('peer-1');
  });

  it('calls onBlock with peer id', () => {
    const onBlock = vi.fn();
    render(<AgentProfilePanel {...defaultProps} onBlock={onBlock} />, { wrapper });
    fireEvent.click(screen.getByTestId('agent-profile-block'));
    expect(onBlock).toHaveBeenCalledWith('peer-1');
  });

  it('has the panel data-testid', () => {
    render(<AgentProfilePanel {...defaultProps} />, { wrapper });
    expect(screen.getByTestId('agent-profile-panel')).toBeInTheDocument();
  });
});
