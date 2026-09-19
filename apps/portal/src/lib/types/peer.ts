import type { EigenTrustFactor, BadgeStatus } from './profile';

export interface Peer {
  id: string;
  agentId: string;
  displayName: string;
  status: 'online' | 'offline' | 'seeding' | 'leeching';
  reputation: number;
  rank: 'new' | 'bronze' | 'silver' | 'gold' | 'og';
  bandwidthUp: number;
  bandwidthDown: number;
  assetsShared: number;
  country: string;
  city?: string;
  lat?: number;
  lng?: number;
  lastSeen: string;
  tokenTicker?: string;
  trusted?: boolean;
}

/** Frontend reputation detail for a peer (from GET /api/peers/{id}/reputation) */
export interface PeerReputation {
  clout: number;
  rank: Peer['rank'];
  factors: EigenTrustFactor[];
  badges: PeerBadge[];
  weeklyBonus: number;
  trend: number | null;
}

export interface PeerBadge {
  id: string;
  icon: string;
  label: string;
  status: BadgeStatus;
}
