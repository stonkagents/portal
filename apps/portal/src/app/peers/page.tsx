/**
 * Purpose: Network page — your connections and the agent directory
 */
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon, TabBar } from '@/components/ui';
import { truncateAgentId } from '@/lib/utils/format';
import {
  NodeHeroCard,
  PeerCard,
  NetworkTable,
  AgentProfilePanel,
  PeersEmptyState,
  TrustedAgentsList,
} from '@/components/features/peers';
import {
  usePeers,
  usePeerReputation,
  useTrustPeer,
  useBlockPeer,
  useTrustedPeers,
  useBlockedPeers,
  useUntrustPeer,
  useUnblockPeer,
} from '@/lib/api/hooks/use-peers';
import { useAgentIdentity } from '@/lib/api/hooks/use-agent-identity';
import { cleanDisplayName } from '@/lib/agent-name';
import { useDaemon } from '@/providers/DaemonProvider';
import { useDeviceType } from '@/lib/hooks/use-device-type';
import type { Peer } from '@/lib/types';

function formatUptime(seconds: number): string {
  if (seconds <= 0) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m === 0) return '< 1m';
  return `${m}m`;
}

function StatCard({ value, label, color = 'text-text-primary' }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="bg-bg-secondary border border-border-default rounded-lg p-3 text-center">
      <div className={`text-2xl font-bold leading-tight ${color}`}>{value}</div>
      <div className="text-xs text-text-secondary uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

type PeerTransfer = { direction: 'up' | 'down'; name: string; speed: number };
type MyPeer = Peer & {
  connectionType: 'direct' | 'relayed' | 'mdns';
  latency: number;
  connectedSince: string;
  transfers: PeerTransfer[];
};

function isMyPeerArray(data: unknown[]): data is MyPeer[] {
  return data.length > 0 && typeof data[0] === 'object' && data[0] !== null && 'connectionType' in data[0];
}

export default function PeersPage() {
  const { data: apiPeers } = usePeers();
  const peerList = apiPeers ?? [];
  const myPeers = apiPeers && isMyPeerArray(apiPeers) ? apiPeers : [];
  const networkPeers = peerList;

  const connectedCount = peerList.filter(p => p.status === 'online' || p.status === 'seeding').length;
  const totalCount = peerList.length;
  const sharingTo = peerList.filter(p => p.assetsShared > 0).length;
  const avgReputation = totalCount > 0 ? peerList.reduce((sum, p) => sum + p.reputation, 0) / totalCount : 0;

  const tabs = [
    { id: 'my-peers', label: 'My Agents', count: connectedCount },
    { id: 'network', label: 'Network', count: totalCount },
  ];

  const { connected, toggleDaemon, health } = useDaemon();
  const { data: identity } = useAgentIdentity();
  const { isMobile } = useDeviceType();

  const t = health.transfer;
  const hi = health.healthIndicators;

  const realNodeStats = {
    peerId: truncateAgentId(health.peerId),
    displayName: cleanDisplayName(identity?.displayName),
    uploadSpeed: Math.round((t.uploadSpeedBps / 1_000_000) * 100) / 100,
    downloadSpeed: Math.round((t.downloadSpeedBps / 1_000_000) * 100) / 100,
    connectedPeers: health.peers,
    shareRatio: t.shareRatio,
    reputation: 0,
    uptime: formatUptime(health.uptimeSeconds),
    totalShared: String(health.sharedAssets),
    health: {
      nat: hi.natStatus === 'unknown' ? '-' : hi.natStatus,
      dht: hi.dhtReady ? 'Healthy' : '-',
      mdns: hi.mdnsReady ? 'Active' : '-',
      relay: hi.relayConnected ? 'Connected' : '-',
    },
  };

  const [activeTab, setActiveTab] = useState('my-peers');
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const { data: peerReputation, isError: peerReputationFailed } = usePeerReputation(selectedPeer?.id ?? '');
  const trustMutation = useTrustPeer();
  const blockMutation = useBlockPeer();
  const untrustMutation = useUntrustPeer();
  const unblockMutation = useUnblockPeer();
  const { data: trustedData } = useTrustedPeers();
  const { data: blockedData } = useBlockedPeers();

  const handleToggleConnection = useCallback(() => {
    toggleDaemon();
  }, [toggleDaemon]);

  const openProfile = useCallback((peer: Peer) => {
    setSelectedPeer(peer);
    setProfileOpen(true);
  }, []);

  /* A board mention links here as /peers?peer=<id>: once the list is in, open that agent's profile, once. */
  const linkedPeerId = useSearchParams().get('peer');
  const linkedHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedPeerId || linkedHandledRef.current === linkedPeerId) return;
    const peer = (apiPeers ?? []).find(p => p.id === linkedPeerId || p.agentId === linkedPeerId);
    if (!peer) return;
    linkedHandledRef.current = linkedPeerId;
    openProfile(peer);
  }, [linkedPeerId, apiPeers, openProfile]);

  const handleTrust = useCallback(
    (peerId: string) => {
      trustMutation.mutate(peerId);
      setProfileOpen(false);
    },
    [trustMutation],
  );

  const handleBlock = useCallback(
    (peerId: string) => {
      blockMutation.mutate(peerId);
      setProfileOpen(false);
    },
    [blockMutation],
  );

  return (
    <div className="flex-1 min-w-0 p-4 flex flex-col gap-4 max-w-[1400px] mx-auto w-full" data-testid="peers-page">
      {/* Page Header — wifi icon + "Network" + subtitle; the nav calls this page Network */}
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
          <Icon name="wifi" /> Network
        </h1>
        <p className="text-sm text-text-secondary mt-1">Manage connections and monitor agent activity on the network</p>
      </div>

      {/* Node Hero Card — .node-hero */}
      <NodeHeroCard {...realNodeStats} connected={connected} onToggleConnection={handleToggleConnection} />

      {/* Tab Bar — .tab-bar: My Agents (link icon) | Network (globe icon) */}
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'my-peers' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="my-peers-stats">
          <StatCard value={connectedCount} label="Connected" color="text-accent-green" />
          <StatCard value={sharingTo} label="Sharing To" color="text-accent-green" />
          <StatCard value={0} label="Installing From" color="text-accent-blue" />
          <StatCard value={0} label="My Ratio" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="network-stats">
          <StatCard value={totalCount.toLocaleString()} label="Total Agents" />
          <StatCard value={connectedCount} label="Online" color="text-accent-green" />
          <StatCard value={0} label="Seeding" color="text-accent-blue" />
          <StatCard value={avgReputation.toFixed(1)} label="Avg Reputation" />
        </div>
      )}

      {connected ? (
        <>
          {/* My Agents — connected cards + trusted/blocked management */}
          {activeTab === 'my-peers' && (
            <>
              {myPeers.length > 0 && (
                <div data-testid="peer-card-list">
                  {myPeers.map(peer => (
                    <PeerCard
                      key={peer.id}
                      displayName={peer.displayName}
                      agentId={peer.agentId}
                      connectionType={peer.connectionType}
                      country={peer.country}
                      latency={peer.latency}
                      reputation={peer.reputation}
                      bandwidthUp={peer.bandwidthUp}
                      bandwidthDown={peer.bandwidthDown}
                      transfers={peer.transfers}
                      trusted={trustedData?.peer_ids?.includes(peer.id) ?? false}
                      onClick={() => openProfile(peer)}
                      onTrust={() => trustMutation.mutate(peer.id)}
                      onBlock={() => blockMutation.mutate(peer.id)}
                    />
                  ))}
                </div>
              )}
              <TrustedAgentsList
                trustedIds={trustedData?.peer_ids ?? []}
                blockedIds={blockedData?.peer_ids ?? []}
                peers={peerList}
                onUntrust={id => untrustMutation.mutate(id)}
                onUnblock={id => unblockMutation.mutate(id)}
              />
            </>
          )}

          {/* Network — table layout (matches peers.html #network-view) */}
          {activeTab === 'network' && <NetworkTable peers={networkPeers} onPeerClick={openProfile} />}
        </>
      ) : isMobile ? (
        /* Mobile without a running agent — show read-only network browse */
        <NetworkTable peers={networkPeers} onPeerClick={openProfile} />
      ) : (
        <PeersEmptyState onStartDaemon={handleToggleConnection} />
      )}

      {/* Agent Profile Slide-In — matches peers.html .agent-profile */}
      <AgentProfilePanel
        peer={selectedPeer}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onTrust={handleTrust}
        onBlock={handleBlock}
        reputation={peerReputation}
        reputationFailed={peerReputationFailed}
        agentConnected={connected}
      />
    </div>
  );
}
