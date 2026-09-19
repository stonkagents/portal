/**
 * Purpose: Tests for token transformer — PortalTokenListItem → frontend Token type
 */
import { describe, it, expect } from 'vitest';
import { transformTokenListItem } from '../tokens';
import type { PortalTokenListItem } from '@/lib/types/backend';

function makeTokenListItem(overrides: Partial<PortalTokenListItem> = {}): PortalTokenListItem {
  return {
    peer_id: 'peer-abc-123',
    token_contract_address: 'So11111111111111111111111111111111111111112',
    token_ticker: 'AGENT',
    token_name: 'AgentCoin',
    token_image_url: 'https://example.com/agent.png',
    launched_at: '2026-02-07T08:30:00Z',
    metrics: {
      marketCapUsd: 50000,
      solRaised: 42.5,
      bondingCurvePercent: 67,
      complete: false,
      createdAt: '2026-02-07T08:30:00Z',
      imageUrl: 'https://example.com/agent.png',
      holders: 847,
      priceUsd: 0.05,
    },
    ...overrides,
  };
}

describe('transformTokenListItem', () => {
  it('maps core identity fields', () => {
    const raw = makeTokenListItem();
    const result = transformTokenListItem(raw);

    expect(result.name).toBe('AgentCoin');
    expect(result.symbol).toBe('$AGENT');
    expect(result.image).toBe('https://example.com/agent.png');
    expect(result.creator).toBe('peer-abc-123');
    expect(result.createdAt).toBe('2026-02-07T08:30:00Z');
  });

  it('generates deterministic id from contract address', () => {
    const result = transformTokenListItem(makeTokenListItem());
    expect(result.id).toBe('So11111111111111111111111111111111111111112');
  });

  it('derives the venue link from the contract address', () => {
    const result = transformTokenListItem(
      makeTokenListItem({
        token_contract_address: 'So11111111111111111111111111111111111111112',
      }),
    );
    expect(result.tokenUrl).toContain('mint=So11111111111111111111111111111111111111112');
    expect(result.tokenUrl).toMatch(/^https:\/\/.+\/launchpad\/token\/\?mint=So11111111111111111111111111111111111111112$/);
  });

  it('prepends $ to ticker if missing', () => {
    expect(transformTokenListItem(makeTokenListItem({ token_ticker: 'AGENT' })).symbol).toBe('$AGENT');
  });

  it('does not double-prepend $ to ticker', () => {
    expect(transformTokenListItem(makeTokenListItem({ token_ticker: '$AGENT' })).symbol).toBe('$AGENT');
  });

  it('maps metrics to bonding status fields', () => {
    const result = transformTokenListItem(makeTokenListItem());

    expect(result.bondingCurveProgress).toBe(67);
    expect(result.solRaised).toBe(42.5);
    expect(result.holders).toBe(847);
  });

  it('derives status "bonding" when metrics.complete is false', () => {
    const result = transformTokenListItem(
      makeTokenListItem({
        metrics: { ...makeTokenListItem().metrics!, complete: false },
      }),
    );
    expect(result.status).toBe('bonding');
  });

  it('derives status "migrated" when metrics.complete is true', () => {
    const result = transformTokenListItem(
      makeTokenListItem({
        metrics: { ...makeTokenListItem().metrics!, complete: true },
      }),
    );
    expect(result.status).toBe('migrated');
  });

  it('defaults status to "bonding" when metrics.complete is null', () => {
    const result = transformTokenListItem(
      makeTokenListItem({
        metrics: { ...makeTokenListItem().metrics!, complete: null },
      }),
    );
    expect(result.status).toBe('bonding');
  });

  it('handles null metrics gracefully', () => {
    const result = transformTokenListItem(makeTokenListItem({ metrics: null }));

    expect(result.bondingCurveProgress).toBe(0);
    expect(result.solRaised).toBe(0);
    expect(result.holders).toBe(0);
    expect(result.status).toBe('bonding');
  });

  it('handles missing token_image_url', () => {
    const result = transformTokenListItem(
      makeTokenListItem({
        token_image_url: undefined,
      }),
    );
    expect(result.image).toBeNull();
  });

  it('leaves description, tags, reactions, color as undefined', () => {
    const result = transformTokenListItem(makeTokenListItem());

    expect(result.description).toBeUndefined();
    expect(result.tags).toBeUndefined();
    expect(result.reactions).toBeUndefined();
    expect(result.color).toBeUndefined();
  });
});
