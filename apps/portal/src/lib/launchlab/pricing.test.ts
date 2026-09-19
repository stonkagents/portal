import { describe, expect, it } from 'vitest';
import { bpsToPercent, computeLaunchSummary, curveReserves, curveShape, type FeeSettings } from './pricing';
import { LAUNCH_CONFIG, LAUNCH_CONFIG_USDC, STONK_QUOTE, USDC_QUOTE } from './__fixtures__/launch-config';
import { SUPPLY_RAW, TOTAL_SELL_A_RAW } from './constants';

const FEES: FeeSettings = {
  protocolBps: 25,
  platformBps: 100,
  holderTaxBps: LAUNCH_CONFIG.transferFeeBps,
  creatorBps: 0,
  launchFeeUsd: LAUNCH_CONFIG.fee.usd,
};

/** Fixed prices, so every number below is deterministic. */
const PRICES = { solUsd: 100, quotePriceUsd: 0.25 };

const CURVE = curveShape(LAUNCH_CONFIG.curve);

const summaryFor = (over: Partial<Parameters<typeof computeLaunchSummary>[0]> = {}) =>
  computeLaunchSummary({
    quote: STONK_QUOTE,
    curve: CURVE,
    raise: LAUNCH_CONFIG.raise,
    launchFeeLamports: LAUNCH_CONFIG.fee.lamports,
    fees: FEES,
    ...PRICES,
    ...over,
  });

describe('curveShape', () => {
  it('reads the curve out of the launch config as numbers', () => {
    expect(CURVE).toEqual({
      baseDecimals: 6,
      supplyRaw: SUPPLY_RAW,
      totalSellRaw: TOTAL_SELL_A_RAW,
      totalLockedRaw: 0,
    });
  });
});

describe('computeLaunchSummary', () => {
  it('takes the graduation raise from the tracker, not from a price', () => {
    const s = summaryFor();
    expect(s.graduationQuote).toBeCloseTo(32230.14, 2);
    expect(s.graduationQuoteRaw).toBe(Number(LAUNCH_CONFIG.raise.raw));
    expect(s.graduationUsd).toBeCloseTo(32230.14 * 0.25, 1);
    expect(s.raiseBasis).toBe(LAUNCH_CONFIG.raise.basis);
  });

  it('prices the raise in whichever quote the tracker resolved', () => {
    const s = summaryFor({ quote: USDC_QUOTE, raise: LAUNCH_CONFIG_USDC.raise, quotePriceUsd: 1 });
    expect(s.graduationQuote).toBeCloseTo(8670.405, 3);
    expect(s.graduationUsd).toBeCloseTo(8670.405, 3);
  });

  it('starts the curve at roughly a third of the graduation valuation', () => {
    const s = summaryFor();
    expect(s.startingMarketCapUsd / s.graduationUsd).toBeCloseTo(0.3289, 3);
  });

  it('reads the same starting valuation whatever the quote decimals', () => {
    const stonk = summaryFor();
    const usdc = summaryFor({ quote: USDC_QUOTE, raise: LAUNCH_CONFIG_USDC.raise, quotePriceUsd: 1 });
    // Both raises are worth the same in USD, so the curves start at the same valuation.
    expect(usdc.startingMarketCapUsd / usdc.graduationUsd).toBeCloseTo(stonk.startingMarketCapUsd / stonk.graduationUsd, 6);
  });

  it('reports supply and the fee split', () => {
    const s = summaryFor();
    expect(s.supply).toBe(1_000_000_000);
    expect(s.fees.totalTradeBps).toBe(225);
    expect(s.fees).toMatchObject({ protocolBps: 25, platformBps: 100, holderBps: 100, creatorBps: 0, holderTaxBps: 100 });
  });

  it('prices the launch as rent plus the fee the tracker quoted in lamports', () => {
    const s = summaryFor();
    expect(s.launchCost.rentSol).toBeCloseTo(0.015, 6);
    expect(s.launchCost.feeLamports).toBe(4_901_732);
    expect(s.launchCost.feeSol).toBeCloseTo(0.004901732, 9);
    expect(s.launchCost.feeUsd).toBe(0.5);
    expect(s.launchCost.totalSol).toBeCloseTo(0.019901732, 9);
    expect(s.launchCost.totalUsd).toBeCloseTo(1.9901732, 6);
  });

  it('falls back to zeroed USD rather than NaN when a price is missing', () => {
    const s = summaryFor({ quotePriceUsd: 0, solUsd: Number.NaN });
    expect(s.graduationQuote).toBeCloseTo(32230.14, 2);
    expect(s.graduationUsd).toBe(0);
    expect(s.startingMarketCapUsd).toBe(0);
    expect(s.launchCost.totalUsd).toBe(0);
    expect(Number.isNaN(s.devBuy.quoteAmount)).toBe(false);
  });
});

describe('dev buy', () => {
  it('is empty when nothing is bought', () => {
    expect(summaryFor().devBuy.quoteAmount).toBe(0);
    expect(summaryFor().devBuy.tokensReceived).toBe(0);
  });

  it('lands the requested share of supply, net of the holder tax', () => {
    const { devBuy } = summaryFor({ devBuyPercent: 10 });
    expect(devBuy.percentOfSupply).toBeCloseTo(10, 6);
    expect(devBuy.tokensReceived).toBeCloseTo(100_000_000, 0);
  });

  it('costs a fraction of the raise and moves the price up', () => {
    const s = summaryFor({ devBuyPercent: 10 });
    expect(s.devBuy.quoteAmount).toBeGreaterThan(0);
    expect(s.devBuy.quoteAmount).toBeLessThan(s.graduationQuote);
    expect(s.devBuy.costUsd).toBeCloseTo(s.devBuy.quoteAmount * PRICES.quotePriceUsd, 6);
    expect(s.devBuy.priceImpactPct).toBeGreaterThan(0);
    expect(s.devBuy.avgPriceQuote).toBeGreaterThan(s.startPriceQuote);
  });

  it('agrees whichever side of the trade you drive it from', () => {
    const byPercent = summaryFor({ devBuyPercent: 10 }).devBuy;
    const byAmount = summaryFor({ devBuyQuoteAmount: byPercent.quoteAmount }).devBuy;
    expect(byAmount.tokensReceived).toBeCloseTo(byPercent.tokensReceived, 0);
    expect(byAmount.percentOfSupply).toBeCloseTo(10, 4);
  });

  it('costs more per token the bigger the buy', () => {
    const small = summaryFor({ devBuyPercent: 5 }).devBuy;
    const large = summaryFor({ devBuyPercent: 40 }).devBuy;
    expect(large.avgPriceQuote).toBeGreaterThan(small.avgPriceQuote);
    expect(large.priceImpactPct).toBeGreaterThan(small.priceImpactPct);
  });
});

describe('curveReserves', () => {
  it('keeps the whole raise inside the tokens on the curve', () => {
    const reserves = curveReserves(CURVE, Number(LAUNCH_CONFIG.raise.raw));
    expect(reserves.virtualA).toBeGreaterThan(TOTAL_SELL_A_RAW);
    expect(reserves.virtualA).toBeLessThan(SUPPLY_RAW * 2);
    expect(reserves.virtualB).toBeGreaterThan(0);
  });

  it('returns nothing for a raise of zero', () => {
    expect(curveReserves(CURVE, 0)).toEqual({ virtualA: 0, virtualB: 0 });
  });
});

describe('bpsToPercent', () => {
  it('reads back the way the fee is written', () => {
    expect(bpsToPercent(225)).toBe('2.25%');
    expect(bpsToPercent(100)).toBe('1%');
    expect(bpsToPercent(25)).toBe('0.25%');
    expect(bpsToPercent(50)).toBe('0.5%');
  });
});
