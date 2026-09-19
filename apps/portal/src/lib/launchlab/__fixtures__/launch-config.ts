/**
 * A real `GET /api/launch/config?quoteMint=<STONK>` answer from the dev tracker
 * (2026-09-12), trimmed to three quotes, plus the `defaultQuoteMint` the
 * tracker added on 2026-09-14 (when it also cut `quotes` to $STONK alone).
 * Tests build launches and summaries from this exactly as the form does from
 * the live response. Every launch pairs with $STONK; SOL and USDC stay only so
 * the pricing and build tests cover a second decimals and config path.
 */

import type { QuoteCategory } from '@/lib/types/agent-token';
import type { LaunchConfig, LaunchQuote } from '../launch-config';

export const STONK_QUOTE: LaunchQuote = {
  quoteMint: '6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx',
  symbol: 'STONK',
  name: 'STONK',
  decimals: 9,
  tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  category: 'stonk',
  launchlabConfigId: '4Rb2joMnuDt9zRPuTYxUjQRGQ8oNBbKdXnCJSCojvBsW',
  minFundRaisingRaw: '1',
  enabled: true,
  sortOrder: 0,
};

export const SOL_QUOTE: LaunchQuote = {
  quoteMint: 'So11111111111111111111111111111111111111112',
  symbol: 'SOL',
  name: 'Wrapped SOL',
  decimals: 9,
  tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  category: 'solana',
  launchlabConfigId: '6s1xP3hpbAfFoNtUNF8mfHsjr2Bd97JxFJRWLbL6aHuX',
  minFundRaisingRaw: '24000000000',
  enabled: true,
  sortOrder: 1,
};

export const USDC_QUOTE: LaunchQuote = {
  quoteMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  // The tracker's own word. The portal only labels $STONK and SOL.
  category: 'currency' as unknown as QuoteCategory,
  launchlabConfigId: '8gj14w8vkNZjJTPak6e96Uf1sY438WKheH4s5dHyxiRw',
  minFundRaisingRaw: '1',
  enabled: true,
  sortOrder: 5,
};

export const LAUNCH_CONFIG: LaunchConfig = {
  programId: 'DRay6fNdQ5J82H7xV6uq2aV3mNrUZ1J4PgSKsWgptcm6',
  platformId: '6SfbLVtLKUWjEBZgXXPwKDwDbnyJYw4dp2aMvxF34qvj',
  treasury: 'HaKT7Tv8ryZBZTiom5NSdwhahuMFPkEcGvausaNbcZyh',
  transferFeeBps: 100,
  fee: {
    usd: 0.5,
    lamports: 4_901_732,
    solUsd: 102.00476443,
    pricedAt: '2026-09-12T11:09:16Z',
    stale: false,
  },
  defaultQuoteMint: STONK_QUOTE.quoteMint,
  quotes: [STONK_QUOTE, SOL_QUOTE, USDC_QUOTE],
  quote: STONK_QUOTE,
  raise: {
    raw: '32230140093987',
    units: 32230.140093987,
    minimumRaw: '1',
    basis: 'Sized so this launch is worth the same as the default 85 SOL raise',
  },
  curve: {
    configId: '4Rb2joMnuDt9zRPuTYxUjQRGQ8oNBbKdXnCJSCojvBsW',
    curveType: 'ConstantCurve',
    migrateType: 'cpmm',
    baseDecimals: 6,
    supply: '1000000000000000',
    totalSellA: '793100000000000',
    totalLockedAmount: '0',
    cliffPeriod: '0',
    unlockPeriod: '0',
    cpmmCreatorFeeOn: 0,
  },
};

/** The same config as the tracker wires it: inside a `{ data }` envelope. */
export const LAUNCH_CONFIG_ENVELOPE = { data: LAUNCH_CONFIG };

/** The config re-priced for USDC, as `?quoteMint=<USDC>` would answer. */
export const LAUNCH_CONFIG_USDC: LaunchConfig = {
  ...LAUNCH_CONFIG,
  quote: USDC_QUOTE,
  raise: {
    raw: '8670405000',
    units: 8670.405,
    minimumRaw: '1',
    basis: 'Sized so this launch is worth the same as the default 85 SOL raise',
  },
  curve: { ...LAUNCH_CONFIG.curve, configId: USDC_QUOTE.launchlabConfigId },
};
