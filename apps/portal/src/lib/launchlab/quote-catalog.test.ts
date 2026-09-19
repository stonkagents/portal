import { describe, expect, it } from 'vitest';
import { QUOTE_CATEGORY_LABELS, STONK_MINT, isStonkQuote, normalizeQuoteCategory, stonkQuoteIn } from './quote-catalog';
import { LAUNCH_CONFIG, SOL_QUOTE, STONK_QUOTE, USDC_QUOTE } from './__fixtures__/launch-config';

describe('STONK_MINT', () => {
  it('is the mint the fixture config was priced for', () => {
    expect(STONK_MINT).toBe(STONK_QUOTE.quoteMint);
  });
});

describe('isStonkQuote', () => {
  it('knows $STONK by mint and by symbol (the devnet stand-in has another mint)', () => {
    expect(isStonkQuote(STONK_QUOTE)).toBe(true);
    expect(isStonkQuote({ quoteMint: 'USDCoctStandIn', symbol: 'stonk' })).toBe(true);
    expect(isStonkQuote(SOL_QUOTE)).toBe(false);
    expect(isStonkQuote(USDC_QUOTE)).toBe(false);
  });
});

describe('stonkQuoteIn', () => {
  it("is the config's own quote when the tracker priced it for $STONK", () => {
    expect(stonkQuoteIn(LAUNCH_CONFIG)).toBe(STONK_QUOTE);
  });

  it("follows the tracker's defaultQuoteMint before any symbol, whatever the answer was priced for", () => {
    const standIn = { ...STONK_QUOTE, quoteMint: 'USDCoctStandIn', symbol: 'STONK' };
    expect(stonkQuoteIn({ quote: SOL_QUOTE, quotes: [SOL_QUOTE, standIn], defaultQuoteMint: 'USDCoctStandIn' })).toBe(standIn);
    // A default the catalog does not list falls back to the symbol.
    expect(stonkQuoteIn({ quote: SOL_QUOTE, quotes: [SOL_QUOTE, STONK_QUOTE], defaultQuoteMint: 'Missing' })).toBe(STONK_QUOTE);
  });

  it('finds the $STONK entry in the catalog when the tracker defaulted to another quote', () => {
    expect(stonkQuoteIn({ quote: SOL_QUOTE, quotes: [SOL_QUOTE, STONK_QUOTE, USDC_QUOTE] })).toBe(STONK_QUOTE);
  });

  it('is null for a tracker with no $STONK quote at all', () => {
    expect(stonkQuoteIn({ quote: SOL_QUOTE, quotes: [SOL_QUOTE, USDC_QUOTE] })).toBeNull();
  });
});

describe('normalizeQuoteCategory', () => {
  it('labels $STONK by mint whatever the tracker calls it', () => {
    expect(normalizeQuoteCategory(STONK_MINT, 'custom')).toBe('stonk');
    expect(normalizeQuoteCategory('x', 'stonk')).toBe('stonk');
  });

  it("understands the tracker's words for SOL", () => {
    expect(normalizeQuoteCategory(SOL_QUOTE.quoteMint, 'native')).toBe('solana');
    expect(normalizeQuoteCategory(SOL_QUOTE.quoteMint, 'sol')).toBe('solana');
    expect(normalizeQuoteCategory(SOL_QUOTE.quoteMint, 'solana')).toBe('solana');
  });

  it('has no label for anything else', () => {
    expect(normalizeQuoteCategory('x', 'stock')).toBeNull();
    expect(normalizeQuoteCategory('x', 'currency')).toBeNull();
    expect(normalizeQuoteCategory('x', undefined)).toBeNull();
  });

  it('labels only the two categories the gallery shows', () => {
    expect(QUOTE_CATEGORY_LABELS).toEqual({ stonk: '$STONK', solana: 'Solana' });
  });
});
