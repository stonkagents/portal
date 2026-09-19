/**
 * Purpose: Tests for PortalPeerReputation → PeerReputation transformer
 */
import { describe, it, expect } from 'vitest';
import { transformPeerReputation } from '../peers';
import type { PortalPeerReputation } from '@/lib/types/backend';

function makeRawReputation(overrides: Partial<PortalPeerReputation> = {}): PortalPeerReputation {
  return {
    composite_score: 0.72,
    bandwidth_score: 0.85,
    quality_score: 0.60,
    security_score: 0.90,
    citizenship_score: 0.45,
    tier: 'Gold',
    badges: [
      { id: 'early_adopter', status: 'earned' },
      { id: 'top_seeder', status: 'rare' },
    ],
    weekly_bonus: 50,
    trend: 3.2,
    ...overrides,
  };
}

describe('transformPeerReputation', () => {
  it('scales composite_score from 0-1 to 0-100 clout', () => {
    const result = transformPeerReputation(makeRawReputation({ composite_score: 0.72 }));
    expect(result.clout).toBe(72);
  });

  it('rounds clout to nearest integer', () => {
    const result = transformPeerReputation(makeRawReputation({ composite_score: 0.456 }));
    expect(result.clout).toBe(46);
  });

  it('scales each factor score from 0-1 to 0-10', () => {
    const result = transformPeerReputation(makeRawReputation({
      bandwidth_score: 0.85,
      quality_score: 0.60,
      security_score: 0.90,
      citizenship_score: 0.45,
    }));
    expect(result.factors).toHaveLength(4);
    expect(result.factors[0]).toEqual({ name: 'Bandwidth', value: 8.5, weight: 40, color: 'green' });
    expect(result.factors[1]).toEqual({ name: 'Quality', value: 6.0, weight: 30, color: 'blue' });
    expect(result.factors[2]).toEqual({ name: 'Security', value: 9.0, weight: 20, color: 'yellow' });
    expect(result.factors[3]).toEqual({ name: 'Citizenship', value: 4.5, weight: 10, color: 'green' });
  });

  it('maps tier to lowercase rank', () => {
    const result = transformPeerReputation(makeRawReputation({ tier: 'Gold' }));
    expect(result.rank).toBe('gold');
  });

  it('maps badges with icon and label from id', () => {
    const result = transformPeerReputation(makeRawReputation({
      badges: [
        { id: 'early_adopter', status: 'earned' },
        { id: 'top_seeder', status: 'rare' },
      ],
    }));
    expect(result.badges).toHaveLength(2);
    expect(result.badges[0]).toEqual({
      id: 'early_adopter',
      icon: 'zap',
      label: 'Early Adopter',
      status: 'earned',
    });
    expect(result.badges[1]).toEqual({
      id: 'top_seeder',
      icon: 'star',
      label: 'Top Seeder',
      status: 'rare',
    });
  });

  it('falls back to info icon and title-cased label for unknown badge ids', () => {
    const result = transformPeerReputation(makeRawReputation({
      badges: [{ id: 'mystery_badge', status: 'locked' }],
    }));
    expect(result.badges[0]).toEqual({
      id: 'mystery_badge',
      icon: 'info',
      label: 'Mystery Badge',
      status: 'locked',
    });
  });

  it('handles empty badges array', () => {
    const result = transformPeerReputation(makeRawReputation({ badges: [] }));
    expect(result.badges).toEqual([]);
  });

  it('passes through weekly_bonus', () => {
    const result = transformPeerReputation(makeRawReputation({ weekly_bonus: 75 }));
    expect(result.weeklyBonus).toBe(75);
  });

  it('passes through trend when present', () => {
    const result = transformPeerReputation(makeRawReputation({ trend: 3.2 }));
    expect(result.trend).toBe(3.2);
  });

  it('passes through null trend', () => {
    const result = transformPeerReputation(makeRawReputation({ trend: null }));
    expect(result.trend).toBeNull();
  });

  it('handles zero scores', () => {
    const result = transformPeerReputation(makeRawReputation({
      composite_score: 0,
      bandwidth_score: 0,
      quality_score: 0,
      security_score: 0,
      citizenship_score: 0,
    }));
    expect(result.clout).toBe(0);
    expect(result.factors.every(f => f.value === 0)).toBe(true);
  });

  it('handles max scores', () => {
    const result = transformPeerReputation(makeRawReputation({
      composite_score: 1.0,
      bandwidth_score: 1.0,
      quality_score: 1.0,
      security_score: 1.0,
      citizenship_score: 1.0,
      tier: 'OG',
    }));
    expect(result.clout).toBe(100);
    expect(result.factors.every(f => f.value === 10)).toBe(true);
    expect(result.rank).toBe('og');
  });
});
