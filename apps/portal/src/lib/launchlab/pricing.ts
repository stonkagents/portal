/**
 * The numbers behind the launch summary.
 *
 * Pure functions, no chain calls, no React. The curve shape and the raise come
 * from `GET /api/launch/config`; the fee rates come from the same response
 * (transfer tax) and from `config.fees` (display split). The maths mirrors
 * Raydium's constant-product LaunchLab curve, so the estimate a creator reads
 * before signing matches what the program does after.
 */

import { LAUNCH_RENT_SOL, RATE_DENOMINATOR } from './constants';
import type { LaunchCurve, LaunchQuote, LaunchRaise } from './launch-config';
import { raiseUnits } from './launch-config';

/** The curve parameters the maths needs, all in raw units. */
export interface CurveShape {
  baseDecimals: number;
  supplyRaw: number;
  totalSellRaw: number;
  totalLockedRaw: number;
}

/** Read the curve shape out of a launch config. */
export function curveShape(curve: LaunchCurve): CurveShape {
  return {
    baseDecimals: curve.baseDecimals,
    supplyRaw: Number(curve.supply),
    totalSellRaw: Number(curve.totalSellA),
    totalLockedRaw: Number(curve.totalLockedAmount ?? 0),
  };
}

/** The fee rates the summary shows. Only `holderTaxBps` is enforced by the mint itself. */
export interface FeeSettings {
  protocolBps: number;
  platformBps: number;
  holderTaxBps: number;
  creatorBps: number;
  /** Our launch fee in USD, as the tracker priced it. */
  launchFeeUsd: number;
}

export interface LaunchSummaryInput {
  quote: LaunchQuote;
  curve: CurveShape;
  raise: LaunchRaise;
  /** USD price of one whole quote token. 0 renders every USD figure as a dash. */
  quotePriceUsd: number;
  /** USD price of one SOL, for the launch cost. */
  solUsd: number;
  /** Our launch fee in lamports, exactly as the tracker priced it. */
  launchFeeLamports: number;
  /** Dev buy as a share of total supply, 0–50. Ignored when a quote amount is given. */
  devBuyPercent?: number;
  /** Dev buy in whole quote tokens. Wins over `devBuyPercent`. */
  devBuyQuoteAmount?: number;
  fees: FeeSettings;
  /** Network rent for the launch, in SOL. */
  rentSol?: number;
}

export interface DevBuyEstimate {
  /** Share of total supply the buy lands, 0–100. */
  percentOfSupply: number;
  /** Cost in whole quote tokens, before network rent. */
  quoteAmount: number;
  quoteAmountRaw: number;
  costUsd: number;
  /** Whole tokens the creator receives, after the holder tax on delivery. */
  tokensReceived: number;
  /** How far the buy moves the curve, in percent. */
  priceImpactPct: number;
  /** Average price paid per token, in quote units. */
  avgPriceQuote: number;
}

export interface LaunchSummary {
  /** Total supply in whole tokens. */
  supply: number;
  /** Graduation raise, in whole quote tokens. */
  graduationQuote: number;
  graduationQuoteRaw: number;
  graduationUsd: number;
  /** How the tracker sized the raise, in its own words. */
  raiseBasis: string;
  /** Price of one token at the first trade, in whole quote tokens. */
  startPriceQuote: number;
  startPriceUsd: number;
  startingMarketCapUsd: number;
  /** Market cap the token graduates at, at today's prices. */
  graduationMarketCapUsd: number;
  fees: {
    /** Everything a trade pays, in basis points. */
    totalTradeBps: number;
    protocolBps: number;
    platformBps: number;
    holderBps: number;
    creatorBps: number;
    /** Token-2022 transfer tax, charged on every transfer. */
    holderTaxBps: number;
  };
  launchCost: {
    rentSol: number;
    feeSol: number;
    feeUsd: number;
    feeLamports: number;
    totalSol: number;
    totalUsd: number;
  };
  devBuy: DevBuyEstimate;
}

/** Virtual reserves of the constant-product curve, in raw units. */
export interface CurveReserves {
  virtualA: number;
  virtualB: number;
}

const LAMPORTS_PER_SOL = 1_000_000_000;
const pow10 = (n: number): number => 10 ** n;

/**
 * Raydium's `LaunchConstantProductCurve.getInitParam`, in floating point.
 * `totalFundRaisingRaw` is the graduation raise in raw quote units.
 */
export function curveReserves(shape: CurveShape, totalFundRaisingRaw: number, migrateFeeRaw = 0): CurveReserves {
  const supplyMinusSellLocked = shape.supplyRaw - shape.totalSellRaw - shape.totalLockedRaw;
  const raiseAfterMigrateFee = totalFundRaisingRaw - migrateFeeRaw;
  if (supplyMinusSellLocked <= 0 || raiseAfterMigrateFee <= 0) {
    return { virtualA: 0, virtualB: 0 };
  }
  const u = (raiseAfterMigrateFee * shape.totalSellRaw * shape.totalSellRaw) / supplyMinusSellLocked;
  const c = (raiseAfterMigrateFee * shape.totalSellRaw) / supplyMinusSellLocked - totalFundRaisingRaw;
  if (c <= 0) return { virtualA: 0, virtualB: 0 };
  return { virtualA: u / c, virtualB: (totalFundRaisingRaw * totalFundRaisingRaw) / c };
}

/** Tokens out for a quote amount in, both raw. Constant product, no fees applied. */
export function buyExactIn(reserves: CurveReserves, amountInRaw: number): number {
  if (amountInRaw <= 0) return 0;
  return (reserves.virtualA * amountInRaw) / (reserves.virtualB + amountInRaw);
}

/** Quote in for an exact token amount out, both raw. Constant product, no fees applied. */
function buyExactOut(reserves: CurveReserves, amountOutRaw: number): number {
  if (amountOutRaw <= 0) return 0;
  if (amountOutRaw >= reserves.virtualA) return Infinity;
  return (reserves.virtualB * amountOutRaw) / (reserves.virtualA - amountOutRaw);
}

/** Fees the curve charges on a trade, in basis points. The holder tax is not one of them. */
function curveFeeBps(fees: FeeSettings): number {
  return fees.protocolBps + fees.platformBps + fees.creatorBps;
}

/**
 * Everything the launch summary shows, priced at the numbers passed in.
 * Zero or missing prices degrade to zeroed USD figures rather than NaN.
 */
export function computeLaunchSummary(input: LaunchSummaryInput): LaunchSummary {
  const { quote, curve, fees } = input;
  const quotePriceUsd = Number.isFinite(input.quotePriceUsd) && input.quotePriceUsd > 0 ? input.quotePriceUsd : 0;
  const solUsd = Number.isFinite(input.solUsd) && input.solUsd > 0 ? input.solUsd : 0;
  const rentSol = input.rentSol ?? LAUNCH_RENT_SOL;

  const graduationRaw = Number(input.raise.raw);
  const graduationQuote = raiseUnits(input.raise, quote);
  const graduationUsd = graduationQuote * quotePriceUsd;

  const reserves = curveReserves(curve, graduationRaw);
  const scale = pow10(curve.baseDecimals - quote.decimals);

  // Price of one whole token, in whole quote tokens.
  const startPriceQuote = reserves.virtualA > 0 ? (reserves.virtualB / reserves.virtualA) * scale : 0;
  const startPriceUsd = startPriceQuote * quotePriceUsd;

  const remainingRaw = curve.supplyRaw - curve.totalSellRaw - curve.totalLockedRaw;
  const graduationPriceQuote = remainingRaw > 0 && graduationRaw > 0 ? (graduationRaw / remainingRaw) * scale : 0;

  const supply = curve.supplyRaw / pow10(curve.baseDecimals);
  const feeSol = input.launchFeeLamports / LAMPORTS_PER_SOL;

  return {
    supply,
    graduationQuote,
    graduationQuoteRaw: graduationRaw,
    graduationUsd,
    raiseBasis: input.raise.basis,
    startPriceQuote,
    startPriceUsd,
    startingMarketCapUsd: startPriceUsd * supply,
    graduationMarketCapUsd: graduationPriceQuote * quotePriceUsd * supply,
    fees: {
      totalTradeBps: fees.protocolBps + fees.platformBps + fees.holderTaxBps + fees.creatorBps,
      protocolBps: fees.protocolBps,
      platformBps: fees.platformBps,
      holderBps: fees.holderTaxBps,
      creatorBps: fees.creatorBps,
      holderTaxBps: fees.holderTaxBps,
    },
    launchCost: {
      rentSol,
      feeSol,
      feeUsd: fees.launchFeeUsd,
      feeLamports: input.launchFeeLamports,
      totalSol: rentSol + feeSol,
      totalUsd: (rentSol + feeSol) * solUsd,
    },
    devBuy: estimateDevBuy({
      reserves,
      curve,
      quote,
      quotePriceUsd,
      fees,
      devBuyPercent: input.devBuyPercent,
      devBuyQuoteAmount: input.devBuyQuoteAmount,
      startPriceQuote,
    }),
  };
}

interface DevBuyInput {
  reserves: CurveReserves;
  curve: CurveShape;
  quote: LaunchQuote;
  quotePriceUsd: number;
  fees: FeeSettings;
  devBuyPercent?: number;
  devBuyQuoteAmount?: number;
  startPriceQuote: number;
}

const EMPTY_DEV_BUY: DevBuyEstimate = {
  percentOfSupply: 0,
  quoteAmount: 0,
  quoteAmountRaw: 0,
  costUsd: 0,
  tokensReceived: 0,
  priceImpactPct: 0,
  avgPriceQuote: 0,
};

/**
 * What a bundled first buy costs and what it lands.
 *
 * Either side can drive it: a share of supply is converted to a quote cost, a
 * quote amount is converted to tokens. Curve fees are taken off the way in, the
 * holder tax off the tokens delivered.
 */
function estimateDevBuy(input: DevBuyInput): DevBuyEstimate {
  const { reserves, curve, quote, quotePriceUsd, fees, startPriceQuote } = input;
  if (reserves.virtualA <= 0) return EMPTY_DEV_BUY;

  const feeRate = curveFeeBps(fees) / RATE_DENOMINATOR;
  const taxRate = fees.holderTaxBps / RATE_DENOMINATOR;
  const quoteScale = pow10(quote.decimals);
  const baseScale = pow10(curve.baseDecimals);

  let quoteAmountRaw: number;
  if (input.devBuyQuoteAmount !== undefined && input.devBuyQuoteAmount > 0) {
    quoteAmountRaw = input.devBuyQuoteAmount * quoteScale;
  } else if (input.devBuyPercent !== undefined && input.devBuyPercent > 0) {
    // Gross the target up so the holder tax still leaves the requested share.
    const targetRaw = (input.devBuyPercent / 100) * curve.supplyRaw;
    const beforeTaxRaw = taxRate < 1 ? targetRaw / (1 - taxRate) : targetRaw;
    const netInRaw = buyExactOut(reserves, beforeTaxRaw);
    if (!Number.isFinite(netInRaw)) return EMPTY_DEV_BUY;
    quoteAmountRaw = feeRate < 1 ? netInRaw / (1 - feeRate) : netInRaw;
  } else {
    return EMPTY_DEV_BUY;
  }

  const netInRaw = quoteAmountRaw * (1 - feeRate);
  const grossOutRaw = buyExactIn(reserves, netInRaw);
  const tokensRaw = grossOutRaw * (1 - taxRate);

  const quoteAmount = quoteAmountRaw / quoteScale;
  const tokensReceived = tokensRaw / baseScale;
  const avgPriceQuote = tokensReceived > 0 ? quoteAmount / tokensReceived : 0;
  const priceAfterQuote =
    ((reserves.virtualB + netInRaw) / (reserves.virtualA - grossOutRaw)) * pow10(curve.baseDecimals - quote.decimals);

  return {
    percentOfSupply: (tokensRaw / curve.supplyRaw) * 100,
    quoteAmount,
    quoteAmountRaw,
    costUsd: quoteAmount * quotePriceUsd,
    tokensReceived,
    priceImpactPct: startPriceQuote > 0 ? (priceAfterQuote / startPriceQuote - 1) * 100 : 0,
    avgPriceQuote,
  };
}

/** Basis points as a percentage string, e.g. 225 -> "2.25%". */
export function bpsToPercent(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0$/, '')}%`;
}
