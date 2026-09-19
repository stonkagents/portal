import { describe, it, expect } from 'vitest';
import { formatPercent, formatPrice, formatTokenAmount, shortAddress, timeAgo, usdHint } from './detail-format';
import { CHART_TIMEFRAMES, chartEmbedUrl } from './chart-embed';

describe('timeAgo', () => {
  const now = Date.parse('2026-09-12T12:00:00Z');

  it('reads minutes, hours and days', () => {
    expect(timeAgo('2026-09-12T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-09-12T11:37:00Z', now)).toBe('23m ago');
    expect(timeAgo('2026-09-12T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2026-09-07T12:00:00Z', now)).toBe('5d ago');
  });

  it('accepts epoch millis and rejects nonsense', () => {
    expect(timeAgo(now - 120_000, now)).toBe('2m ago');
    expect(timeAgo('not a date', now)).toBe('-');
    expect(timeAgo(null, now)).toBe('-');
  });
});

describe('formatTokenAmount', () => {
  it('compacts big numbers and keeps small ones readable', () => {
    expect(formatTokenAmount(1_250_000_000)).toBe('1.25B');
    expect(formatTokenAmount(2_500_000)).toBe('2.50M');
    expect(formatTokenAmount(45_300)).toBe('45.3K');
    expect(formatTokenAmount(1234.567)).toBe('1,234.57');
    expect(formatTokenAmount(0.000123)).toBe('0.000123');
    expect(formatTokenAmount(0)).toBe('0');
    expect(formatTokenAmount(null)).toBe('-');
  });
});

describe('formatPrice / formatPercent / usdHint / shortAddress', () => {
  it('formats a quote price with a unit', () => {
    expect(formatPrice(0.00001234, 'STONK')).toBe('0.00001234 STONK');
    expect(formatPrice(0, 'STONK')).toBe('-');
  });

  it('drops the decimal on whole percentages', () => {
    expect(formatPercent(85.56)).toBe('85.6%');
    expect(formatPercent(100)).toBe('100%');
  });

  it('only hints USD when both figures are known', () => {
    expect(usdHint(10, 2, u => `$${u}`)).toBe('$20');
    expect(usdHint(10, null, u => `$${u}`)).toBe('');
  });

  it('shortens long addresses only', () => {
    expect(shortAddress('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')).toBe('7xKX…gAsU');
    expect(shortAddress('abc')).toBe('abc');
  });
});

describe('chartEmbedUrl', () => {
  it('passes the timeframe to each provider', () => {
    const dex = new URL(chartEmbedUrl('dexscreener', 'PoolAAA', 'MintAAA', '1h'));
    expect(dex.pathname).toContain('PoolAAA');
    expect(dex.searchParams.get('interval')).toBe('60');
    expect(dex.searchParams.get('embed')).toBe('1');

    const bird = new URL(chartEmbedUrl('birdeye', 'PoolAAA', 'MintAAA', '1d'));
    expect(bird.pathname).toContain('MintAAA');
    expect(bird.searchParams.get('chartInterval')).toBe('1D');
  });

  it('falls back to the default timeframe for an unknown id', () => {
    const url = new URL(chartEmbedUrl('dexscreener', 'PoolAAA', 'MintAAA', 'nope'));
    expect(url.searchParams.get('interval')).toBe('15');
    expect(CHART_TIMEFRAMES.map(t => t.id)).toEqual(['1m', '5m', '15m', '1h', '4h', '1d']);
  });
});
