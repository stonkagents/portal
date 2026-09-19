/**
 * useAgentToken: the pinned $AGENT card reads the stonk.fun pool on chain
 * (`useExternalPoolState`), laying a tracker record over it when one exists;
 * every stat is null until its source answers, and nothing is sampled. With
 * the stonkfun source the stats are stonkfun's API alone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LaunchRecord } from '@/lib/api/launches';
import { pool } from '@/app/tokens/_components/__tests__/fixtures';

const mockUseLaunchDetail = vi.fn();
vi.mock('@/lib/api/hooks/use-launch-detail', () => ({ useLaunchDetail: (mint: string | null) => mockUseLaunchDetail(mint) }));
const mockUseExternalPoolState = vi.fn();
vi.mock('@/lib/launchlab/external-pool', () => ({ useExternalPoolState: (p: unknown) => mockUseExternalPoolState(p) }));
const mockUseQuoteUsd = vi.fn();
vi.mock('@/app/tokens/_lib/use-token-detail-data', () => ({ useQuoteUsd: (m: unknown) => mockUseQuoteUsd(m) }));
const mockUseStonkfunToken = vi.fn();
vi.mock('@/lib/api/hooks/use-stonkfun-token', () => ({ useStonkfunToken: (m: unknown) => mockUseStonkfunToken(m) }));

import { agentStatsFromLaunch, agentStatsFromPool, agentStatsFromStonkfun, mergeAgentStats, useAgentToken } from './use-agent-token';
import { parseStonkfunToken } from '@/lib/api/stonkfun';
import { AGENT_MINT, AGENT_QUOTE_MINT } from '@/lib/agent-token';

const WSOL = 'So11111111111111111111111111111111111111112';
const MINT = 'AgentMint111111111111111111111111111111111111';

const record: LaunchRecord = {
  mint: MINT,
  creator_wallet: 'Creator',
  quote_mint: WSOL,
  name: 'StonkAgents',
  symbol: 'AGENT',
  imageUrl: 'https://gateway.pinata.cloud/ipfs/QmAgent',
  launch_signature: 'sig',
  fee_lamports: 4_940_945,
  transfer_fee_bps: 100,
  status: 'confirmed',
  created_at: '2026-09-13T20:00:00Z',
  quote: { mint: WSOL, symbol: 'SOL', name: 'Wrapped SOL (devnet)', category: 'solana', decimals: 9 },
  metrics: {
    marketCapUsd: 3_120.5,
    curveProgressPct: 2.1,
    holders: null,
    priceUsd: 3.12e-6,
    quoteRaised: 1.8,
    quoteTarget: 85,
    graduated: false,
  },
};

/** The $AGENT pool as stonk.fun created it: SOL quote, their platform config. */
const stonkfunPool = {
  ...pool,
  mint: AGENT_MINT,
  quoteMint: WSOL,
  poolId: 'AgentPool111111111111111111111111111111111',
  platformId: 'StonkFunPlatform111111111111111111111111111',
  platformName: 'stonk.fun',
  creator: 'StonkFunCreator',
  priceQuote: 0.00000327,
  supplyBase: 1_000_000_000,
  progressPct: 3.5,
};

const idle = { data: undefined, isLoading: false, isFetched: false, isError: false, error: null };
const noRecord = { data: null, isLoading: false, isFetched: true, isError: false };

describe('agentStatsFromLaunch', () => {
  it('maps the tracker record onto the card stats', () => {
    expect(agentStatsFromLaunch(record)).toEqual({
      name: null,
      symbol: null,
      image: 'https://gateway.pinata.cloud/ipfs/QmAgent',
      quoteSymbol: 'SOL',
      mcapUsd: 3_120.5,
      priceUsd: 3.12e-6,
      priceQuote: null,
      mcapQuote: null,
      supply: null,
      holders: null,
      change24h: null,
      volume24h: null,
      liquidityUsd: null,
      curveProgressPct: 2.1,
      graduated: false,
      quoteMint: WSOL,
      poolId: null,
      creatorWallet: 'Creator',
      platformId: null,
      platformName: null,
      transferFeeBps: 100,
      launchedAt: '2026-09-13T20:00:00Z',
    });
  });

  it('reads the pool and creator from either spelling of the record', () => {
    expect(agentStatsFromLaunch({ ...record, pool_id: 'PoolSnake', creatorWallet: 'CreatorCamel' })).toMatchObject({
      poolId: 'PoolSnake',
      creatorWallet: 'CreatorCamel',
    });
    expect(agentStatsFromLaunch({ ...record, poolId: 'PoolCamel', pool_id: 'PoolSnake' })).toMatchObject({ poolId: 'PoolCamel' });
  });

  it("reads the tracker's 24h block and live quote price when it serves them", () => {
    const withExtras = {
      ...record,
      metrics: { ...record.metrics!, priceChange24hPct: -6.4, volume24hUsd: 812.2, priceQuote: 0.000003, holders: 17 },
    };
    expect(agentStatsFromLaunch(withExtras as LaunchRecord)).toMatchObject({
      change24h: -6.4,
      volume24h: 812.2,
      priceQuote: 0.000003,
      holders: 17,
    });
  });

  it('has no image and no quote symbol when the record carries none', () => {
    const bare: LaunchRecord = { ...record, imageUrl: undefined, image_url: '', quote: null, metrics: null };
    expect(agentStatsFromLaunch(bare)).toMatchObject({ image: null, quoteSymbol: null, mcapUsd: null, holders: null });
  });
});

describe('agentStatsFromPool', () => {
  it('prices from the pool, in the quote always and in USD only with a quote price', () => {
    const inQuote = agentStatsFromPool(stonkfunPool, null);
    expect(inQuote).toMatchObject({
      quoteSymbol: 'SOL',
      priceQuote: 0.00000327,
      mcapQuote: 3_270,
      mcapUsd: null,
      priceUsd: null,
      supply: 1_000_000_000,
      curveProgressPct: 3.5,
      graduated: false,
      quoteMint: WSOL,
      poolId: stonkfunPool.poolId,
      creatorWallet: 'StonkFunCreator',
      platformId: stonkfunPool.platformId,
      platformName: 'stonk.fun',
      holders: null,
      change24h: null,
      volume24h: null,
      transferFeeBps: null,
      launchedAt: null,
      image: null,
    });
    const inUsd = agentStatsFromPool(stonkfunPool, 200);
    expect(inUsd.mcapUsd).toBeCloseTo(654_000);
    expect(inUsd.priceUsd).toBeCloseTo(0.000654);
  });
});

describe('mergeAgentStats', () => {
  it('lets the chain win for every live figure and keeps what only the record knows', () => {
    const fromRecord = agentStatsFromLaunch({ ...record, metrics: { ...record.metrics!, curveProgressPct: 1 } });
    const fromPool = agentStatsFromPool(stonkfunPool, null);
    const merged = mergeAgentStats(fromRecord, fromPool)!;
    expect(merged.image).toBe(fromRecord.image);
    expect(merged.mcapUsd).toBe(3_120.5);
    expect(merged.curveProgressPct).toBe(3.5);
    expect(merged.poolId).toBe(stonkfunPool.poolId);
    expect(merged.platformName).toBe('stonk.fun');
    expect(merged.transferFeeBps).toBe(100);
    expect(mergeAgentStats(null, fromPool)).toBe(fromPool);
    expect(mergeAgentStats(fromRecord, null)).toBe(fromRecord);
    expect(mergeAgentStats(null, null)).toBeNull();
  });
});

describe('useAgentToken', () => {
  beforeEach(() => {
    mockUseLaunchDetail.mockReset().mockReturnValue(noRecord);
    mockUseExternalPoolState.mockReset().mockReturnValue(idle);
    mockUseQuoteUsd.mockReset().mockReturnValue(idle);
    mockUseStonkfunToken.mockReset().mockReturnValue(idle);
  });

  it("reads the Network token's pool from the environment's mint and quote when the tracker has no record", () => {
    mockUseExternalPoolState.mockReturnValue({ ...idle, data: stonkfunPool, isFetched: true });
    const { result } = renderHook(() => useAgentToken(AGENT_MINT));
    expect(mockUseLaunchDetail).toHaveBeenCalledWith(AGENT_MINT);
    expect(mockUseExternalPoolState).toHaveBeenCalledWith({ mint: AGENT_MINT, quoteMint: AGENT_QUOTE_MINT, poolId: null, enabled: true });
    expect(mockUseQuoteUsd).toHaveBeenCalledWith(AGENT_QUOTE_MINT);
    expect(result.current.pool).toBe(stonkfunPool);
    expect(result.current.stats).toEqual(agentStatsFromPool(stonkfunPool, null));
    expect(result.current.isFetched).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it('is loading, with nothing to show, until the pool answers', () => {
    mockUseExternalPoolState.mockReturnValue({ ...idle, isLoading: true });
    const { result } = renderHook(() => useAgentToken(AGENT_MINT));
    expect(result.current).toMatchObject({ stats: null, pool: null, isLoading: true, isFetched: false, isError: false });
  });

  it('reports a pool that cannot be read as an error with no stats, never a sample', () => {
    mockUseExternalPoolState.mockReturnValue({ ...idle, isError: true, error: new Error('cannot found pool') });
    const { result } = renderHook(() => useAgentToken(AGENT_MINT));
    expect(result.current.stats).toBeNull();
    expect(result.current.isError).toBe(true);
    expect(result.current.isFetched).toBe(true);
    expect(result.current.poolError?.message).toBe('cannot found pool');
  });

  it("routes the pool read through the tracker's quote and pool id when it has a record", () => {
    mockUseLaunchDetail.mockReturnValue({ data: { ...record, pool_id: 'RecordedPool' }, isLoading: false, isFetched: true, isError: false });
    mockUseExternalPoolState.mockReturnValue({ ...idle, data: stonkfunPool, isFetched: true });
    mockUseQuoteUsd.mockReturnValue({ ...idle, data: 200 });
    const { result } = renderHook(() => useAgentToken(MINT));
    expect(mockUseExternalPoolState).toHaveBeenCalledWith({ mint: MINT, quoteMint: WSOL, poolId: 'RecordedPool', enabled: true });
    expect(result.current.stats).toEqual(mergeAgentStats(agentStatsFromLaunch({ ...record, pool_id: 'RecordedPool' }), agentStatsFromPool(stonkfunPool, 200)));
  });

  it('keeps the record when the pool read fails, and is then not an error', () => {
    mockUseLaunchDetail.mockReturnValue({ data: record, isLoading: false, isFetched: true, isError: false });
    mockUseExternalPoolState.mockReturnValue({ ...idle, isError: true, error: new Error('rpc') });
    const { result } = renderHook(() => useAgentToken(MINT));
    expect(result.current.stats).toEqual(agentStatsFromLaunch(record));
    expect(result.current.isError).toBe(false);
  });

  it('reads no pool for a mint that is neither recorded nor the Network token', () => {
    const { result } = renderHook(() => useAgentToken(MINT));
    expect(mockUseExternalPoolState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, quoteMint: undefined }));
    expect(result.current).toMatchObject({ stats: null, pool: null, isLoading: false, isFetched: true, isError: false });
  });

  it('passes a null mint through so every query stays disabled', () => {
    mockUseLaunchDetail.mockReturnValue({ data: null, isLoading: false, isFetched: false, isError: false });
    renderHook(() => useAgentToken(null));
    expect(mockUseLaunchDetail).toHaveBeenCalledWith(null);
    expect(mockUseExternalPoolState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

describe('useAgentToken via stonkfun', () => {
  const read = (name: string): unknown => JSON.parse(readFileSync(join(__dirname, '..', '__fixtures__', 'stonkfun', name), 'utf8'));
  const knots = parseStonkfunToken(read('knots-token.json'))!;

  beforeEach(() => {
    mockUseLaunchDetail.mockReset().mockReturnValue(noRecord);
    mockUseExternalPoolState.mockReset().mockReturnValue(idle);
    mockUseQuoteUsd.mockReset().mockReturnValue(idle);
    mockUseStonkfunToken.mockReset().mockReturnValue(idle);
  });

  it('maps the stonkfun token onto the card stats: USD figures, its quote, identity and graduation; no pool, no holders', () => {
    const stats = agentStatsFromStonkfun(knots);
    expect(stats).toMatchObject({
      name: 'KNOTS',
      symbol: 'KNOTS',
      image: 'https://gateway.irys.xyz/3KNgu99JvZ961wXUxcZ8LXDXjaWK4651Wo9oUZSA5U4L',
      quoteSymbol: 'STONK',
      quoteMint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
      priceQuote: null,
      mcapQuote: null,
      supply: null,
      holders: null,
      curveProgressPct: 100,
      graduated: true,
      poolId: 'GeNDy5afAWz7S9w2tMLgpK3xQqXjeDaCvYV9h8joEmjo',
      creatorWallet: 'FYL2HTK3wZyDxdXwEMvCNKhS5J4LyvbggBr6Yj23SUs1',
      platformId: null,
      platformName: 'stonkfun',
      transferFeeBps: 300,
      launchedAt: '2026-09-05T16:34:45.099Z',
    });
    expect(stats.mcapUsd).toBeCloseTo(19_403_285.93, 2);
    expect(stats.priceUsd).toBeCloseTo(0.0194, 4);
    expect(stats.change24h).toBeCloseTo(-10.86, 2);
    expect(stats.volume24h).toBeCloseTo(1_477_671.96, 2);
    expect(stats.liquidityUsd).toBeCloseTo(980_821.94, 2);
    // Still on the curve: the progress is stonkfun's, in percent.
    expect(agentStatsFromStonkfun({ ...knots, graduated: false, graduationProgress: 0.42 }).curveProgressPct).toBeCloseTo(42);
  });

  it('reads stonkfun for the Network token and leaves the tracker and the pool alone', () => {
    mockUseStonkfunToken.mockReturnValue({ ...idle, data: knots, isFetched: true });
    const { result } = renderHook(() => useAgentToken(AGENT_MINT, 'stonkfun'));
    expect(mockUseStonkfunToken).toHaveBeenCalledWith(AGENT_MINT);
    expect(mockUseLaunchDetail).toHaveBeenCalledWith(null);
    expect(mockUseExternalPoolState).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, quoteMint: undefined }));
    expect(mockUseQuoteUsd).toHaveBeenCalledWith(null);
    expect(result.current.source).toBe('stonkfun');
    expect(result.current.pool).toBeNull();
    expect(result.current.stats).toEqual(agentStatsFromStonkfun(knots));
    expect(result.current).toMatchObject({ isLoading: false, isFetched: true, isError: false });
  });

  it('is loading until stonkfun answers, and an honest error when it cannot', () => {
    mockUseStonkfunToken.mockReturnValue({ ...idle, isLoading: true });
    const loading = renderHook(() => useAgentToken(AGENT_MINT, 'stonkfun'));
    expect(loading.result.current).toMatchObject({ stats: null, pool: null, isLoading: true, isFetched: false, isError: false });

    mockUseStonkfunToken.mockReturnValue({ ...idle, isError: true, error: new Error('stonkfun returned 503') });
    const failed = renderHook(() => useAgentToken(AGENT_MINT, 'stonkfun'));
    expect(failed.result.current).toMatchObject({ stats: null, isFetched: true, isError: true });
    expect(failed.result.current.poolError?.message).toBe('stonkfun returned 503');
  });

  it('with the pool source, never asks stonkfun', () => {
    mockUseExternalPoolState.mockReturnValue({ ...idle, data: stonkfunPool, isFetched: true });
    const { result } = renderHook(() => useAgentToken(AGENT_MINT, 'pool'));
    expect(mockUseStonkfunToken).toHaveBeenCalledWith(null);
    expect(mockUseExternalPoolState).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    expect(result.current.source).toBe('pool');
    expect(result.current.stats).toEqual(agentStatsFromPool(stonkfunPool, null));
  });

  it('only routes the Network token through stonkfun: any other mint keeps its tracker read', () => {
    mockUseLaunchDetail.mockReturnValue({ data: record, isLoading: false, isFetched: true, isError: false });
    const { result } = renderHook(() => useAgentToken(MINT, 'stonkfun'));
    expect(mockUseStonkfunToken).toHaveBeenCalledWith(null);
    expect(mockUseLaunchDetail).toHaveBeenCalledWith(MINT);
    expect(result.current.source).toBe('pool');
    expect(result.current.stats).toEqual(agentStatsFromLaunch(record));
  });
});
