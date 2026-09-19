import { describe, expect, it } from 'vitest';
import type { LaunchRecord } from '@/lib/api/launches';
import type { PeerTokenListing } from '@/lib/types/backend';
import { formatQuoteAmount, formatUsd, fromLaunch, fromListing, mergeGallery, toListing } from './gallery-token';

const launch: LaunchRecord = {
  mint: 'MintAAA',
  pool_id: 'PoolAAA',
  creator_wallet: 'WalletAAA',
  quote_mint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  name: 'Signal Hound',
  symbol: 'HOUND',
  image_url: '',
  launch_signature: 'sig',
  fee_lamports: 1,
  transfer_fee_bps: 100,
  status: 'confirmed',
  created_at: '2026-09-10T12:00:00Z',
  quote: { mint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx', symbol: 'STONK', name: 'STONK', category: 'custom', decimals: 9 },
  metrics: {
    marketCapUsd: null,
    curveProgressPct: 12,
    holders: null,
    priceUsd: null,
    quoteRaised: 4000,
    quoteTarget: 32230,
    graduated: false,
  },
};

const listing: PeerTokenListing = {
  peer_id: 'peer-1',
  token_contract_address: 'MintAAA',
  token_ticker: 'HOUND',
  token_name: 'Signal Hound',
  token_image_url: 'https://example.com/hound.png',
  launched_at: '2026-09-10T12:00:00Z',
  metrics: {
    marketCapUsd: 50000,
    solRaised: 12,
    bondingCurvePercent: 40,
    complete: false,
    createdAt: null,
    imageUrl: null,
    holders: 42,
    priceUsd: 0.00005,
  },
};

const legacyOnly: PeerTokenListing = {
  ...listing,
  peer_id: 'peer-2',
  token_contract_address: 'MintOLD',
  token_ticker: 'OLD',
  token_name: 'Old Timer',
};

describe('fromLaunch', () => {
  it('labels $STONK by mint and reads the tracker metrics', () => {
    const token = fromLaunch(launch);
    expect(token).toMatchObject({
      mint: 'MintAAA',
      poolId: 'PoolAAA',
      creator: 'WalletAAA',
      quoteSymbol: 'STONK',
      quoteCategory: 'stonk',
      quoteCategoryLabel: '$STONK',
      curveProgressPct: 12,
      quoteRaised: 4000,
      quoteTarget: 32230,
      transferFeeBps: 100,
      source: 'launch',
      imageUrl: null,
      peerId: null,
    });
  });

  it('labels SOL by the tracker word and leaves any other quote unlabelled', () => {
    const sol = fromLaunch({
      ...launch,
      quote_mint: 'So11111111111111111111111111111111111111112',
      quote: { ...launch.quote!, mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', category: 'native' },
    });
    expect(sol.quoteCategory).toBe('solana');
    expect(sol.quoteCategoryLabel).toBe('Solana');

    const other = fromLaunch({
      ...launch,
      quote_mint: 'X',
      quote: { ...launch.quote!, mint: 'X', symbol: 'NVDAx', category: 'xstock' },
    });
    expect(other.quoteSymbol).toBe('NVDAx');
    expect(other.quoteCategory).toBeNull();
    expect(other.quoteCategoryLabel).toBeNull();
  });
});

describe('fromLaunch image thumb', () => {
  it('reads imageThumbUrl from either spelling and is null for launches recorded before thumbnails', () => {
    expect(fromLaunch(launch).imageThumbUrl).toBeNull();
    expect(fromLaunch({ ...launch, imageThumbUrl: null }).imageThumbUrl).toBeNull();
    expect(fromLaunch({ ...launch, imageThumbUrl: 'https://gateway.example/ipfs/thumb' }).imageThumbUrl).toBe(
      'https://gateway.example/ipfs/thumb',
    );
    expect(fromLaunch({ ...launch, image_thumb_url: 'https://gateway.example/ipfs/thumb2' }).imageThumbUrl).toBe(
      'https://gateway.example/ipfs/thumb2',
    );
    expect(fromListing(listing).imageThumbUrl).toBeNull();
  });
});

describe('fromListing', () => {
  it('maps the legacy row, with SOL raised as the raise', () => {
    const token = fromListing(legacyOnly);
    expect(token).toMatchObject({
      mint: 'MintOLD',
      symbol: 'OLD',
      creator: 'peer-2',
      peerId: 'peer-2',
      quoteRaised: 12,
      curveProgressPct: 40,
      source: 'legacy',
    });
    expect(token.listing).toBe(legacyOnly);
  });
});

describe('mergeGallery', () => {
  it('puts launches first and fills their gaps from the listing of the same mint', () => {
    const merged = mergeGallery([launch], [listing, legacyOnly]);
    expect(merged.map(t => t.mint)).toEqual(['MintAAA', 'MintOLD']);
    const hound = merged[0];
    expect(hound.source).toBe('launch');
    expect(hound.marketCapUsd).toBe(50000);
    expect(hound.holders).toBe(42);
    expect(hound.imageUrl).toBe('https://example.com/hound.png');
    // Legacy listings never carry a thumb; a launch without one stays without one.
    expect(hound.imageThumbUrl).toBeNull();
    expect(hound.peerId).toBe('peer-1');
    // The launch's own numbers win where it has them.
    expect(hound.curveProgressPct).toBe(12);
    expect(hound.listing).toBe(listing);
  });

  it('is a plain list when only one source answered', () => {
    expect(mergeGallery([], [legacyOnly])).toHaveLength(1);
    expect(mergeGallery([launch], [])).toHaveLength(1);
    expect(mergeGallery([], [])).toEqual([]);
  });
});

describe('toListing', () => {
  it('returns the stored row when there is one, else builds one from the launch', () => {
    const merged = mergeGallery([launch], [listing]);
    expect(toListing(merged[0])).toBe(listing);
    const bare = toListing(fromLaunch(launch));
    expect(bare).toMatchObject({ peer_id: '', token_contract_address: 'MintAAA', token_ticker: 'HOUND', metrics: null });
  });
});

describe('formatters', () => {
  it('format USD and quote amounts, dashing the unknown', () => {
    expect(formatUsd(null)).toBe('-');
    expect(formatUsd(1_250_000)).toBe('$1.25M');
    expect(formatUsd(50_000)).toBe('$50.0K');
    expect(formatUsd(12.345)).toBe('$12.35');
    expect(formatUsd(0.00005)).toBe('$0.0000500');
    expect(formatQuoteAmount(null, 'STONK')).toBe('-');
    expect(formatQuoteAmount(32230.14, 'STONK')).toBe('32.2K STONK');
    expect(formatQuoteAmount(12, null)).toBe('12.00');
  });
});
