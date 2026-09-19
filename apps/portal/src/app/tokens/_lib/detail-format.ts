/**
 * Number and time formatting for the token detail page.
 *
 * Every figure on the page goes through one of these so the header, the curve
 * block, the trade panel and the tables agree on how a value reads.
 */

/** "3m ago", "2h ago", "5d ago"; shared with the bell. */
export { timeAgo } from '@/lib/utils/format';

/** Whole-token amounts: 1.2M, 45.3K, 1,234.56, 0.000123. */
export function formatTokenAmount(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  if (abs >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: digits });
  if (abs === 0) return '0';
  return value.toLocaleString('en-US', { maximumSignificantDigits: 3 });
}

/** A price in the quote asset, with enough digits to be meaningful for small values. */
export function formatPrice(value: number | null | undefined, unit: string | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '-';
  const digits = value >= 1 ? 4 : value >= 0.0001 ? 6 : 10;
  const text = value.toLocaleString('en-US', { maximumFractionDigits: digits });
  return unit ? `${text} ${unit}` : text;
}

/** 0-100 as "12.3%"; whole numbers drop the decimal. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value % 1 === 0 ? value : value.toFixed(digits)}%`;
}

/** A USD figure next to a quote amount, or an empty string when the price is unknown. */
export function usdHint(quoteAmount: number | null | undefined, quoteUsd: number | null | undefined, format: (usd: number) => string): string {
  if (quoteAmount == null || quoteUsd == null || !Number.isFinite(quoteAmount) || !Number.isFinite(quoteUsd)) return '';
  return format(quoteAmount * quoteUsd);
}

/** "abcd…wxyz" for tables where the 6+4 form is too wide. */
export function shortAddress(addr: string, head = 4, tail = 4): string {
  return addr.length > head + tail + 1 ? `${addr.slice(0, head)}…${addr.slice(-tail)}` : addr;
}

/** Which unit a figure is shown in: the launch's quote asset, or USD through the quote's price. */
export type Denomination = 'quote' | 'usd';

/**
 * A quote-denominated figure, in the chosen unit. USD needs the quote's price;
 * without it the quote figure is shown instead so the page never goes blank.
 */
export function formatDenominated(
  valueQuote: number | null | undefined,
  denomination: Denomination,
  quoteSymbol: string | null,
  quoteUsd: number | null | undefined,
  kind: 'price' | 'amount' = 'amount',
): string {
  if (valueQuote == null || !Number.isFinite(valueQuote)) return '-';
  if (denomination === 'usd' && quoteUsd != null && quoteUsd > 0) {
    const usd = valueQuote * quoteUsd;
    if (kind === 'price') return `$${usd >= 1 ? usd.toLocaleString('en-US', { maximumFractionDigits: 4 }) : usd.toLocaleString('en-US', { maximumSignificantDigits: 4 })}`;
    return `$${formatTokenAmount(usd)}`;
  }
  return kind === 'price' ? formatPrice(valueQuote, quoteSymbol) : `${formatTokenAmount(valueQuote, 4)}${quoteSymbol ? ` ${quoteSymbol}` : ''}`;
}
