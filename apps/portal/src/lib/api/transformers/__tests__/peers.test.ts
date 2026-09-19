/**
 * Purpose: Tests for peers transformer — enriched PortalPeer → frontend Peer type
 */
import { describe, it, expect } from 'vitest';
import { transformPeer } from '../peers';
import type { PortalPeer } from '@/lib/types/backend';

function makePortalPeer(overrides: Partial<PortalPeer> = {}): PortalPeer {
  return {
    id: 'abc-123',
    name: 'claw-alpha-7f3a',
    peerId: '12D3KooWRkGLz4YvbR3ExamplePeerID',
    status: 'online',
    reputation: 65,
    tier: 'Gold',
    sharedFiles: 12,
    location: 'US',
    country: 'US',
    city: 'San Francisco',
    lat: 37.7749,
    lng: -122.4194,
    totalUploadBytes: 1073741824,
    totalDownloadBytes: 536870912,
    lastSeen: '2026-02-16T12:00:00Z',
    ...overrides,
  };
}

describe('transformPeer', () => {
  it('maps all enriched fields correctly', () => {
    const raw = makePortalPeer();
    const result = transformPeer(raw);

    expect(result.id).toBe('abc-123');
    expect(result.agentId).toBe('12D3KooWRkGLz4YvbR3ExamplePeerID');
    expect(result.displayName).toBe('claw-alpha-7f3a');
    expect(result.status).toBe('online');
    expect(result.reputation).toBe(65);
    expect(result.rank).toBe('gold');
    expect(result.assetsShared).toBe(12);
    expect(result.country).toBe('US');
    expect(result.lastSeen).toBe('2026-02-16T12:00:00Z');
  });

  it('passes status through directly (no connected→online mapping)', () => {
    expect(transformPeer(makePortalPeer({ status: 'seeding' })).status).toBe('seeding');
    expect(transformPeer(makePortalPeer({ status: 'leeching' })).status).toBe('leeching');
    expect(transformPeer(makePortalPeer({ status: 'offline' })).status).toBe('offline');
    expect(transformPeer(makePortalPeer({ status: 'online' })).status).toBe('online');
  });

  it('lowercases tier to rank', () => {
    expect(transformPeer(makePortalPeer({ tier: 'OG' })).rank).toBe('og');
    expect(transformPeer(makePortalPeer({ tier: 'Silver' })).rank).toBe('silver');
    expect(transformPeer(makePortalPeer({ tier: 'New' })).rank).toBe('new');
  });

  it('maps geo fields (lat, lng, city)', () => {
    const result = transformPeer(makePortalPeer());
    expect(result.lat).toBe(37.7749);
    expect(result.lng).toBe(-122.4194);
    expect(result.city).toBe('San Francisco');
  });

  it('maps bandwidth from totalUploadBytes and totalDownloadBytes', () => {
    const result = transformPeer(makePortalPeer({
      totalUploadBytes: 2147483648,   // 2 GiB
      totalDownloadBytes: 1073741824, // 1 GiB
    }));
    expect(result.bandwidthUp).toBe(2147483648);
    expect(result.bandwidthDown).toBe(1073741824);
  });

  it('handles zero bandwidth', () => {
    const result = transformPeer(makePortalPeer({
      totalUploadBytes: 0,
      totalDownloadBytes: 0,
    }));
    expect(result.bandwidthUp).toBe(0);
    expect(result.bandwidthDown).toBe(0);
  });

  it('handles missing optional geo fields', () => {
    const raw = makePortalPeer({ city: '', lat: 0, lng: 0 });
    const result = transformPeer(raw);
    expect(result.city).toBe('');
    expect(result.lat).toBe(0);
    expect(result.lng).toBe(0);
  });
});
