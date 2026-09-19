/**
 * $AGENT token constants: env overrides and their fallbacks, and the rule that
 * a burn schedule, a vesting plan or a launch-buy share exists only when the
 * environment states it. The module reads process.env at import time, so each
 * case re-imports it with a fresh environment.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const WSOL = 'So11111111111111111111111111111111111111112';

const load = async (env: Record<string, string> = {}) => {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('../agent-token');
};

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const key of [
    'NEXT_PUBLIC_AGENT_MINT',
    'NEXT_PUBLIC_AGENT_SOURCE',
    'NEXT_PUBLIC_AGENT_BUY_URL',
    'NEXT_PUBLIC_AGENT_POOL',
    'NEXT_PUBLIC_AGENT_QUOTE_MINT',
    'NEXT_PUBLIC_AGENT_TOTAL_SUPPLY',
    'NEXT_PUBLIC_AGENT_BURN_TOTAL_PCT',
    'NEXT_PUBLIC_AGENT_BURN_STEP_PCT',
    'NEXT_PUBLIC_AGENT_BURN_INTERVAL',
    'NEXT_PUBLIC_AGENT_BURN_START',
    'NEXT_PUBLIC_AGENT_TEAM_PCT',
    'NEXT_PUBLIC_AGENT_VESTING_LOCK_DATE',
    'NEXT_PUBLIC_AGENT_VESTING_CLIFF_DATE',
    'NEXT_PUBLIC_AGENT_VESTING_CADENCE',
    'NEXT_PUBLIC_AGENT_VESTING_MONTHS',
    'NEXT_PUBLIC_AGENT_VESTING_URL',
    'NEXT_PUBLIC_AGENT_LAUNCH_BUY_PCT',
  ]) {
    vi.stubEnv(key, '');
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('agent-token', () => {
  it('falls back to the default mint, the token page, a derived pool and a SOL quote', async () => {
    const mod = await load();
    expect(mod.AGENT_SOURCE).toBe('pool');
    expect(mod.AGENT_VIA_STONKFUN).toBe(false);
    expect(mod.AGENT_STONKFUN_URL).toBeNull();
    expect(mod.AGENT_MINT).toBe('tRqrTWVmyZD7pqgu8jkBJodLyCKYJhC7Wbgi1MnT9gSr');
    expect(mod.AGENT_MINT).toBe(mod.DEFAULT_AGENT_MINT);
    expect(mod.AGENT_BUY_HREF).toBe(`/tokens/${mod.DEFAULT_AGENT_MINT}/`);
    expect(mod.AGENT_EXTERNAL_BUY_URL).toBeNull();
    expect(mod.AGENT_POOL_ID).toBeNull();
    expect(mod.AGENT_QUOTE_MINT).toBe(WSOL);
    expect(mod.agentQuoteSymbol()).toBe('SOL');
    expect(mod.AGENT_TOTAL_SUPPLY).toBeNull();
    expect(mod.isAgentMint(mod.AGENT_MINT)).toBe(true);
    expect(mod.isAgentMint('Other')).toBe(false);
  });

  it('reads the mint, the pool and the quote from the environment', async () => {
    const mod = await load({
      NEXT_PUBLIC_AGENT_MINT: '  MintFromEnv111  ',
      NEXT_PUBLIC_AGENT_POOL: 'PoolFromEnv',
      NEXT_PUBLIC_AGENT_QUOTE_MINT: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
      NEXT_PUBLIC_AGENT_TOTAL_SUPPLY: '1000000000',
    });
    expect(mod.AGENT_MINT).toBe('MintFromEnv111');
    expect(mod.AGENT_BUY_HREF).toBe('/tokens/MintFromEnv111/');
    expect(mod.AGENT_POOL_ID).toBe('PoolFromEnv');
    expect(mod.agentQuoteSymbol()).toBe('STONK');
    expect(mod.agentQuoteSymbol('SomeOtherMint')).toBeNull();
    expect(mod.AGENT_TOTAL_SUPPLY).toBe(1_000_000_000);
  });

  it('prefers NEXT_PUBLIC_AGENT_BUY_URL when set', async () => {
    const mod = await load({ NEXT_PUBLIC_AGENT_BUY_URL: 'https://stonk.fun/token/AGENT' });
    expect(mod.AGENT_BUY_HREF).toBe('https://stonk.fun/token/AGENT');
    expect(mod.AGENT_EXTERNAL_BUY_URL).toBe('https://stonk.fun/token/AGENT');
    expect(mod.AGENT_MINT).toBe(mod.DEFAULT_AGENT_MINT);
  });

  it('builds the featured token identity only; the numbers come from the chain', async () => {
    const { featuredAgentToken, AGENT_MINT } = await load();
    const token = featuredAgentToken();
    expect(token).toEqual({ mint: AGENT_MINT, name: 'StonkAgents', symbol: 'AGENT', quoteSymbol: 'SOL' });
    expect(featuredAgentToken('Other').mint).toBe('Other');
  });

  it('has no sample market data', async () => {
    const mod = (await load()) as Record<string, unknown>;
    expect(Object.keys(mod).filter(k => /sample/i.test(k))).toEqual([]);
  });

  describe('burn schedule from the environment', () => {
    it('is null unless the total, the step and the interval are all set', async () => {
      expect((await load()).AGENT_BURN_SCHEDULE).toBeNull();
      expect((await load({ NEXT_PUBLIC_AGENT_BURN_TOTAL_PCT: '15' })).AGENT_BURN_SCHEDULE).toBeNull();
      expect(
        (await load({ NEXT_PUBLIC_AGENT_BURN_TOTAL_PCT: '15', NEXT_PUBLIC_AGENT_BURN_STEP_PCT: '1' })).AGENT_BURN_SCHEDULE,
      ).toBeNull();
      expect(
        (
          await load({
            NEXT_PUBLIC_AGENT_BURN_TOTAL_PCT: '15',
            NEXT_PUBLIC_AGENT_BURN_STEP_PCT: '1',
            NEXT_PUBLIC_AGENT_BURN_INTERVAL: 'nope',
          })
        ).AGENT_BURN_SCHEDULE,
      ).toBeNull();
    });

    it('is the stated plan when it is complete', async () => {
      const { AGENT_BURN_SCHEDULE, burnScheduleFromEnv } = await load({
        NEXT_PUBLIC_AGENT_BURN_TOTAL_PCT: '0.75',
        NEXT_PUBLIC_AGENT_BURN_STEP_PCT: '0.05',
        NEXT_PUBLIC_AGENT_BURN_INTERVAL: '1h',
        NEXT_PUBLIC_AGENT_BURN_START: '2026-09-13T22:00:00Z',
      });
      expect(AGENT_BURN_SCHEDULE).toEqual({ totalPct: 0.75, stepPct: 0.05, intervalMs: 3_600_000, start: '2026-09-13T22:00:00Z' });
      expect(burnScheduleFromEnv({})).toBeNull();
      expect(burnScheduleFromEnv({ NEXT_PUBLIC_AGENT_BURN_TOTAL_PCT: '0', NEXT_PUBLIC_AGENT_BURN_STEP_PCT: '1', NEXT_PUBLIC_AGENT_BURN_INTERVAL: '1d' })).toBeNull();
    });
  });

  describe('vesting from the environment', () => {
    const full = {
      NEXT_PUBLIC_AGENT_TEAM_PCT: '5',
      NEXT_PUBLIC_AGENT_VESTING_LOCK_DATE: '2027-01-15',
      NEXT_PUBLIC_AGENT_VESTING_CLIFF_DATE: '2027-04-01',
      NEXT_PUBLIC_AGENT_VESTING_CADENCE: 'weekly',
      NEXT_PUBLIC_AGENT_VESTING_MONTHS: '18',
    };

    it('is null unless the whole plan is written down', async () => {
      const { vestingFromEnv, AGENT_VESTING, TEAM_VESTING_STREAM_URL } = await load();
      expect(AGENT_VESTING).toBeNull();
      expect(TEAM_VESTING_STREAM_URL).toBeNull();
      for (const key of Object.keys(full)) {
        const partial = { ...full } as Record<string, string>;
        delete partial[key];
        expect(vestingFromEnv(partial)).toBeNull();
      }
      expect(vestingFromEnv({ ...full, NEXT_PUBLIC_AGENT_VESTING_CADENCE: 'hourly' })).toBeNull();
      expect(vestingFromEnv({ ...full, NEXT_PUBLIC_AGENT_VESTING_LOCK_DATE: 'soon' })).toBeNull();
    });

    it('is the stated plan when it is complete, with the stream link when set', async () => {
      const { AGENT_VESTING, TEAM_VESTING_STREAM_URL } = await load({ ...full, NEXT_PUBLIC_AGENT_VESTING_URL: 'https://app.streamflow.finance/x' });
      expect(AGENT_VESTING).toEqual({
        teamPct: 5,
        lockDate: '2027-01-15',
        cliffDate: '2027-04-01',
        cadence: 'weekly',
        months: 18,
        url: 'https://app.streamflow.finance/x',
      });
      expect(TEAM_VESTING_STREAM_URL).toBe('https://app.streamflow.finance/x');
    });
  });

  it('states a launch-buy share only from the environment', async () => {
    expect((await load()).AGENT_LAUNCH_BUY_PCT).toBeNull();
    expect((await load({ NEXT_PUBLIC_AGENT_LAUNCH_BUY_PCT: '20' })).AGENT_LAUNCH_BUY_PCT).toBe(20);
  });

  it('burnedSoFar needs both supplies', async () => {
    const { burnedSoFar } = await load();
    expect(burnedSoFar(998_750_000, 1e9)).toBe(1_250_000);
    expect(burnedSoFar(1.1e9, 1e9)).toBe(0);
    expect(burnedSoFar(null, 1e9)).toBeNull();
    expect(burnedSoFar(1e9, null)).toBeNull();
  });
});

describe('agent-token source', () => {
  const KNOTS = '8RVBk8vxLiUHueLUW1f4izFVqN3nWippLhkohKg6EGkS';

  it('is stonkfun only when the environment says so, in any case; anything else is the pool', async () => {
    const mod = await load();
    expect(mod.agentSourceFromEnv('stonkfun')).toBe('stonkfun');
    expect(mod.agentSourceFromEnv(' StonkFun ')).toBe('stonkfun');
    expect(mod.agentSourceFromEnv('pool')).toBe('pool');
    expect(mod.agentSourceFromEnv('stonk.fun')).toBe('pool');
    expect(mod.agentSourceFromEnv('')).toBe('pool');
    expect(mod.agentSourceFromEnv(undefined)).toBe('pool');
  });

  it('via stonkfun, Buy lands on the token page in-app swap; the Jupiter page (quote -> token pre-filled) is the second door', async () => {
    const STONK = '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';
    const mod = await load({ NEXT_PUBLIC_AGENT_SOURCE: 'stonkfun', NEXT_PUBLIC_AGENT_MINT: KNOTS, NEXT_PUBLIC_AGENT_QUOTE_MINT: STONK });
    expect(mod.AGENT_SOURCE).toBe('stonkfun');
    expect(mod.AGENT_VIA_STONKFUN).toBe(true);
    expect(mod.AGENT_STONKFUN_URL).toBe(`https://www.stonkfun.xyz/token/${KNOTS}`);
    expect(mod.AGENT_JUPITER_URL).toBe(`https://jup.ag/swap/${STONK}-${KNOTS}`);
    expect(mod.AGENT_EXTERNAL_BUY_URL).toBe(`https://jup.ag/swap/${STONK}-${KNOTS}`);
    expect(mod.AGENT_PAGE_HREF).toBe(`/tokens/${KNOTS}/`);
    expect(mod.AGENT_TRADE_HREF).toBe(`/tokens/${KNOTS}/#trade`);
    expect(mod.AGENT_BUY_HREF).toBe(`/tokens/${KNOTS}/#trade`);
    expect(mod.jupiterSwapUrl('a', 'b', 'https://jup.example/')).toBe('https://jup.example/swap/a-b');
  });

  it('a configured buy URL still overrides both the in-app swap and the Jupiter link', async () => {
    const mod = await load({ NEXT_PUBLIC_AGENT_SOURCE: 'stonkfun', NEXT_PUBLIC_AGENT_MINT: KNOTS, NEXT_PUBLIC_AGENT_BUY_URL: 'https://dex.example/swap' });
    expect(mod.AGENT_BUY_HREF).toBe('https://dex.example/swap');
    expect(mod.AGENT_EXTERNAL_BUY_URL).toBe('https://dex.example/swap');
    expect(mod.AGENT_JUPITER_URL).toBe(`https://jup.ag/swap/${mod.AGENT_QUOTE_MINT}-${KNOTS}`);
  });

  it('reads the created supply back from the live supply plus the burns', async () => {
    const mod = await load();
    expect(mod.createdSupplyFromBurns(998_724_544.962446, 1_275_455.037554)).toBeCloseTo(1_000_000_000, 3);
    expect(mod.createdSupplyFromBurns(null, 1)).toBeNull();
    expect(mod.createdSupplyFromBurns(10, null)).toBeNull();
    expect(mod.createdSupplyFromBurns(10, -5)).toBe(10);
  });
});
