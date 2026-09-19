/**
 * Purpose: Tests for TrustedAgentsList — trusted/blocked peer management
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { TrustedAgentsList } from '../TrustedAgentsList';
import type { Peer } from '@/lib/types/peer';

function makePeer(overrides: Partial<Peer> = {}): Peer {
  return {
    id: 'peer-1',
    agentId: '12D3KooW...abc',
    displayName: 'AlphaAgent',
    status: 'online',
    reputation: 7.5,
    rank: 'gold',
    bandwidthUp: 100,
    bandwidthDown: 50,
    assetsShared: 12,
    country: 'US',
    lastSeen: '2026-02-16T12:00:00Z',
    ...overrides,
  };
}

const peers: Peer[] = [
  makePeer({ id: 'peer-a', displayName: 'AlphaAgent', agentId: '12D3...aaa' }),
  makePeer({ id: 'peer-b', displayName: 'BetaBot', agentId: '12D3...bbb' }),
  makePeer({ id: 'peer-c', displayName: 'GammaNode', agentId: '12D3...ccc' }),
];

describe('TrustedAgentsList', () => {
  it('renders trusted peers section with peer names', () => {
    render(
      <TrustedAgentsList trustedIds={['peer-a', 'peer-b']} blockedIds={[]} peers={peers} onUntrust={vi.fn()} onUnblock={vi.fn()} />,
    );

    const trustedSection = screen.getByTestId('trusted-section');
    expect(within(trustedSection).getByText('AlphaAgent')).toBeTruthy();
    expect(within(trustedSection).getByText('BetaBot')).toBeTruthy();
  });

  it('renders blocked peers section with peer names', () => {
    render(<TrustedAgentsList trustedIds={[]} blockedIds={['peer-c']} peers={peers} onUntrust={vi.fn()} onUnblock={vi.fn()} />);

    const blockedSection = screen.getByTestId('blocked-section');
    expect(within(blockedSection).getByText('GammaNode')).toBeTruthy();
  });

  it('calls onUntrust when untrust button clicked', () => {
    const onUntrust = vi.fn();

    render(<TrustedAgentsList trustedIds={['peer-a']} blockedIds={[]} peers={peers} onUntrust={onUntrust} onUnblock={vi.fn()} />);

    fireEvent.click(screen.getByTestId('untrust-peer-a'));
    expect(onUntrust).toHaveBeenCalledWith('peer-a');
  });

  it('calls onUnblock when unblock button clicked', () => {
    const onUnblock = vi.fn();

    render(<TrustedAgentsList trustedIds={[]} blockedIds={['peer-c']} peers={peers} onUntrust={vi.fn()} onUnblock={onUnblock} />);

    fireEvent.click(screen.getByTestId('unblock-peer-c'));
    expect(onUnblock).toHaveBeenCalledWith('peer-c');
  });

  it('shows empty state when no trusted peers', () => {
    render(<TrustedAgentsList trustedIds={[]} blockedIds={[]} peers={peers} onUntrust={vi.fn()} onUnblock={vi.fn()} />);

    expect(screen.getByText(/no trusted agents/i)).toBeTruthy();
  });

  it('shows peer ID fallback for unknown peer', () => {
    render(<TrustedAgentsList trustedIds={['unknown-id']} blockedIds={[]} peers={peers} onUntrust={vi.fn()} onUnblock={vi.fn()} />);

    expect(screen.getByText('unknown-id')).toBeTruthy();
  });

  it('hides blocked section when no blocked peers', () => {
    render(<TrustedAgentsList trustedIds={['peer-a']} blockedIds={[]} peers={peers} onUntrust={vi.fn()} onUnblock={vi.fn()} />);

    expect(screen.queryByTestId('blocked-section')).toBeNull();
  });

  it('shows trusted count in section header', () => {
    render(
      <TrustedAgentsList trustedIds={['peer-a', 'peer-b']} blockedIds={[]} peers={peers} onUntrust={vi.fn()} onUnblock={vi.fn()} />,
    );

    expect(screen.getByText(/trusted.*2/i)).toBeTruthy();
  });
});
