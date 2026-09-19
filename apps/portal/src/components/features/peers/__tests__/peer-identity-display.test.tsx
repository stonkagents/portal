/**
 * Purpose: Peer surfaces show the display name first and keep the peer id
 *          masked (full id in the tooltip): peer cards, the network table, the
 *          profile panel, the trusted list fallback and the node hero's own name.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PeerCard } from '../PeerCard';
import { NetworkTable } from '../NetworkTable';
import { AgentProfilePanel } from '../AgentProfilePanel';
import { TrustedAgentsList } from '../TrustedAgentsList';
import { NodeHeroCard } from '../NodeHeroCard';
import type { Peer } from '@/lib/types/peer';

vi.mock('@/providers/DaemonProvider', () => ({ useDaemon: () => ({ connected: true }) }));
vi.mock('@/providers/I18nProvider', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../PeerAssetsSection', () => ({ PeerAssetsSection: () => null }));
vi.mock('../PeerActivitySection', () => ({ PeerActivitySection: () => null }));

const PEER_ID = '12D3KooWtest123abcdefGHIJKLMNOPQRSTUVWXYZ0123456789ab';
const MASKED = '12D3KooWtest123a...89ab';

const peer: Peer = {
  id: PEER_ID,
  agentId: PEER_ID,
  displayName: 'Alice Agent',
  status: 'online',
  reputation: 7.5,
  rank: 'gold',
  bandwidthUp: 100,
  bandwidthDown: 50,
  assetsShared: 12,
  country: 'US',
  lastSeen: '2026-02-16T12:00:00Z',
};

describe('PeerCard', () => {
  it('shows the name and the masked id with the full id as tooltip', () => {
    render(
      <PeerCard
        displayName={peer.displayName}
        agentId={peer.agentId}
        connectionType="direct"
        country="US"
        latency={1}
        reputation={7.5}
        bandwidthUp={1}
        bandwidthDown={1}
        transfers={[]}
      />,
    );
    expect(screen.getByText('Alice Agent')).toBeInTheDocument();
    expect(screen.getByText(MASKED)).toHaveAttribute('title', PEER_ID);
    expect(screen.queryByText(PEER_ID)).not.toBeInTheDocument();
  });
});

describe('NetworkTable', () => {
  it('lists the masked id and the name', () => {
    render(<NetworkTable peers={[peer]} />);
    expect(screen.getByText(MASKED)).toHaveAttribute('title', PEER_ID);
    expect(screen.getByText('Alice Agent')).toBeInTheDocument();
  });
});

describe('AgentProfilePanel', () => {
  it('heads the panel with the name and the masked id', () => {
    render(<AgentProfilePanel peer={peer} open onClose={() => {}} />);
    const panel = screen.getByTestId('agent-profile-panel');
    expect(within(panel).getByText('Alice Agent')).toBeInTheDocument();
    expect(within(panel).getByText(MASKED)).toHaveAttribute('title', PEER_ID);
  });
});

describe('TrustedAgentsList', () => {
  it('masks a trusted id the directory does not list', () => {
    render(<TrustedAgentsList trustedIds={[PEER_ID]} blockedIds={[]} peers={[]} onUntrust={() => {}} onUnblock={() => {}} />);
    expect(within(screen.getByTestId('trusted-section')).getByText(MASKED)).toBeInTheDocument();
    expect(screen.queryByText(PEER_ID)).not.toBeInTheDocument();
  });
});

describe('NodeHeroCard', () => {
  const props = {
    peerId: MASKED,
    uploadSpeed: 0,
    downloadSpeed: 0,
    connectedPeers: 0,
    shareRatio: 0,
    reputation: 0,
    uptime: '-',
    totalShared: '0',
    health: { nat: '-', dht: '-', mdns: '-', relay: '-' },
  };

  it('shows the display name beside the id when set', () => {
    render(<NodeHeroCard {...props} displayName="Alice Agent" />);
    expect(screen.getByTestId('node-hero-display-name')).toHaveTextContent('Alice Agent');
    expect(screen.getByText(MASKED)).toBeInTheDocument();
  });

  it('shows only the id without a name', () => {
    render(<NodeHeroCard {...props} displayName={null} />);
    expect(screen.queryByTestId('node-hero-display-name')).not.toBeInTheDocument();
    expect(screen.getByText(MASKED)).toBeInTheDocument();
  });
});
