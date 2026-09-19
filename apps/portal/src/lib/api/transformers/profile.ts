/**
 * Purpose: Transform raw backend profile JSON to frontend display types
 */

import type { Profile, ProfileStats, EigenTrustFactor, ProfileBadge, Drop, ActivityItem, BadgeStatus } from '@/lib/types';
import type { RawProfileResponse } from '@/lib/types/backend';
import { readDisplayName } from './peer-ref';

export interface TransformedProfile {
  profile: Profile;
  stats: ProfileStats;
  eigenTrust: EigenTrustFactor[];
  badges: ProfileBadge[];
  drops: Drop[];
  activity: ActivityItem[];
}

const VALID_BADGE_STATUSES: ReadonlySet<string> = new Set(['earned', 'rare', 'locked']);

// Weekly reputation bonus by rank tier (mirrors the tracker's credit economy)
const WEEKLY_BONUS: Record<string, string | null> = {
  new: null,
  bronze: null,
  silver: '+20 credits / week',
  gold: '+50 credits / week',
  og: '+75 credits / week',
};

const BADGE_META: Record<string, { icon: string; desc: string }> = {
  early_adopter: { icon: 'zap', desc: 'Joined within the first week of launch' },
  first_drop: { icon: 'upload', desc: 'Shared your first file to the swarm' },
  swarm_joiner: { icon: 'users', desc: 'Connected to the peer network' },
  top_seeder: { icon: 'star', desc: 'Top 10% uploader by bandwidth' },
  trusted_node: { icon: 'shield', desc: 'Maintained 0.6+ trust score for 30 days' },
  og_status: { icon: 'award', desc: 'OG agent: composite score 0.8+' },
  global_relay: { icon: 'globe', desc: 'Relayed data to 50+ unique peers' },
  community_hero: { icon: 'heart', desc: '100+ upvotes on community posts' },
};

// ── Time Constants (technical-standards: no magic numbers) ──
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < SECONDS_PER_MINUTE) return 'just now';
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m ago`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours}h ago`;
  const days = Math.floor(hours / HOURS_PER_DAY);
  if (days < DAYS_PER_WEEK) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / SECONDS_PER_DAY);
  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function transformProfile(raw: RawProfileResponse): TransformedProfile {
  const stats = raw.stats ?? { clout: 0, top_percent: 99, drops: 0, library: 0, uptime_seconds: 0 };
  const eigen = raw.eigen_trust ?? {
    bandwidth_score: 0,
    quality_score: 0,
    security_score: 0,
    citizenship_score: 0,
    composite_score: 0,
    weights: { bandwidth: 0.4, quality: 0.3, security: 0.2, citizenship: 0.1 },
  };
  const weights = eigen.weights ?? { bandwidth: 0.4, quality: 0.3, security: 0.2, citizenship: 0.1 };

  const displayName = readDisplayName(raw);

  return {
    profile: {
      name: displayName ?? raw.masked_peer_id,
      ...(displayName ? { displayName } : {}),
      rank: raw.rank,
      agentId: raw.peer_id,
      isOnline: raw.is_online,
    },
    stats: {
      clout: stats.clout,
      cloutRank: `Top ${stats.top_percent}%`,
      drops: stats.drops,
      library: stats.library,
      uptime: formatUptime(stats.uptime_seconds),
      weeklyBonus: WEEKLY_BONUS[raw.rank] ?? null,
    },
    eigenTrust: [
      { name: 'Bandwidth', value: eigen.bandwidth_score * 10, weight: weights.bandwidth * 100, color: 'green' },
      { name: 'Quality', value: eigen.quality_score * 10, weight: weights.quality * 100, color: 'blue' },
      { name: 'Security', value: eigen.security_score * 10, weight: weights.security * 100, color: 'yellow' },
      { name: 'Citizenship', value: eigen.citizenship_score * 10, weight: weights.citizenship * 100, color: 'green' },
    ],
    badges: (raw.badges ?? []).map(b => ({
      icon: BADGE_META[b.id]?.icon ?? 'info',
      label: b.name,
      desc: BADGE_META[b.id]?.desc ?? '',
      status: (VALID_BADGE_STATUSES.has(b.status) ? b.status : 'locked') as BadgeStatus,
    })),
    drops: (raw.top_drops ?? []).map(d => ({
      name: d.filename,
      type: d.file_type,
      peers: d.download_count,
    })),
    activity: (raw.recent_activity ?? []).map((a, i) => ({
      id: `activity-${i}`,
      icon: 'upload',
      text: `Shared ${a.filename}`,
      timestamp: formatRelativeTime(a.announced_at),
      color: 'green' as const,
    })),
  };
}
