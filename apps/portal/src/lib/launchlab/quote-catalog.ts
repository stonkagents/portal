/**
 * The quote asset an Agent token trades against: $STONK.
 *
 * There is no picker. Every launch pairs with `STONK_MINT`, and the launch
 * config is fetched for that mint. This module only labels the two quote
 * categories the gallery still shows: $STONK (every launch) and SOL (the devnet
 * test tokens that predate the $STONK quote).
 */

import type { QuoteCategory } from '@/lib/types/agent-token';
import type { LaunchConfig, LaunchQuote } from './launch-config';

const DEFAULT_STONK_MINT = '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';

/**
 * $STONK, the only quote. `NEXT_PUBLIC_STONK_MINT` points a devnet build at the
 * devnet $STONK; the fallback is the mainnet mint.
 */
export const STONK_MINT = process.env.NEXT_PUBLIC_STONK_MINT || DEFAULT_STONK_MINT;

export const QUOTE_CATEGORY_LABELS: Record<QuoteCategory, string> = {
  stonk: '$STONK',
  solana: 'Solana',
};

/** The two ways the tracker names its $STONK quote: the mint, or the symbol on a devnet stand-in. */
export function isStonkQuote(quote: Pick<LaunchQuote, 'quoteMint' | 'symbol'>): boolean {
  return quote.quoteMint === STONK_MINT || quote.symbol.toUpperCase() === 'STONK';
}

/**
 * The quote every launch raises in, from a launch config, or null when the
 * tracker offers none.
 *
 * The tracker names it: `defaultQuoteMint` is $STONK and the only entry in
 * `quotes`, so this is normally `config.quote`. An older tracker without the
 * field is read by mint or symbol. Should a tracker ever price its answer for
 * another quote, the entry found here is the one to re-price for; the form
 * never offers a choice.
 */
export function stonkQuoteIn(config: Pick<LaunchConfig, 'quote' | 'quotes' | 'defaultQuoteMint'>): LaunchQuote | null {
  const byDefault = config.defaultQuoteMint
    ? [config.quote, ...config.quotes].find(quote => quote.quoteMint === config.defaultQuoteMint)
    : undefined;
  if (byDefault) return byDefault;
  if (isStonkQuote(config.quote)) return config.quote;
  return config.quotes.find(isStonkQuote) ?? null;
}

/** Names the tracker uses for SOL. */
const SOLANA_WORDS = new Set(['solana', 'native', 'sol']);

/**
 * The category for a quote: $STONK by mint, SOL by the tracker's word, and
 * null for anything else, which the gallery shows without a label.
 */
export function normalizeQuoteCategory(mint: string | null | undefined, raw: string | null | undefined): QuoteCategory | null {
  if (mint === STONK_MINT) return 'stonk';
  const word = (raw ?? '').toLowerCase();
  if (word === 'stonk') return 'stonk';
  if (SOLANA_WORDS.has(word)) return 'solana';
  return null;
}
