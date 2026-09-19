/**
 * Pure helpers behind the chart card: the interval set the chips show, the
 * delta strip read off the tape, subscript-zero prices for the axis and the
 * body-range law that keeps one wild wick from squashing the candles.
 *
 * Nothing here touches the DOM, so it is tested on its own.
 */
import { CANDLE_TIMEFRAMES, pricedTrades, type Candle, type CandleTimeframe, type TapeTrade } from '../_lib/candles';

/** The intervals the chart offers, in chip order; the shared table keeps 1m for other callers. */
const CHART_INTERVAL_IDS = ['5m', '15m', '1h', '4h', '1d'] as const;

/** The chip set: the shared timeframes narrowed and ordered to the terminal's five, labelled by id. */
export const CHART_INTERVALS: readonly CandleTimeframe[] = CHART_INTERVAL_IDS.map(id => {
  const tf = CANDLE_TIMEFRAMES.find(t => t.id === id);
  if (!tf) throw new Error(`chart interval ${id} is not a candle timeframe`);
  return { ...tf, label: id };
});

/** ArrowRight / ArrowLeft step through a chip row, wrapping at the ends. */
export function stepOption<T extends string>(ids: readonly T[], current: T, direction: 1 | -1): T {
  if (ids.length === 0) return current;
  const idx = Math.max(0, ids.indexOf(current));
  return ids[(idx + direction + ids.length) % ids.length] as T;
}

export const DELTA_WINDOWS = [
  { label: '5m', secs: 300 },
  { label: '1h', secs: 3600 },
  { label: '6h', secs: 6 * 3600 },
  { label: '24h', secs: 24 * 3600 },
] as const;

/**
 * The change over a window, read off the tape: the last trade at or before
 * `nowTs - windowSec` against `price`. Null when the tape does not reach back
 * that far, so the strip prints '-' rather than a number it cannot stand behind.
 */
export function deltaPct(trades: readonly TapeTrade[], price: number | null, windowSec: number, nowTs: number): number | null {
  if (price == null || !(price > 0)) return null;
  const cutoff = nowTs - windowSec;
  let ref: TapeTrade | null = null;
  for (const t of pricedTrades(trades)) {
    if ((t.blockTime as number) <= cutoff) ref = t;
    else break;
  }
  if (!ref) return null;
  const refPrice = ref.price as number;
  return ((price - refPrice) / refPrice) * 100;
}

/** '+3.2%' · '-12.0%' · '+140%' past ±100; '-' when unknown. */
export function formatDelta(d: number | null): string {
  if (d === null || !Number.isFinite(d)) return '-';
  const body = Math.abs(d) >= 100 ? String(Math.round(Math.abs(d))) : Math.abs(d).toFixed(1);
  return `${d >= 0 ? '+' : '-'}${body}%`;
}

const SUBS = '₀₁₂₃₄₅₆₇₈₉';

/** Subscript-zero prices: 0.0000227 → "0.0₄227" · 602410 → "602.41K" · 0.0512 → "0.0512". */
export function subZero(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (v >= 1_000_000_000) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1_000_000) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1_000) return (v / 1e3).toFixed(2) + 'K';
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  const m = v.toFixed(18).match(/^0\.(0+)([1-9]\d*)/);
  if (!m) return v.toPrecision(3);
  const zeros = m[1]?.length ?? 0;
  const digits = m[2] ?? '';
  if (zeros < 3) return v.toPrecision(4);
  const sub = String(zeros)
    .split('')
    .map(d => SUBS[+d])
    .join('');
  return `0.0${sub}${digits.slice(0, 4).replace(/0+$/, '')}`;
}

/** A magnitude that adapts: 1.20B · 4.50M · 18.4K · 12.00 · 0.0042. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  if (a >= 1) return n.toFixed(2);
  return a === 0 ? '0' : n.toFixed(4);
}

/**
 * The sparse-tape law: the price axis is fixed to candle BODIES; wicks may
 * stretch it 1.5× the body range and clip beyond, so one wild wick cannot
 * squash the real action into a floor line.
 */
export function bodyRange(candles: readonly Candle[]): { min: number; max: number } | null {
  if (candles.length === 0) return null;
  let bodyLo = Infinity;
  let bodyHi = -Infinity;
  let wickLo = Infinity;
  let wickHi = -Infinity;
  for (const c of candles) {
    bodyLo = Math.min(bodyLo, c.open, c.close);
    bodyHi = Math.max(bodyHi, c.open, c.close);
    wickLo = Math.min(wickLo, c.low);
    wickHi = Math.max(wickHi, c.high);
  }
  const range = Math.max(bodyHi - bodyLo, bodyHi * 0.04, 1e-12);
  const lo = Math.max(0, Math.max(wickLo, bodyLo - range * 1.5) - range * 0.25);
  const hi = Math.min(wickHi, bodyHi + range * 1.5) + range * 0.25;
  return { min: lo, max: hi };
}
