/**
 * Purpose: Transform tracker portal peer responses to frontend types
 */

import type { Peer, PeerReputation, PeerBadge } from '@/lib/types/peer';
import type { BadgeStatus } from '@/lib/types/profile';
import type { PortalPeer, PortalPeerReputation } from '@/lib/types/backend';

/** Map PortalPeer → Peer: tier→rank lowercase, field renames, enriched geo + bandwidth */
export function transformPeer(raw: PortalPeer): Peer {
  return {
    id: raw.id,
    agentId: raw.peerId,
    displayName: raw.name,
    status: raw.status,
    reputation: raw.reputation,
    rank: raw.tier.toLowerCase() as Peer['rank'],
    bandwidthUp: raw.totalUploadBytes,
    bandwidthDown: raw.totalDownloadBytes,
    assetsShared: raw.sharedFiles,
    country: raw.country || raw.location,
    city: raw.city,
    lat: raw.lat,
    lng: raw.lng,
    lastSeen: raw.lastSeen,
  };
}

// ── Reputation transformer ──

const EIGENTRUST_WEIGHTS = { bandwidth: 40, quality: 30, security: 20, citizenship: 10 } as const;

const BADGE_META: Record<string, { icon: string }> = {
  early_adopter: { icon: 'zap' },
  first_drop: { icon: 'upload' },
  swarm_joiner: { icon: 'users' },
  top_seeder: { icon: 'star' },
  trusted_node: { icon: 'shield' },
  og_status: { icon: 'award' },
  global_relay: { icon: 'globe' },
  community_hero: { icon: 'heart' },
};

const VALID_BADGE_STATUSES: ReadonlySet<string> = new Set(['earned', 'rare', 'locked']);

const SCORE_SCALE_FACTOR = 10;
const CLOUT_SCALE_FACTOR = 100;

function badgeLabelFromId(id: string): string {
  return id
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Map PortalPeerReputation → PeerReputation: scale scores, map badges, pass trend */
export function transformPeerReputation(raw: PortalPeerReputation): PeerReputation {
  const factors = [
    { name: 'Bandwidth', value: (raw.bandwidth_score ?? 0) * SCORE_SCALE_FACTOR, weight: EIGENTRUST_WEIGHTS.bandwidth, color: 'green' as const },
    { name: 'Quality', value: (raw.quality_score ?? 0) * SCORE_SCALE_FACTOR, weight: EIGENTRUST_WEIGHTS.quality, color: 'blue' as const },
    { name: 'Security', value: (raw.security_score ?? 0) * SCORE_SCALE_FACTOR, weight: EIGENTRUST_WEIGHTS.security, color: 'yellow' as const },
    { name: 'Citizenship', value: (raw.citizenship_score ?? 0) * SCORE_SCALE_FACTOR, weight: EIGENTRUST_WEIGHTS.citizenship, color: 'green' as const },
  ];

  /* A tracker that answers the board reputation shape here sends no badges or scores; read them as empty and zero. */
  const badges: PeerBadge[] = (raw.badges ?? []).map(b => ({
    id: b.id,
    icon: BADGE_META[b.id]?.icon ?? 'info',
    label: badgeLabelFromId(b.id),
    status: (VALID_BADGE_STATUSES.has(b.status) ? b.status : 'locked') as BadgeStatus,
  }));

  return {
    clout: Math.round((raw.composite_score ?? 0) * CLOUT_SCALE_FACTOR),
    rank: (raw.tier ?? 'new').toLowerCase() as Peer['rank'],
    factors,
    badges,
    weeklyBonus: raw.weekly_bonus ?? 0,
    trend: raw.trend ?? null,
  };
}
