/**
 * Purpose: Tests for profile transformer — backend snake_case → frontend display types
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transformProfile } from '../profile';
import type { RawProfileResponse } from '@/lib/types/backend';

// Frozen time for deterministic tests (testing-backend: no dependency on current time)
const FIXED_NOW = new Date('2026-02-10T12:00:00.000Z');

function makeRawProfile(overrides: Partial<RawProfileResponse> = {}): RawProfileResponse {
  return {
    peer_id: '12D3KooWRkGLz4YvbR3',
    masked_peer_id: 'claw-alpha-7f3a',
    rank: 'silver',
    is_online: true,
    stats: { clout: 45, top_percent: 35, drops: 3, library: 3, uptime_seconds: 450180 },
    eigen_trust: {
      bandwidth_score: 0.4,
      quality_score: 0.55,
      security_score: 1.0,
      citizenship_score: 0.8,
      composite_score: 0.45,
      weights: { bandwidth: 0.4, quality: 0.3, security: 0.2, citizenship: 0.1 },
    },
    badges: [
      { id: 'early_adopter', name: 'Early Adopter', status: 'earned' },
      { id: 'top_seeder', name: 'Top Seeder', status: 'rare' },
      { id: 'og_status', name: 'OG Status', status: 'locked' },
    ],
    top_drops: [{ filename: 'llama3.at-vec', file_type: '.at-vec', download_count: 42, size_bytes: 1048576 }],
    recent_activity: [{ filename: 'data.at-raw', announced_at: FIXED_NOW.toISOString() }],
    ...overrides,
  };
}

describe('transformProfile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('transforms happy path correctly', () => {
    const result = transformProfile(makeRawProfile());

    expect(result.profile.name).toBe('claw-alpha-7f3a');
    expect(result.profile.rank).toBe('silver');
    expect(result.profile.agentId).toBe('12D3KooWRkGLz4YvbR3');
    expect(result.profile.isOnline).toBe(true);
    expect(result.stats.clout).toBe(45);
    expect(result.stats.cloutRank).toBe('Top 35%');
  });

  it('decomposes eigen_trust into 4-factor array', () => {
    const result = transformProfile(makeRawProfile());

    expect(result.eigenTrust).toHaveLength(4);
    expect(result.eigenTrust[0]).toEqual({ name: 'Bandwidth', value: 4.0, weight: 40, color: 'green' });
    expect(result.eigenTrust[1]).toEqual({ name: 'Quality', value: 5.5, weight: 30, color: 'blue' });
    expect(result.eigenTrust[2]).toEqual({ name: 'Security', value: 10.0, weight: 20, color: 'yellow' });
    expect(result.eigenTrust[3]).toEqual({ name: 'Citizenship', value: 8.0, weight: 10, color: 'green' });
  });

  it('enriches badges with icon and description from metadata map', () => {
    const result = transformProfile(makeRawProfile());

    expect(result.badges[0]).toEqual({
      icon: 'zap',
      label: 'Early Adopter',
      desc: 'Joined within the first week of launch',
      status: 'earned',
    });
    expect(result.badges[1]).toEqual({ icon: 'star', label: 'Top Seeder', desc: 'Top 10% uploader by bandwidth', status: 'rare' });
    expect(result.badges[2]).toEqual({ icon: 'award', label: 'OG Status', desc: 'OG agent: composite score 0.8+', status: 'locked' });
  });

  it('falls back to info icon and empty description for unknown badge IDs', () => {
    const result = transformProfile(
      makeRawProfile({
        badges: [{ id: 'unknown_badge_xyz', name: 'Mystery Badge', status: 'locked' }],
      }),
    );

    expect(result.badges[0]).toEqual({ icon: 'info', label: 'Mystery Badge', desc: '', status: 'locked' });
  });

  it('formats relative time for recent activity', () => {
    const twoHoursAgo = new Date('2026-02-10T10:00:00.000Z').toISOString();
    const result = transformProfile(makeRawProfile({ recent_activity: [{ filename: 'test.vec', announced_at: twoHoursAgo }] }));

    expect(result.activity[0].timestamp).toBe('2h ago');
    expect(result.activity[0].text).toBe('Shared test.vec');
  });

  it('formats uptime from seconds', () => {
    const result = transformProfile(
      makeRawProfile({ stats: { clout: 0, top_percent: 99, drops: 0, library: 0, uptime_seconds: 450180 } }),
    );
    expect(result.stats.uptime).toBe('5d 5h');
  });

  it('formats top_percent as "Top N%" string', () => {
    const result = transformProfile(makeRawProfile({ stats: { clout: 0, top_percent: 12, drops: 0, library: 0, uptime_seconds: 0 } }));
    expect(result.stats.cloutRank).toBe('Top 12%');
  });

  // Weekly bonus derived from rank
  it('derives weeklyBonus from rank for silver tier', () => {
    const raw = makeRawProfile();
    // Default fixture has composite 0.45 → rank silver
    const result = transformProfile(raw);
    expect(result.stats.weeklyBonus).toBe('+20 credits / week');
  });

  it('derives weeklyBonus from rank for OG tier', () => {
    const raw = makeRawProfile({ rank: 'og' });
    const result = transformProfile(raw);
    expect(result.stats.weeklyBonus).toBe('+75 credits / week');
  });

  it('derives weeklyBonus as null for new rank (no bonus)', () => {
    const raw = makeRawProfile({ rank: 'new' });
    const result = transformProfile(raw);
    expect(result.stats.weeklyBonus).toBeNull();
  });

  it('derives weeklyBonus as null for bronze rank (no bonus)', () => {
    const raw = makeRawProfile({ rank: 'bronze' });
    const result = transformProfile(raw);
    expect(result.stats.weeklyBonus).toBeNull();
  });

  it('derives weeklyBonus for gold tier', () => {
    const raw = makeRawProfile({ rank: 'gold' });
    const result = transformProfile(raw);
    expect(result.stats.weeklyBonus).toBe('+50 credits / week');
  });

  it('handles empty arrays', () => {
    const result = transformProfile(makeRawProfile({ badges: [], top_drops: [], recent_activity: [] }));
    expect(result.badges).toEqual([]);
    expect(result.drops).toEqual([]);
    expect(result.activity).toEqual([]);
  });

  it('normalizes unknown badge status to locked', () => {
    const result = transformProfile(
      makeRawProfile({
        badges: [{ id: 'early_adopter', name: 'Early Adopter', status: 'some_future_status' as 'earned' }],
      }),
    );
    expect(result.badges[0].status).toBe('locked');
  });

  it('defaults stats when backend returns null stats (soft degradation)', () => {
    const raw = makeRawProfile();
    // Simulate runtime null — backend may return null under soft degradation
    (raw as unknown as Record<string, unknown>).stats = null;
    const result = transformProfile(raw);

    expect(result.stats.clout).toBe(0);
    expect(result.stats.cloutRank).toBe('Top 99%');
    expect(result.stats.drops).toBe(0);
    expect(result.stats.uptime).toBe('0m');
  });

  it('defaults eigen_trust when backend returns null (soft degradation)', () => {
    const raw = makeRawProfile();
    (raw as unknown as Record<string, unknown>).eigen_trust = null;
    const result = transformProfile(raw);

    expect(result.eigenTrust).toHaveLength(4);
    expect(result.eigenTrust[0]).toEqual({ name: 'Bandwidth', value: 0, weight: 40, color: 'green' });
    expect(result.eigenTrust[1]).toEqual({ name: 'Quality', value: 0, weight: 30, color: 'blue' });
  });

  it('defaults weights when eigen_trust exists but weights is null', () => {
    const raw = makeRawProfile();
    (raw.eigen_trust as Record<string, unknown>).weights = null;
    const result = transformProfile(raw);

    // Should use default weights (40/30/20/10)
    expect(result.eigenTrust[0].weight).toBe(40);
    expect(result.eigenTrust[1].weight).toBe(30);
    expect(result.eigenTrust[2].weight).toBe(20);
    expect(result.eigenTrust[3].weight).toBe(10);
  });
});

describe('display name', () => {
  it('names the profile by display name when the tracker sends one', () => {
    const result = transformProfile(makeRawProfile({ display_name: 'Alice Agent' }));
    expect(result.profile.name).toBe('Alice Agent');
    expect(result.profile.displayName).toBe('Alice Agent');
  });

  it('keeps the masked id as the name when the display name is blank', () => {
    const result = transformProfile(makeRawProfile({ display_name: '   ' }));
    expect(result.profile.name).toBe('claw-alpha-7f3a');
    expect(result.profile).not.toHaveProperty('displayName');
  });
});
