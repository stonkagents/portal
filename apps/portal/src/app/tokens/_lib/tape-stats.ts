/**
 * Figures derived from the tape and the holders list: 24h volume, today's
 * trade count, holder concentration. Pure functions, tested on their own.
 */

import type { TapeTrade } from './candles';

export interface TapeStats {
  /** Quote volume in the last 24 hours. */
  volume24hQuote: number;
  /** Trades (buys and sells) in the last 24 hours. */
  trades24h: number;
  buys24h: number;
  sells24h: number;
  /** Trades since midnight UTC. */
  tradesToday: number;
  /** True when the tape window is shorter than 24h, so the figures are a floor. */
  truncated: boolean;
}

const DAY_SECONDS = 24 * 60 * 60;

/** Sum the tape over the last 24 hours and since midnight UTC. */
export function tapeStats(trades: readonly TapeTrade[], nowSeconds: number = Math.floor(Date.now() / 1000)): TapeStats {
  const since24h = nowSeconds - DAY_SECONDS;
  const midnight = Math.floor(nowSeconds / DAY_SECONDS) * DAY_SECONDS;
  let volume24hQuote = 0;
  let buys24h = 0;
  let sells24h = 0;
  let tradesToday = 0;
  let oldest: number | null = null;

  for (const trade of trades) {
    if (trade.blockTime == null) continue;
    oldest = oldest == null ? trade.blockTime : Math.min(oldest, trade.blockTime);
    if (trade.type !== 'buy' && trade.type !== 'sell') continue;
    if (trade.blockTime >= since24h) {
      volume24hQuote += trade.amountQuote ?? 0;
      if (trade.type === 'buy') buys24h += 1;
      else sells24h += 1;
    }
    if (trade.blockTime >= midnight) tradesToday += 1;
  }

  return {
    volume24hQuote,
    trades24h: buys24h + sells24h,
    buys24h,
    sells24h,
    tradesToday,
    // The tape only goes back as far as the RPC listed; if its oldest row is inside the window, more may exist.
    truncated: trades.length > 0 && (oldest == null || oldest > since24h),
  };
}

export interface HolderLike {
  amount: number;
  isPool?: boolean;
}

export interface Concentration {
  /** Share of circulating supply held by the ten largest non-pool holders, 0–100. */
  top10Pct: number;
  /** Share held by holders ranked 11–110, 0–100. */
  next100Pct: number;
  /** Non-pool holders counted. */
  holders: number;
}

/**
 * Holder concentration over the circulating supply, i.e. everything not in the
 * curve's vault. The list may be capped by the RPC; the caller says so.
 */
export function concentration(holders: readonly HolderLike[]): Concentration {
  const wallets = holders.filter(h => !h.isPool && h.amount > 0).sort((a, b) => b.amount - a.amount);
  const circulating = wallets.reduce((sum, h) => sum + h.amount, 0);
  if (circulating <= 0) return { top10Pct: 0, next100Pct: 0, holders: 0 };
  const sum = (from: number, to: number) => wallets.slice(from, to).reduce((s, h) => s + h.amount, 0);
  return {
    top10Pct: (sum(0, 10) / circulating) * 100,
    next100Pct: (sum(10, 110) / circulating) * 100,
    holders: wallets.length,
  };
}
