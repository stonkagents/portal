/**
 * Purpose: Tests for gallery transformer — CID pass-through, download_count mapping, speed as number
 */
import { describe, it, expect } from 'vitest';
import { transformGalleryResponse, transformPacks, formatBytes } from '../gallery';
import type { PortalGalleryResponse, PortalPack } from '@/lib/types/backend';

const makeRaw = (overrides?: Partial<PortalGalleryResponse>): PortalGalleryResponse => ({
  items: [
    { cid: 'bafytest123', name: 'agent-memory.vec', type: '.vec', size: 2048, peers: 7, download_count: 42, author_peer_id: '12D3KooWAbcD', peer_rep: 72 },
    { cid: 'bafyother456', name: 'pipeline.traj', type: '.traj', size: 512, peers: 3, download_count: 0, author_peer_id: '', peer_rep: 0 },
  ],
  total: 150,
  total_size_bytes: 2560,
  ...overrides,
});

describe('transformGalleryResponse', () => {
  it('preserves cid from backend items', () => {
    const result = transformGalleryResponse(makeRaw());
    expect(result.results[0].cid).toBe('bafytest123');
    expect(result.results[1].cid).toBe('bafyother456');
  });

  it('maps download_count to downloads', () => {
    const result = transformGalleryResponse(makeRaw());
    expect(result.results[0].downloads).toBe(42);
    expect(result.results[1].downloads).toBe(0);
  });

  it('returns totalShared as formatted bytes from total_size_bytes', () => {
    const result = transformGalleryResponse(makeRaw());
    expect(result.stats.totalShared).toBe('2.5 KB');
  });

  it('returns uploadSpeed and downloadSpeed as numbers', () => {
    const result = transformGalleryResponse(makeRaw());
    expect(typeof result.stats.uploadSpeed).toBe('number');
    expect(typeof result.stats.downloadSpeed).toBe('number');
  });

  it('formats size as human-readable string', () => {
    const result = transformGalleryResponse(makeRaw());
    expect(result.results[0].size).toBe('2.0 KB');
  });

  it('maps peers to seeds', () => {
    const result = transformGalleryResponse(makeRaw());
    expect(result.results[0].seeds).toBe(7);
  });

  it('handles empty items array', () => {
    const result = transformGalleryResponse(makeRaw({ items: [], total: 0, total_size_bytes: 0 }));
    expect(result.results).toEqual([]);
    expect(result.stats.totalShared).toBe('0 B');
  });

  it('maps author_peer_id to author', () => {
    const result = transformGalleryResponse(makeRaw());
    expect(result.results[0].author).toBe('12D3KooWAbcD');
    expect(result.results[1].author).toBe('');
  });

  it('maps peer_rep to rep', () => {
    const result = transformGalleryResponse(makeRaw());
    expect(result.results[0].rep).toBe(72);
    expect(result.results[1].rep).toBe(0);
  });
});

const makePacksRaw = (): PortalPack[] => [
  {
    id: 'starter-pack',
    name: 'Starter Pack',
    description: 'Essential skills every Agent needs.',
    icon: 'zap',
    item_count: 7,
    items: [
      { filename: 'web-search.claw-tool', type: 'claw-tool', title: 'Web Search', description: 'Search the web' },
      { filename: 'code-review.claw-skill', type: 'claw-skill', title: 'Code Review', description: 'Review code' },
    ],
  },
  {
    id: 'defi-research',
    name: 'DeFi Research Pack',
    description: 'Market context for DeFi agents.',
    icon: 'bar-chart',
    item_count: 6,
    items: [
      { filename: 'market-analysis.claw-prompt', type: 'claw-prompt', title: 'Market Analysis', description: 'Analyze markets' },
    ],
  },
];

describe('transformPacks', () => {
  it('maps name to title and item_count to assets', () => {
    const result = transformPacks(makePacksRaw());
    expect(result[0].title).toBe('Starter Pack');
    expect(result[0].assets).toBe(7);
    expect(result[1].title).toBe('DeFi Research Pack');
    expect(result[1].assets).toBe(6);
  });

  it('assigns colors cycling through green, blue, purple, red', () => {
    const result = transformPacks(makePacksRaw());
    expect(result[0].color).toBe('green');
    expect(result[1].color).toBe('blue');
  });

  it('preserves id and icon', () => {
    const result = transformPacks(makePacksRaw());
    expect(result[0].id).toBe('starter-pack');
    expect(result[0].icon).toBe('zap');
  });

  it('carries the catalog items and invents no install or size figures', () => {
    const result = transformPacks(makePacksRaw());
    expect(result[0].items).toEqual([
      { filename: 'web-search.claw-tool', type: 'claw-tool', title: 'Web Search', description: 'Search the web' },
      { filename: 'code-review.claw-skill', type: 'claw-skill', title: 'Code Review', description: 'Review code' },
    ]);
    expect(result[0]).not.toHaveProperty('installs');
    expect(result[0]).not.toHaveProperty('size');
  });

  it('handles empty packs array', () => {
    const result = transformPacks([]);
    expect(result).toEqual([]);
  });
});

describe('formatBytes safety', () => {
  it('returns "0 B" for undefined input', () => {
    expect(formatBytes(undefined as unknown as number)).toBe('0 B');
  });

  it('returns "0 B" for null input', () => {
    expect(formatBytes(null as unknown as number)).toBe('0 B');
  });

  it('returns "0 B" for NaN input', () => {
    expect(formatBytes(NaN)).toBe('0 B');
  });

  it('returns "0 B" for negative input', () => {
    expect(formatBytes(-1)).toBe('0 B');
  });

  it('formats valid bytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512.0 B');
  });
});
