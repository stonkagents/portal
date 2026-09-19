/**
 * Purpose: TDD tests for NodeHeroCard — verifies transfer stats and health indicators render
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NodeHeroCard } from '../NodeHeroCard';

const defaultProps = {
  peerId: '12D3KooWTest...abcd',
  uploadSpeed: 0,
  downloadSpeed: 0,
  connectedPeers: 0,
  shareRatio: 0,
  reputation: 0,
  uptime: '-',
  totalShared: '0',
  health: { nat: '-', dht: '-', mdns: '-', relay: '-' },
  connected: true,
};

describe('NodeHeroCard', () => {
  it('renders peer ID', () => {
    render(<NodeHeroCard {...defaultProps} />);
    expect(screen.getByText('12D3KooWTest...abcd')).toBeDefined();
  });

  it('renders upload speed from transfer stats', () => {
    render(<NodeHeroCard {...defaultProps} uploadSpeed={1.5} />);
    expect(screen.getByText('↑ 1.5')).toBeDefined();
  });

  it('renders download speed from transfer stats', () => {
    render(<NodeHeroCard {...defaultProps} downloadSpeed={2.3} />);
    expect(screen.getByText('↓ 2.3')).toBeDefined();
  });

  it('renders share ratio', () => {
    render(<NodeHeroCard {...defaultProps} shareRatio={1.25} />);
    expect(screen.getByText('1.25')).toBeDefined();
  });

  it('renders health indicators with real values', () => {
    render(<NodeHeroCard {...defaultProps} health={{ nat: 'Open', dht: 'Healthy (142)', mdns: 'Active', relay: 'Not needed' }} />);
    expect(screen.getByText('NAT: Open')).toBeDefined();
    expect(screen.getByText('DHT: Healthy (142)')).toBeDefined();
    expect(screen.getByText('mDNS: Active')).toBeDefined();
    expect(screen.getByText('Relay: Not needed')).toBeDefined();
  });

  it('shows green dot when connected', () => {
    render(<NodeHeroCard {...defaultProps} connected={true} />);
    expect(screen.getByText('Connected to the Network')).toBeDefined();
  });

  it('shows red dot when disconnected', () => {
    render(<NodeHeroCard {...defaultProps} connected={false} />);
    expect(screen.getByText('Disconnected')).toBeDefined();
  });

  it('renders connected peers count', () => {
    render(<NodeHeroCard {...defaultProps} connectedPeers={42} />);
    expect(screen.getByText('42')).toBeDefined();
  });
});
